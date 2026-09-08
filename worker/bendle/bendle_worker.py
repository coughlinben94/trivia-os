import glob
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv

# Deliberately NOT worker/bendle/.env (i.e. not load_dotenv()'s cwd-relative
# default). This directory sits inside Kingo's Tier 3 Bash scope (arbitrary
# Bash, cwd-anchored at the trivia-os repo root) — verified live 2026-09-07
# that Tier 3's gate (bash-gate.ts) only checks a path STAYS INSIDE that
# scope, with no secret-filename denylist on the Bash path (that protection
# only exists on Kingo's separate Read-tool scope, read-scope.ts). A
# service-role key here would be readable by any Tier 3 Bash command ever
# run against this repo. Application Support is unconditionally outside
# that scope regardless of what Bash runs.
load_dotenv(os.path.expanduser("~/Library/Application Support/bendle-worker/.env"))

POLL_SECONDS = 30
STEMS = ["drums", "bass", "other", "vocals"]
DOWNLOAD_TIMEOUT_SECONDS = 1800
DEMUCS_TIMEOUT_SECONDS = 3600


def build_search_query(title, artist):
    parts = [artist, title] if artist else [title]
    return " ".join(p for p in parts if p) + " official audio"


def build_ready_update(urls):
    return {
        "status": "ready",
        "drums_url": urls["drums"], "bass_url": urls["bass"],
        "other_url": urls["other"], "vocals_url": urls["vocals"],
        "error_text": None,
    }


def build_failed_update(message):
    return {"status": "failed", "error_text": message}


def get_client():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def process_song(sb, song):
    song_id = song["id"]
    with tempfile.TemporaryDirectory() as tmp:
        # %(ext)s, not a fixed "audio.wav" — yt-dlp's own recommended pattern for
        # -x/--audio-format, since the extractor's native format is unknown up
        # front and the postprocessor conversion step needs a template it controls.
        output_template = f"{tmp}/audio.%(ext)s"
        query = build_search_query(song["title"], song.get("artist"))

        # player_client fallback list (not a single client): YouTube has been
        # retiring extraction clients one at a time (yt-dlp issue #12482 broke
        # the default set; #17348 shows android itself losing formats next) —
        # a comma list lets yt-dlp fall through to whichever client still
        # works instead of hardcoding a single one that will eventually break
        # the same way. android/tv skip PO-token-gated formats and fall back
        # to a lower-bitrate format — fine for a Demucs stem-separation
        # source, quality loss is inaudible after further splitting.
        try:
            result = subprocess.run(
                [sys.executable, "-m", "yt_dlp", f"ytsearch1:{query}", "-x", "--audio-format", "wav",
                 "--extractor-args", "youtube:player_client=android,tv,web",
                 "--match-filter", "duration<900",  # reject anything over 15min — a mis-matched
                                                      # search result landing on a long video/podcast/
                                                      # livestream would otherwise mean an hours-long
                                                      # download and Demucs run on a machine shared
                                                      # with other always-on services
                 "-o", output_template],
                capture_output=True, text=True, timeout=DOWNLOAD_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"download timed out after {DOWNLOAD_TIMEOUT_SECONDS}s for \"{query}\"")
        matches = glob.glob(f"{tmp}/audio.*")
        if result.returncode != 0 or not matches:
            # Previously discarded yt-dlp's actual stderr entirely — every
            # failure looked identical regardless of real cause. Print the
            # tail of it (flush=True: launchd's log redirect is otherwise
            # block-buffered and this may never appear before the process
            # exits) so a future failure is diagnosable from the log instead
            # of requiring another live manual repro.
            print(f"[Bendle] yt-dlp failed for \"{query}\":\n{result.stderr[-2000:]}", flush=True)
            raise RuntimeError(f"couldn't find or download audio for \"{query}\"")
        audio_path = matches[0]

        demucs_out = f"{tmp}/separated"
        try:
            result = subprocess.run(
                [sys.executable, "-m", "demucs", "-n", "htdemucs", "--mp3", "-o", demucs_out, audio_path],
                capture_output=True, text=True, timeout=DEMUCS_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"stem separation timed out after {DEMUCS_TIMEOUT_SECONDS}s")
        if result.returncode != 0:
            print(f"[Bendle] demucs failed:\n{result.stderr[-2000:]}", flush=True)
            raise RuntimeError("stem separation failed — the audio may be corrupt or unsupported")

        # demucs names its output folder after the input file's stem — "audio" here,
        # since output_template above always writes to a file named audio.<ext>.
        stem_dir = f"{demucs_out}/htdemucs/audio"
        urls = {}
        for stem in STEMS:
            local_path = f"{stem_dir}/{stem}.mp3"
            if not Path(local_path).exists():
                raise RuntimeError(f"missing {stem} stem after separation")
            storage_path = f"bendle/{song_id}/{stem}.mp3"
            with open(local_path, "rb") as f:
                sb.storage.from_("trivia-show-media").upload(
                    storage_path, f, {"content-type": "audio/mpeg", "upsert": "true"}
                )
            urls[stem] = sb.storage.from_("trivia-show-media").get_public_url(storage_path)

        sb.table("bendle_songs").update(build_ready_update(urls)).eq("id", song_id).execute()


def run_once(sb):
    rows = (
        sb.table("bendle_songs").select("*").eq("status", "requested")
        .order("created_at").limit(1).execute().data
    )
    if not rows:
        return False
    song = rows[0]
    # .eq("status", "requested") on the claim itself, not just .eq("id", ...):
    # if a second worker (or a manual test run) claimed this exact row between
    # our select above and this update, this update matches zero rows and
    # PostgREST returns an empty .data — detected below so we back off rather
    # than double-process the same song (two workers racing to separate the
    # same song can otherwise upload a Frankenstein mix: drums from one
    # extracted video, bass from another, if ytsearch1 returns different
    # results between the two runs).
    claim = (
        sb.table("bendle_songs").update({"status": "processing"})
        .eq("id", song["id"]).eq("status", "requested").execute()
    )
    if not claim.data:
        return True
    try:
        process_song(sb, song)
    except Exception as e:
        sb.table("bendle_songs").update(build_failed_update(str(e))).eq("id", song["id"]).execute()
    return True


def recover_stuck_jobs(sb):
    # Only one worker process is EXPECTED to run (this launchd job, KeepAlive-
    # restarted on crash). A row stuck 'processing' means the previous attempt
    # died mid-work (crash, kill, network blip during the final status write)
    # and nothing else will ever pick it back up — run_once only ever queries
    # 'requested'. Marks failed with a clear retry message rather than
    # requeueing: requeueing a row that crashed the PROCESS itself (not a
    # subprocess) risks a silent crash loop with no attempt counter. The
    # plain manual-retry path (delete the row, pick the song again) the UI
    # already offers for any failure is the safe recovery here too. Called
    # both at startup AND on every idle poll cycle (not just startup) so a
    # row that gets stuck mid-run (the failed-update write itself failing,
    # e.g. a network blip) self-heals within one poll interval instead of
    # sitting "Processing" until the next full process restart.
    sb.table("bendle_songs").update(build_failed_update(
        "worker restarted mid-job — pick the song again"
    )).eq("status", "processing").execute()


def main_loop():
    sb = get_client()
    recover_stuck_jobs(sb)
    while True:
        try:
            did_work = run_once(sb)
        except Exception as e:
            print(f"worker loop error: {e}", flush=True)
            did_work = False
        if not did_work:
            recover_stuck_jobs(sb)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main_loop()
