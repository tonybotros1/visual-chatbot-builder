from app.api.routes.conversations import _answer_text, _plain


def test_question_text_is_plain_and_compact() -> None:
    assert _plain("<p>Are you a <strong>patient</strong>&nbsp;or a physician?</p>") == "Are you a patient or a physician?"
    assert _plain(None) == ""
    assert len(_plain("x" * 500)) == 300


def test_answers_show_the_labels_visitors_clicked() -> None:
    choices = {"en": "English", "ar": "العربية"}
    assert _answer_text("en", choices) == "English"
    assert _answer_text(["en", "ar"], choices) == "English, العربية"
    assert _answer_text("free text", {}) == ""
