from common.nltk_setup import candidate_data_dirs, ensure_nltk_data


def test_candidate_dirs_include_repo_nltk_data():
    dirs = [str(path) for path in candidate_data_dirs()]
    assert any(path.endswith("nltk_data") for path in dirs)


def test_ensure_nltk_data_makes_punkt_tab_findable():
    ensure_nltk_data()
    import nltk

    nltk.data.find("tokenizers/punkt_tab")
