"""Re-separates a song via BS-Roformer-SW in a single pass, uploading all 5
stems the show uses (guitar, bass, drums, other, vocals — piano dropped, no
piano in the show's music).

Runs from its own throwaway venv (see guitar-stem-requirements.txt) — never
merged into bendle_worker.py's requirements.txt / htdemucs pipeline, kept
separate so the launchd worker's one real dependency stays Demucs. Two ways
this gets invoked: by hand (as originally built), or launched detached by
bendle_worker.py's poll loop when a host clicks "Add Guitar" in BendleAdmin
(guitar_status='requested' -> this script -> 'ready'/'failed'). Either way
sets guitar_status/guitar_error on the row so BendleAdmin's realtime
subscription can show progress without polling this process directly.

Why a single SW pass instead of Demucs-then-SW: SW is natively a 6-stem
model (vocals/drums/bass/guitar/piano/other) that takes the raw mix
directly, so its 5 stems (piano dropped) already sum back to the original
mix cleanly (one model, consistent masks) — chaining Demucs first would
mean SW re-separating Demucs's already-lossy "other" bucket instead of the
real mix. See council debate 2026-09-14 / project_trivia_jukebox memory.

The guitar stem gets an extra htdemucs "refine" pass afterward — a
by-ear call (Ben preferred it over raw SW output on Hotel California),
kept even though it's theoretically odd (htdemucs trained on full mixes,
not isolated guitar). Applies to guitar only, not the other 4 stems.

Usage:
  python guitar_stem.py <song_id> <source_audio> [--overlap 2] [--no-refine]

Requires the vendored BS-Roformer-SW checkpoint (BENDLE_SW_MODELS_DIR env
var, default ~/bendle-sw-models, checksummed in CHECKSUMS.sha256 there) —
never fetched at runtime, the original HuggingFace repo 401s.
"""
import argparse
import functools
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from bendle_worker import build_ready_update, get_client, normalize_stem  # noqa: E402

MODELS_DIR = os.environ.get("BENDLE_SW_MODELS_DIR", os.path.expanduser("~/bendle-sw-models"))
CKPT, YAML = "BS-Roformer-SW.ckpt", "bs_roformer_sw.yaml"
UPLOAD_STEMS = ["guitar", "bass", "drums", "other", "vocals"]  # piano dropped


def separate(source_audio, out_dir, overlap):
    import torch
    import soundfile as sf
    from audio_separator.separator import Separator

    torch.load = functools.partial(torch.load, weights_only=True)  # safe pickle load, explicit

    sep = Separator(
        log_level=logging.INFO, model_file_dir=MODELS_DIR, output_dir=out_dir,
        mdxc_params={"segment_size": 513, "override_model_segment_size": True, "batch_size": 1, "overlap": overlap},
    )
    # 0.18.0 can't resolve this checkpoint by name (not in its built-in
    # catalog) — point it straight at the vendored files instead.
    sep.download_model_files = lambda name: (CKPT, "MDXC", "BS Roformer SW", os.path.join(MODELS_DIR, CKPT), YAML)
    sep.load_model(CKPT)
    m = sep.model_instance
    mix = m.prepare_mix(source_audio)
    sources = m.demix(mix=mix)  # single pass -> all 6 stems natively
    paths = {}
    for stem, audio in sources.items():
        p = os.path.join(out_dir, f"{stem}.wav")
        sf.write(p, audio.T, m.sample_rate, subtype="PCM_16")
        paths[stem] = p
    return paths


def refine_guitar(guitar_wav, out_dir):
    refine_dir = os.path.join(out_dir, "refine")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "demucs", "-n", "htdemucs", "-o", refine_dir, guitar_wav],
            capture_output=True, text=True, timeout=1800,
        )
    except subprocess.TimeoutExpired:
        print("[guitar_stem] refine pass timed out, keeping raw guitar stem", flush=True)
        return guitar_wav
    if result.returncode != 0:
        print(f"[guitar_stem] refine pass failed, keeping raw guitar stem:\n{result.stderr[-1000:]}", flush=True)
        return guitar_wav
    refined = os.path.join(refine_dir, "htdemucs", Path(guitar_wav).stem, "other.wav")
    return refined if os.path.exists(refined) else guitar_wav


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("song_id")
    parser.add_argument("source_audio")
    # 4 is the value proven working end-to-end (2026-09-14 test run). Lower
    # numbers are NOT faster here despite typical "overlap" naming intuition
    # — empirically reciprocal (overlap=2 -> 196 chunks, overlap=4 -> 98,
    # same song: chunks * overlap ~= constant). Don't drop this to "speed up"
    # without re-measuring; a prior recommendation to do so had the
    # direction backwards for this audio-separator version.
    parser.add_argument("--overlap", type=int, default=4)
    parser.add_argument("--no-refine", action="store_true")
    parser.add_argument("--out-dir", default=None)
    # Cleanup defaults ON now that this runs unattended (auto-triggered),
    # not just by-hand where inspecting /tmp afterward was occasionally
    # useful — repeated auto-runs left uncleaned would otherwise fill
    # bens-server's disk with ~700MB+ of intermediate wavs each.
    parser.add_argument("--keep-temp", action="store_true")
    args = parser.parse_args()

    out_dir = args.out_dir or f"/tmp/guitar_stem_{args.song_id}"
    os.makedirs(out_dir, exist_ok=True)

    print(f"[guitar_stem] separating {args.source_audio} (overlap={args.overlap})...", flush=True)
    stems = separate(args.source_audio, out_dir, args.overlap)
    print(f"[guitar_stem] wrote stems: {list(stems)}", flush=True)

    if not args.no_refine:
        print("[guitar_stem] refining guitar stem via htdemucs...", flush=True)
        stems["guitar"] = refine_guitar(stems["guitar"], out_dir)

    sb = get_client()
    urls = {}
    for stem in UPLOAD_STEMS:
        print(f"[guitar_stem] encoding + uploading {stem}...", flush=True)
        upload_path = normalize_stem(stems[stem])
        storage_path = f"bendle/{args.song_id}/{stem}.mp3"
        with open(upload_path, "rb") as f:
            sb.storage.from_("trivia-show-media").upload(
                storage_path, f, {"content-type": "audio/mpeg", "upsert": "true"}
            )
        urls[stem] = sb.storage.from_("trivia-show-media").get_public_url(storage_path)

    sb.table("bendle_songs").update({
        **build_ready_update(urls), "guitar_url": urls["guitar"],
        "guitar_status": "ready", "guitar_error": None,
    }).eq("id", args.song_id).execute()
    print(f"[guitar_stem] done: {urls}", flush=True)

    if not args.keep_temp:
        shutil.rmtree(out_dir, ignore_errors=True)
        # Also the caller's downloaded source file (bendle_worker.py's
        # launch_guitar_request), not just our own out_dir — nothing else
        # cleans it up once we're done with it, and it's fire-and-forget
        # Popen so the caller can't wait to do it itself.
        Path(args.source_audio).unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Sets guitar_status='failed' regardless of WHERE it broke (model
        # load, separation, refine, upload) — bendle_worker.py's launch is
        # fire-and-forget (Popen, no wait()), so this is the only place that
        # can tell BendleAdmin's realtime subscription what happened.
        song_id = sys.argv[1] if len(sys.argv) > 1 else None
        print(f"[guitar_stem] FAILED: {e}", flush=True)
        if song_id:
            try:
                get_client().table("bendle_songs").update({
                    "guitar_status": "failed", "guitar_error": str(e)[:500],
                }).eq("id", song_id).execute()
            except Exception as report_error:
                print(f"[guitar_stem] couldn't even report the failure: {report_error}", flush=True)
        raise
