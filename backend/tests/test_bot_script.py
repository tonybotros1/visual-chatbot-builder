from pathlib import Path

from app.engine.executor import advance_flow, answer_target
from app.engine.validator import validate_flow
from app.services.bot_script import compile_script, export_script, markup_to_text, parse_script, text_to_markup
from app.services.bot_script_rules import EXAMPLE, RULES

FIXTURES = Path(__file__).parent / "fixtures"


def _errors(result) -> list[str]:
    return [issue["message"] for issue in result["issues"] if issue["severity"] == "error"]


def _node(flow, node_id):
    return next(node for node in flow["nodes"] if node["id"] == node_id)


def _edge(flow, source, handle=None):
    return next(edge["target"] for edge in flow["edges"] if edge["source"] == source and edge.get("sourceHandle") == handle)


def test_the_example_in_the_rules_builds_a_valid_flow() -> None:
    assert EXAMPLE in RULES
    result = compile_script(EXAMPLE)
    assert result["ok"], result["issues"]
    assert result["issues"] == []
    assert result["languages"] == ["en", "ar"]
    report = validate_flow(result["flow"])
    assert [issue for issue in report.issues if issue.severity == "error"] == []


def test_two_languages_build_one_shared_start_and_a_path_per_language() -> None:
    flow = compile_script(EXAMPLE)["flow"]
    ids = {node["id"] for node in flow["nodes"]}
    # Before the language question: one node holding both texts.
    assert "welcome" in ids and "welcome__en" not in ids
    welcome = _node(flow, "welcome")["data"]["label"]
    assert "Welcome to the clinic assistant." in welcome and "مرحباً بك" in welcome
    # The language question switches the chat language and sends each language down its own path.
    language = _node(flow, "language")["data"]
    assert language["variable"] == "language" and language["switch_locale"] is True
    assert language["options"] == ["English", "العربية"] and language["option_values"] == ["en", "ar"]
    assert _edge(flow, "language", "option-0") == "name__en"
    assert _edge(flow, "language", "option-1") == "name__ar"
    # After it: every step once per language, saving to the same answer name.
    assert _node(flow, "name__en")["data"]["label"] == "What is your full name?"
    assert _node(flow, "name__ar")["data"]["label"] == "ما اسمك الكامل؟"
    assert _node(flow, "name__en")["data"]["variable"] == _node(flow, "name__ar")["data"]["variable"] == "name"
    # Options show each language's label but store the same value, so results read alike.
    visit_en, visit_ar = _node(flow, "visit__en")["data"], _node(flow, "visit__ar")["data"]
    assert visit_en["options"][0] == "New patient" and visit_ar["options"][0] == "مريض جديد"
    assert visit_en["option_values"] == visit_ar["option_values"] == ["New patient", "Follow-up", "I only have a question"]
    # Arrows stay inside the language they started in.
    assert _edge(flow, "visit__ar", "option-2") == "contact__ar"
    assert _edge(flow, "visit__en", "option-0") == "symptoms__en"


def test_step_types_map_to_the_right_nodes_and_settings() -> None:
    flow = compile_script(EXAMPLE)["flow"]
    assert _node(flow, "age__en")["type"] == "numberInput"
    assert (_node(flow, "age__en")["data"]["min_value"], _node(flow, "age__en")["data"]["max_value"]) == (1, 120)
    condition = _node(flow, "adult__en")
    assert condition["type"] == "condition" and (condition["data"]["variable"], condition["data"]["operator"], condition["data"]["value"]) == ("age", ">=", "18")
    assert _edge(flow, "adult__en", "true") == "visit__en" and _edge(flow, "adult__en", "false") == "minor__en"
    multi = _node(flow, "symptoms__en")["data"]
    assert multi["single_next"] is True and (multi["min_selections"], multi["max_selections"]) == (1, 3)
    assert _edge(flow, "symptoms__en", "next") == "report__en"
    upload = _node(flow, "report__ar")["data"]
    assert upload["required"] is False and upload["max_files"] == 2 and "application/pdf" in upload["file_types"]
    yesno = _node(flow, "callback__ar")["data"]
    assert yesno["options"] == ["نعم", "لا"] and yesno["option_values"] == ["Yes", "No"]
    assert _edge(flow, "callback__ar", "option-1") == "thanks__ar"
    links = _node(flow, "contact__ar")["data"]["links"]
    assert links[0] == {"label": "اتصل بنا", "url": "+966500000000", "link_type": "phone", "new_tab": True}
    end = _node(flow, "goodbye__en")
    assert end["type"] == "thankYou" and end["data"]["cta_url"] == "https://example.com" and end["data"]["cta_label"] == "Visit our website"
    assert "<ul><li>Keep your phone nearby.</li><li>Bring your ID to the visit.</li></ul>" in _node(flow, "thanks__en")["data"]["label"]


def test_the_built_flow_runs_in_the_engine() -> None:
    flow = compile_script(EXAMPLE)["flow"]
    first = advance_flow(flow, "start", {})
    assert [node["id"] for node in first.messages] == ["welcome"]
    assert first.next_node["id"] == "language"
    target = answer_target(flow, first.next_node, "ar")
    assert target == "name__ar"
    # A minor is turned away by the condition, in Arabic.
    after_age = advance_flow(flow, "adult__ar", {"age": 15})
    assert after_age.completed and after_age.next_node["id"] == "minor__ar"
    after_age = advance_flow(flow, "adult__ar", {"age": 30})
    assert after_age.next_node["id"] == "visit__ar"


def test_one_language_needs_no_language_question() -> None:
    result = compile_script("languages: ar\n\n[hello] message\ntext: مرحبا\n\n[name] text\ntext: ما اسمك؟\n\n[bye] end\ntext: شكراً {{name}}\n")
    assert result["ok"], result["issues"]
    ids = [node["id"] for node in result["flow"]["nodes"]]
    assert ids == ["start", "hello", "name", "bye"]
    assert _node(result["flow"], "name")["data"]["variable"] == "name"


def test_a_language_question_is_added_when_it_is_left_out() -> None:
    result = compile_script("languages: en, ar\n\n[hello] message\nen: Hello\nar: مرحبا\n\n[bye] end\nen: Bye\nar: وداعاً\n")
    assert result["ok"], result["issues"]
    flow = result["flow"]
    assert _edge(flow, "start") == "language"
    assert _edge(flow, "language", "option-1") == "hello__ar"


def test_the_real_thabit_document_builds_and_survives_a_round_trip() -> None:
    source = (FIXTURES / "thabit_physician.botscript").read_text(encoding="utf-8")
    result = compile_script(source)
    assert result["ok"], result["issues"]
    assert result["issues"] == []
    assert result["steps"] == 26 and result["nodes"] == 51
    flow = result["flow"]
    assert _edge(flow, "referral__ar", "option-2") == "not_now__ar"
    assert "{{physician_name}}" in _node(flow, "signature__en")["data"]["label"]
    assert _node(flow, "contact_email__en")["data"]["required"] is False

    exported = export_script(flow, "THABIT")
    assert exported["warnings"] == [] and exported["languages"] == ["en", "ar"]
    welcome = exported["code"].split("[welcome] message")[1].split("[language]")[0]
    assert welcome.index("en: ") < welcome.index("ar: ")  # languages keep the bot's own order
    again = compile_script(exported["code"])
    assert again["ok"], again["issues"]
    assert sorted(node["id"] for node in again["flow"]["nodes"]) == sorted(node["id"] for node in flow["nodes"])
    assert len(again["flow"]["edges"]) == len(flow["edges"])
    for node in flow["nodes"]:
        assert _node(again["flow"], node["id"])["data"].get("label") == node["data"].get("label"), node["id"]


def test_mistakes_are_reported_with_their_line_and_a_suggestion() -> None:
    source = "\n".join([
        "languages: en, ar",          # 1
        "",                           # 2
        "[hello] mesage",             # 3  unknown type
        "en: Hi",                     # 4
        "",                           # 5
        "[name] text",                # 6  no Arabic text
        "en: Your name?",             # 7
        "",                           # 8
        "[pick] choice",              # 9
        "en: Pick one",               # 10
        "ar: اختر",                   # 11
        "- Yes | نعم -> nmae",        # 12 unknown target
        "- Only one label here | x | y",  # 13 wrong label count
        "",                           # 14
        "[name] end",                 # 15 duplicate name
        "en: Bye",                    # 16
        "ar: وداعاً",                 # 17
    ])
    result = compile_script(source)
    assert result["ok"] is False and result["flow"] is None
    by_line = {issue["line"]: issue["message"] for issue in result["issues"] if issue["severity"] == "error"}
    assert 'Did you mean "message"?' in by_line[3]
    assert "no Arabic text" in by_line[6]
    assert 'Did you mean "name"?' in by_line[12]
    assert "3 labels" in by_line[13]
    assert "already used on line 6" in by_line[15]


def test_structure_problems_are_caught() -> None:
    # no end step, and a last step that leads nowhere
    result = compile_script("languages: en\n\n[a] message\ntext: Hi\n\n[b] text\ntext: Name?\n")
    assert any("never ends" in message for message in _errors(result))
    assert any("does not lead anywhere" in message for message in _errors(result))
    # a condition on an answer nobody saves
    result = compile_script("languages: en\n\n[c] condition\nif: agee > 3\n\n[a] number\nsave: age\ntext: Age?\n\n[z] end\ntext: Bye\n")
    assert any('checks "agee"' in message and 'Did you mean "age"?' in message for message in _errors(result))
    # a message with options, a multi with arrows, an end with an arrow
    result = compile_script("languages: en\n\n[m] message\ntext: Hi\n- one\n\n[q] multi\ntext: Pick\n- a -> z\n\n[z] end\ntext: Bye\n-> m\n")
    messages = " ".join(_errors(result))
    assert "A message cannot have options" in messages and "cannot have its own arrow" in messages and "finishes the chat" in messages
    # a step nothing leads to is a warning, not an error
    result = compile_script("languages: en\n\n[a] message\ntext: Hi\n-> z\n\n[lost] message\ntext: ?\n-> z\n\n[z] end\ntext: Bye\n")
    assert result["ok"] and [issue["step"] for issue in result["issues"] if issue["severity"] == "warning"] == ["lost"]
    # jumping from before the language question to a step after it
    result = compile_script("languages: en, ar\n\n[a] message\nen: Hi\nar: مرحبا\n-> c\n\n[l] language\n\n[c] end\nen: Bye\nar: وداعاً\n")
    assert any("comes before the language question" in message for message in _errors(result))


def test_reader_is_forgiving_about_how_the_code_was_pasted() -> None:
    pasted = "```\nLanguages: English, Arabic\r\n\r\n[hi] Message\r\nEN: Hello‏\r\nAR: ‫مرحبا‬\r\n\r\n# a note\r\n[bye] finish\r\nen: Bye\r\nar: وداعاً\r\n```\n"
    result = compile_script(pasted)
    assert result["ok"], result["issues"]
    assert result["languages"] == ["en", "ar"]
    assert _node(result["flow"], "hi__ar")["data"]["label"] == "مرحبا"
    # no languages line at all: inferred from the text lines, with a warning
    result = compile_script("[hi] message\nen: Hello\nar: مرحبا\n\n[bye] end\nen: Bye\nar: وداعاً\n")
    assert result["ok"] and result["languages"] == ["en", "ar"]
    assert any("assumed" in issue["message"] for issue in result["issues"])
    assert compile_script("")["ok"] is False
    assert compile_script("just some words")["ok"] is False


def test_notes_from_the_author_are_shown_to_the_owner() -> None:
    source = "languages: en\n\n# just a comment\n# NOTE: The document gives no hotline number.\n[bye] end\ntext: Bye\n"
    result = compile_script(source)
    assert result["ok"]
    notes = [issue for issue in result["issues"] if issue["severity"] == "warning"]
    assert len(notes) == 1 and notes[0]["line"] == 4 and notes[0]["step"] == "bye"
    assert notes[0]["message"] == "Note from the code's author: The document gives no hotline number."


def test_the_rules_keep_the_code_faithful_to_the_document() -> None:
    assert "STAY FAITHFUL TO THE DOCUMENT" in RULES
    assert "Every field is" in RULES and "required unless the document says it is optional" in RULES.replace("\n     ", " ")
    assert "# NOTE:" in RULES


def test_voxzogo_patient_script_builds_as_the_document_says() -> None:
    result = compile_script((FIXTURES / "voxzogo_patient.botscript").read_text(encoding="utf-8"))
    assert result["ok"], result["issues"]
    assert [issue for issue in result["issues"] if issue["severity"] == "error"] == []
    notes = [issue for issue in result["issues"] if issue["message"].startswith("Note from the code's author")]
    assert {note["step"] for note in notes} == {"contact_confirmation", "consent_form_page", "consent_signed", "printed_name"}
    nodes = {node["id"]: node for node in result["flow"]["nodes"]}
    # Nothing the document does not have: no upload, no invented "continue" questions.
    assert not any(node["type"] == "fileUpload" for node in nodes.values())
    # Only the e-mail "if available" is optional.
    optional = sorted(node_id for node_id, node in nodes.items() if node["data"].get("required") is False)
    assert optional == ["contact_email__ar", "contact_email__en"]
    # The Arabic keeps its vowel marks.
    assert "مرحبًا" in str(nodes["welcome"]["data"])


def test_text_markup_round_trip() -> None:
    text = "First line\nSecond line\n\nNew paragraph\n* one\n* two"
    markup = text_to_markup(text)
    assert markup == "First line<br>Second line<br><br>New paragraph<ul><li>one</li><li>two</li></ul>"
    assert markup_to_text(markup) == text
    assert markup_to_text("<strong>Bold</strong> &amp; plain<br/>next") == "**Bold** & plain\nnext"


def test_an_ordinary_canvas_flow_is_written_as_single_language_code() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {"label": "Start"}},
            {"id": "textInput-3f2a9b1c", "type": "textInput", "data": {"label": "Your name?", "variable": "name", "required": True}},
            {"id": "pick", "type": "singleChoice", "data": {"label": "Pick", "variable": "pick", "options": ["A", "B"], "option_values": ["A", "B"]}},
            {"id": "pay", "type": "payment", "data": {"label": "Pay now", "variable": "payment"}},
            {"id": "bye", "type": "thankYou", "data": {"label": "Bye {{name}}", "cta_label": "", "cta_url": ""}},
            {"id": "other", "type": "end", "data": {"label": "Other end"}},
        ],
        "edges": [
            {"source": "start", "target": "textInput-3f2a9b1c"},
            {"source": "textInput-3f2a9b1c", "target": "pick"},
            {"source": "pick", "target": "bye", "sourceHandle": "option-0"},
            {"source": "pick", "target": "pay", "sourceHandle": "option-1"},
            {"source": "pay", "target": "other"},
        ],
    }
    exported = export_script(flow)
    assert exported["languages"] == ["en"]
    assert any("payment" in warning for warning in exported["warnings"])
    assert "[step_1] text" in exported["code"] and "text: Your name?" in exported["code"]
    script = parse_script(exported["code"])
    assert [step.kind for step in script.steps] == ["text", "choice", "end", "end"]
