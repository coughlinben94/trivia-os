import glob
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

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

        # player_client=android works around YouTube's SABR-streaming rollout
        # breaking the default web-client extraction path as of late 2025/2026
        # (yt-dlp issue #12482 — "the page needs to be reloaded", every
        # extraction fails with the default client set). Discovered live
        # during Task 8's smoke test: real songs failed 100% of the time
        # without this. android skips the PO-token-gated formats and falls
        # back to a lower-bitrate but perfectly adequate format for a stem-
        # separation source — quality loss here is inaudible after Demucs
        # splits it further. Revisit if yt-dlp ships a real fix upstream.
        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp", f"ytsearch1:{query}", "-x", "--audio-format", "wav",
             "--extractor-args", "youtube:player_client=android", "-o", output_template],
            capture_output=True, text=True,
        )
        matches = glob.glob(f"{tmp}/audio.*")
        if result.returncode != 0 or not matches:
            raise RuntimeError(f"couldn't find or download audio for \"{query}\"")
        audio_path = matches[0]

        demucs_out = f"{tmp}/separated"
        result = subprocess.run(
            [sys.executable, "-m", "demucs", "-n", "htdemucs", "--mp3", "-o", demucs_out, audio_path],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
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
    sb.table("bendle_songs").update({"status": "processing"}).eq("id", song["id"]).execute()
    try:
        process_song(sb, song)
    except Exception as e:
        sb.table("bendle_songs").update(build_failed_update(str(e))).eq("id", song["id"]).execute()
    return True


def recover_stuck_jobs(sb):
    # Only one worker process ever runs (this launchd job, KeepAlive-restarted on
    # crash) — so any row still 'processing' at startup was mid-work when the
    # previous run died (crash, reboot, kill). Nothing else will ever pick it back
    # up otherwise: it would sit "Processing" in the UI forever. Safe to requeue
    # unconditionally under that single-worker assumption; would need a real lease/
    # timeout scheme if a second worker instance were ever added.
    sb.table("bendle_songs").update({"status": "requested"}).eq("status", "processing").execute()


def main_loop():
    sb = get_client()
    recover_stuck_jobs(sb)
    while True:
        try:
            did_work = run_once(sb)
        except Exception as e:
            print(f"worker loop error: {e}")
            did_work = False
        if not did_work:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main_loop()
