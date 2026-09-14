from subprocess import TimeoutExpired
from unittest.mock import patch, Mock
from bendle_worker import build_search_query, build_ready_update, normalize_stem

def test_build_search_query_combines_artist_and_title():
    assert build_search_query("Hey Jude", "The Beatles") == "The Beatles Hey Jude official audio"

def test_build_search_query_handles_missing_artist():
    assert build_search_query("Hey Jude", None) == "Hey Jude official audio"

def test_build_ready_update_shape():
    urls = {"drums": "https://x/drums.mp3", "bass": "https://x/bass.mp3",
            "other": "https://x/other.mp3", "vocals": "https://x/vocals.mp3"}
    update = build_ready_update(urls)
    assert update == {
        "status": "ready",
        "drums_url": urls["drums"], "bass_url": urls["bass"],
        "other_url": urls["other"], "vocals_url": urls["vocals"],
        "error_text": None,
    }

def test_normalize_stem_raises_when_loudnorm_and_plain_encode_both_fail():
    # Source is lossless WAV now, not an already-valid mp3 — a total ffmpeg
    # failure has no safe raw-bytes fallback (wrong format for the .mp3
    # storage path / audio/mpeg content-type), so it must raise, not
    # silently upload something broken.
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=False):
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = "some ffmpeg error"
        try:
            normalize_stem("/tmp/drums.wav")
            assert False, "expected RuntimeError"
        except RuntimeError:
            pass

def test_normalize_stem_falls_back_to_plain_encode_when_loudnorm_fails():
    # First ffmpeg call (loudnorm) fails; second (plain encode) succeeds.
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=True):
        loudnorm_result, plain_result = Mock(), Mock()
        loudnorm_result.returncode = 1
        loudnorm_result.stderr = "loudnorm choked"
        plain_result.returncode = 0
        mock_run.side_effect = [loudnorm_result, plain_result]
        assert normalize_stem("/tmp/drums.wav") == "/tmp/drums_plain.mp3"

def test_normalize_stem_uses_320k_bitrate_explicitly():
    # The whole point of the fix: never rely on ffmpeg's silent 128k
    # libmp3lame default again.
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=True):
        mock_run.return_value.returncode = 0
        normalize_stem("/tmp/drums.wav")
        args = mock_run.call_args[0][0]
        assert "-b:a" in args and args[args.index("-b:a") + 1] == "320k"

def test_normalize_stem_happy_path_applies_loudnorm_filter():
    # A regression that silently drops the loudnorm filter from the
    # happy-path call would otherwise pass every other test here.
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=True):
        mock_run.return_value.returncode = 0
        normalize_stem("/tmp/drums.wav")
        args = mock_run.call_args[0][0]
        assert "-af" in args and args[args.index("-af") + 1].startswith("loudnorm=")

def test_normalize_stem_plain_fallback_omits_loudnorm_filter():
    # The fallback is deliberately un-normalized — confirms it doesn't
    # accidentally inherit the loudnorm filter from the failed first pass.
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=True):
        loudnorm_result, plain_result = Mock(), Mock()
        loudnorm_result.returncode = 1
        loudnorm_result.stderr = "loudnorm choked"
        plain_result.returncode = 0
        mock_run.side_effect = [loudnorm_result, plain_result]
        normalize_stem("/tmp/drums.wav")
        plain_call_args = mock_run.call_args_list[1][0][0]
        assert "-af" not in plain_call_args

def test_normalize_stem_plain_encode_timeout_raises_runtime_error():
    # Tier-2 fallback must convert a timeout to RuntimeError too, not just
    # tier-1 — otherwise a raw TimeoutExpired escapes the "raises cleanly
    # if both attempts fail" contract.
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=False):
        loudnorm_result = Mock()
        loudnorm_result.returncode = 1
        loudnorm_result.stderr = "loudnorm choked"
        mock_run.side_effect = [loudnorm_result, TimeoutExpired(cmd="ffmpeg", timeout=120)]
        try:
            normalize_stem("/tmp/drums.wav")
            assert False, "expected RuntimeError"
        except RuntimeError:
            pass
