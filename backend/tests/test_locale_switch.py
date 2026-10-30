from app.engine.subflows import (
    LoadedFlow,
    advance_runtime,
    apply_runtime_answer,
    initial_runtime_state,
    locale_code_from_answer,
)


FLOW = {
    "nodes": [
        {"id": "start", "type": "start", "data": {}},
        {"id": "language", "type": "singleChoice", "data": {"label": "Language?", "variable": "language", "options": ["English", "العربية"], "option_values": ["en", "ar"]}},
        {"id": "colour", "type": "singleChoice", "data": {"label": "Colour?", "variable": "colour", "options": ["Red", "Blue"]}},
        {"id": "done", "type": "end", "data": {"label": "Done"}},
    ],
    "edges": [
        {"source": "start", "target": "language"},
        {"source": "language", "sourceHandle": "option-0", "target": "colour"},
        {"source": "language", "sourceHandle": "option-1", "target": "colour"},
        {"source": "colour", "sourceHandle": "option-0", "target": "done"},
        {"source": "colour", "sourceHandle": "option-1", "target": "done"},
    ],
}


def loader(kind: str, version_id: str) -> LoadedFlow:
    return LoadedFlow(kind=kind, version_id=version_id, flow=FLOW, input_schema={}, output_schema={}, published=True)


def _at_language_question() -> dict:
    state = initial_runtime_state("version", "start")
    result = advance_runtime(loader, state)
    assert result.next_node["id"] == "language"
    return result.runtime_state


def test_choosing_arabic_switches_locale_and_direction() -> None:
    state, _, _ = apply_runtime_answer(loader, _at_language_question(), "language", "ar")
    assert state["locale"] == "ar"
    assert state["direction"] == "rtl"


def test_choosing_english_keeps_ltr() -> None:
    state, _, _ = apply_runtime_answer(loader, _at_language_question(), "language", "en")
    assert state["locale"] == "en"
    assert state["direction"] == "ltr"


def test_other_choices_do_not_touch_locale() -> None:
    state, _, _ = apply_runtime_answer(loader, _at_language_question(), "language", "ar")
    state, _, _ = apply_runtime_answer(loader, state, "colour", "Red")
    assert state["locale"] == "ar"
    assert state["direction"] == "rtl"


def test_language_names_map_to_codes() -> None:
    assert locale_code_from_answer("العربية") == "ar"
    assert locale_code_from_answer("English") == "en"
    assert locale_code_from_answer("en-GB") == "en-gb"
    assert locale_code_from_answer("Yes, proceed") is None
    assert locale_code_from_answer("xx-not-a-locale") is None
    assert locale_code_from_answer("zh-Hant") == "zh-hant"
    assert locale_code_from_answer("") is None
