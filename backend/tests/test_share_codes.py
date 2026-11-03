from app.api.routes.bots import SHARE_CODE_ALPHABET


def test_share_code_alphabet_avoids_look_alikes() -> None:
    for ambiguous in "0O1lI":
        assert ambiguous not in SHARE_CODE_ALPHABET
    assert len(set(SHARE_CODE_ALPHABET)) == len(SHARE_CODE_ALPHABET) >= 50
