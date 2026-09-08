from bendle_worker import build_search_query, build_ready_update

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
