from unittest.mock import patch
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

def test_normalize_stem_falls_back_to_original_on_ffmpeg_failure():
    with patch("bendle_worker.subprocess.run") as mock_run, \
         patch("bendle_worker.Path.exists", return_value=False):
        mock_run.return_value.returncode = 1
        mock_run.return_value.stderr = "some ffmpeg error"
        assert normalize_stem("/tmp/drums.mp3") == "/tmp/drums.mp3"
