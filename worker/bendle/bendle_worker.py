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
DOWNLOAD_TIMEOUT_SECONDS = 1800
# 40min: generous headroom over guitar_stem.py's own internal budget (the
# SW separation pass itself, plus its optional up-to-30min htdemucs guitar
# refine substep) — this is now the ceiling for every song, not just an
# occasional guitar top-up.
SW_TIMEOUT_SECONDS = 2400

# guitar_stem.py lives in its own throwaway venv (audio-separator + torch),
# deliberately never merged into this file's requirements.txt — see its own
# docstring. Invoked via that venv's own interpreter, not sys.executable.
SW_VENV_PYTHON = os.path.expanduser("~/bendle-sw-venv/bin/python3")
GUITAR_TMP_DIR = os.path.expanduser("~/.bendle-guitar-tmp")


def build_search_query(title, artist):
    parts = [artist, title] if artist else [title]
    return " ".join(p for p in parts if p) + " official audio"


def normalize_stem(local_path):
    # Loudness-normalizes one separated stem before upload AND is the single
    # lossy encode in the pipeline: Demucs now writes lossless WAV (no
    # --mp3 flag, see process_song), so this is the only place PCM turns
    # into mp3 — explicit -b:a 320k matches Demucs' own former default.
    # (Previously Demucs encoded to 320k mp3 itself and this step re-encoded
    # THAT down to ffmpeg's silent default of 128k mp3 — a double-lossy
    # re-encode that quietly halved stem quality on every song. 2026-09-14
    # audit caught it via docs, not audible listening — nobody had chosen
    # 128k, it was just ffmpeg's unset-bitrate default.)
    # The app layers drums/bass/other at equal 0dB gain once faded in
    # (ShinyBendleQuestion.jsx never applies a per-stem gain), but raw
    # Demucs output isn't level-matched across stems — the 2026-09-08 audio
    # audit measured "other" ~6dB and vocals ~4.4dB quieter than drums/bass
    # on a real song (no clipping or bleed otherwise). Single-pass EBU R128
    # loudnorm, not two-pass: good enough to even out a bar-show mix, not
    # worth doubling ffmpeg runs (4 stems) for broadcast-grade accuracy.
    # TP=-1.5 leaves true-peak headroom so normalizing up a quiet stem can't
    # introduce clipping.
    normalized_path = local_path.replace(".wav", "_norm.mp3")
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", local_path, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-c:a", "libmp3lame", "-b:a", "320k", normalized_path],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0 and Path(normalized_path).exists():
            return normalized_path
        print(f"[Bendle] loudnorm failed for {local_path}, falling back to plain encode:\n{result.stderr[-1000:]}", flush=True)
    except subprocess.TimeoutExpired:
        print(f"[Bendle] loudnorm timed out for {local_path}, falling back to plain encode", flush=True)

    # Fallback skips normalization but still must produce an mp3 — the
    # source is now lossless WAV (not, as before this fix, an already-mp3
    # file safe to upload as-is), so a failed loudnorm pass can't just
    # upload local_path raw: wrong bytes for the .mp3 storage path/
    # audio/mpeg content-type. Same per-stem-tolerant pattern as before
    # (don't fail the whole song over one bad stem), one level down.
    plain_path = local_path.replace(".wav", "_plain.mp3")
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", local_path, "-c:a", "libmp3lame", "-b:a", "320k", plain_path],
            capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"plain mp3 encode timed out for {local_path}")
    if result.returncode != 0 or not Path(plain_path).exists():
        raise RuntimeError(f"couldn't encode stem to mp3: {result.stderr[-1000:]}")
    return plain_path


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


def download_source_audio(query, output_dir, timeout=DOWNLOAD_TIMEOUT_SECONDS):
    # %(ext)s, not a fixed "audio.wav" — yt-dlp's own recommended pattern for
    # -x/--audio-format, since the extractor's native format is unknown up
    # front and the postprocessor conversion step needs a template it controls.
    output_template = f"{output_dir}/audio.%(ext)s"

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
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"download timed out after {timeout}s for \"{query}\"")
    matches = glob.glob(f"{output_dir}/audio.*")
    if result.returncode != 0 or not matches:
        # Previously discarded yt-dlp's actual stderr entirely — every
        # failure looked identical regardless of real cause. Print the
        # tail of it (flush=True: launchd's log redirect is otherwise
        # block-buffered and this may never appear before the process
        # exits) so a future failure is diagnosable from the log instead
        # of requiring another live manual repro.
        print(f"[Bendle] yt-dlp failed for \"{query}\":\n{result.stderr[-2000:]}", flush=True)
        raise RuntimeError(f"couldn't find or download audio for \"{query}\"")
    return matches[0]


def process_song(sb, song):
    song_id = song["id"]
    with tempfile.TemporaryDirectory() as tmp:
        query = build_search_query(song["title"], song.get("artist"))
        audio_path = download_source_audio(query, tmp)

        # BS-Roformer-SW is the only separation pipeline now (2026-09-15,
        # Ben: "if its a better pipeline, its a better pipeline" — plain
        # htdemucs retired as the default; every song gets all 5 stems,
        # guitar included, from one SW pass instead of guitar being a
        # separate opt-in request). Shells out to guitar_stem.py's own venv
        # (own torch/audio-separator deps, kept off this process — see that
        # file's docstring) rather than importing it, same isolation the
        # guitar-only flow already relied on. Synchronous (.run, not the
        # guitar flow's detached Popen): run_once's queue is itself
        # synchronous, one song at a time, so there's nothing to keep this
        # from blocking on.
        try:
            result = subprocess.run(
                [SW_VENV_PYTHON, "guitar_stem.py", song_id, audio_path],
                cwd=os.path.dirname(os.path.abspath(__file__)),
                capture_output=True, text=True, timeout=SW_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"stem separation timed out after {SW_TIMEOUT_SECONDS}s")
        if result.returncode != 0:
            print(f"[Bendle] guitar_stem separation failed:\n{result.stderr[-2000:]}", flush=True)
            raise RuntimeError("stem separation failed — the audio may be corrupt or unsupported")
        # guitar_stem.py's own main() already did the full upload + DB
        # write (status/drums_url/.../guitar_url/guitar_status) — nothing
        # left to do here.


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


def launch_guitar_request(sb, song):
    song_id = song["id"]
    query = build_search_query(song["title"], song.get("artist"))
    song_tmp_dir = os.path.join(GUITAR_TMP_DIR, song_id)
    os.makedirs(song_tmp_dir, exist_ok=True)
    try:
        audio_path = download_source_audio(query, song_tmp_dir)
    except Exception as e:
        sb.table("bendle_songs").update(
            {"guitar_status": "failed", "guitar_error": str(e)[:500]}
        ).eq("id", song_id).execute()
        return
    # Detached (Popen, no .wait()): separation takes 10-20min and must never
    # block this loop's normal song queue. guitar_stem.py owns reporting its
    # own guitar_status/guitar_error and cleaning up audio_path when it's
    # done — this function's job ends at "the child is running."
    subprocess.Popen(
        [SW_VENV_PYTHON, "guitar_stem.py", song_id, audio_path],
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )


def check_guitar_requests(sb):
    # One guitar job at a time — bens-server also runs the jukebox worker
    # and other always-on services; several 10-20min BS-Roformer-SW passes
    # competing for CPU at once isn't worth the throughput for a feature a
    # host clicks occasionally, not in bulk.
    in_flight = (
        sb.table("bendle_songs").select("id").eq("guitar_status", "processing").limit(1).execute().data
    )
    if in_flight:
        return
    rows = (
        sb.table("bendle_songs").select("*").eq("guitar_status", "requested")
        .order("created_at").limit(1).execute().data
    )
    if not rows:
        return
    song = rows[0]
    claim = (
        sb.table("bendle_songs").update({"guitar_status": "processing"})
        .eq("id", song["id"]).eq("guitar_status", "requested").execute()
    )
    if not claim.data:
        return
    launch_guitar_request(sb, song)


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


def recover_stuck_guitar_jobs(sb):
    # Startup-only, unlike recover_stuck_jobs above — a guitar_status of
    # 'processing' does NOT mean stuck the way the main status column does.
    # Guitar jobs run detached (launch_guitar_request's Popen, no .wait()),
    # so "processing" is the expected state for the entire 10-20min a real
    # job is legitimately running; calling this every idle poll cycle would
    # falsely fail an actively-running job the very first time the loop went
    # idle. Only safe to assume orphaned at process startup, when any
    # detached child from a previous worker instance is presumably gone too.
    sb.table("bendle_songs").update({
        "guitar_status": "failed", "guitar_error": "worker restarted mid-job — request guitar again",
    }).eq("guitar_status", "processing").execute()


def main_loop():
    sb = get_client()
    recover_stuck_jobs(sb)
    recover_stuck_guitar_jobs(sb)
    while True:
        try:
            did_work = run_once(sb)
        except Exception as e:
            print(f"worker loop error: {e}", flush=True)
            did_work = False
        try:
            check_guitar_requests(sb)
        except Exception as e:
            print(f"guitar request check error: {e}", flush=True)
        if not did_work:
            recover_stuck_jobs(sb)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main_loop()
