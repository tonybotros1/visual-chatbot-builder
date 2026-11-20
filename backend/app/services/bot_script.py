"""Bot Script: write a whole chatbot as plain text and build its flow from it.

A script is a list of steps. Each step starts with `[id] type` and is followed by simple lines
(text per language, `save:`, options, arrows). `compile_script` reads a script and returns the flow
(nodes and edges) plus every problem it found, each with its line number. `export_script` writes an
existing flow back as a script. The rules shown to authors live in `RULES` below and the example in
them is compiled by the tests, so the documentation cannot drift from the reader.

Two languages: a step is written once with one text line per language. Steps before the language
question are shown once with both texts; steps after it are built once per language, so the canvas
shows an English path and an Arabic path that mirror each other.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Any

LANGUAGE_NAMES = {
    "en": "English", "ar": "العربية", "fr": "Français", "es": "Español", "de": "Deutsch",
    "tr": "Türkçe", "ur": "اردو", "hi": "हिन्दी",
}
LANGUAGE_PROMPTS = {
    "en": "Please select your preferred language.",
    "ar": "يرجى اختيار اللغة المفضلة.",
    "fr": "Veuillez choisir votre langue.",
}
YES_NO = {"en": ("Yes", "No"), "ar": ("نعم", "لا"), "fr": ("Oui", "Non"), "es": ("Sí", "No"), "de": ("Ja", "Nein"), "tr": ("Evet", "Hayır")}

# script type -> node type
STEP_TYPES = {
    "message": "message",
    "text": "textInput",
    "number": "numberInput",
    "email": "emailInput",
    "phone": "phoneInput",
    "date": "dateInput",
    "choice": "singleChoice",
    "yesno": "singleChoice",
    "multi": "multipleChoice",
    "rating": "ratingInput",
    "scale": "opinionScale",
    "upload": "fileUpload",
    "links": "links",
    "condition": "condition",
    "set": "setVariable",
    "language": "singleChoice",
    "end": "thankYou",
}
TYPE_ALIASES = {
    "msg": "message", "info": "message", "question": "text", "input": "text", "string": "text",
    "single": "choice", "select": "choice", "options": "choice", "buttons": "choice",
    "multiple": "multi", "multichoice": "multi", "multiselect": "multi", "checkbox": "multi",
    "yes_no": "yesno", "yes-no": "yesno", "boolean": "yesno",
    "mobile": "phone", "tel": "phone", "mail": "email", "file": "upload", "attachment": "upload",
    "link": "links", "if": "condition", "variable": "set", "lang": "language",
    "finish": "end", "thankyou": "end", "thanks": "end", "stop": "end",
}
INPUT_KINDS = {"text", "number", "email", "phone", "date", "choice", "yesno", "multi", "rating", "scale", "upload"}
TEXTLESS_KINDS = {"condition", "set"}
BRANCHING_KINDS = {"choice", "yesno", "language"}

LINK_KINDS = [
    "website", "email", "phone", "whatsapp", "twitter", "facebook", "instagram", "threads", "medium",
    "product_hunt", "linkedin", "snapchat", "telegram", "reach_at", "slack", "skype", "pinterest",
    "deviantart", "tiktok", "twitch", "quora", "soundcloud", "spotify", "youtube",
]
LINK_ALIASES = {"web": "website", "url": "website", "site": "website", "link": "website", "mail": "email", "call": "phone", "tel": "phone", "mobile": "phone", "x": "twitter", "wa": "whatsapp"}

FILE_TYPES = {
    "pdf": ["application/pdf"],
    "image": ["image/jpeg", "image/png"],
    "word": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"],
    "excel": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
}

PLAIN_KEYS = {"save", "required", "min", "max", "next", "if", "set", "button", "files", "types"}
ROUTE_KEYS = {"yes", "no", "then", "else", "skip"}
CONDITION_OPERATORS = ["not contains", "contains", "==", "!=", ">=", "<=", ">", "<", "not exists", "exists"]

_ARROW = r"(?:->|→|=>|⟶)"
_HEADER_RE = re.compile(r"^\[\s*([A-Za-z0-9_\-]+)\s*\]\s*([A-Za-z_\-]*)\s*$")
_OPTION_RE = re.compile(r"^-\s+(.*)$")
_ROUTE_RE = re.compile(rf"^({'|'.join(sorted(ROUTE_KEYS))})\s*{_ARROW}\s*(\S+)\s*$", re.I)
_ARROW_RE = re.compile(rf"^{_ARROW}\s*(\S+)\s*$")
_KEY_RE = re.compile(r"^([A-Za-z_]{2,12})\s*:\s?(.*)$")
_ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")
_VARIABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_LANG_RE = re.compile(r"^[a-z]{2,3}$")
# Direction marks that word processors and chat tools slip in around Arabic text.
_INVISIBLE = dict.fromkeys(map(ord, "﻿‎‏‪‫‬‭‮⁦⁧⁨⁩"))
_ARABIC = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")


@dataclass
class Issue:
    severity: str  # "error" | "warning"
    message: str
    line: int | None = None
    step: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"severity": self.severity, "message": self.message, "line": self.line, "step": self.step}


@dataclass
class Option:
    labels: list[str]
    target: str | None
    line: int


@dataclass
class Link:
    kind: str
    destination: str
    labels: list[str]
    line: int


@dataclass
class Step:
    id: str
    kind: str
    line: int | None
    texts: dict[str, str] = field(default_factory=dict)
    save: str | None = None
    required: bool = True
    minimum: float | None = None
    maximum: float | None = None
    next: str | None = None
    options: list[Option] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)
    routes: dict[str, str] = field(default_factory=dict)
    condition: tuple[str, str, str] | None = None
    assign: tuple[str, str] | None = None
    button: tuple[list[str], str] | None = None
    files: int | None = None
    types: list[str] | None = None
    broken: bool = False  # the header itself was wrong; its contents are not checked further


@dataclass
class Script:
    name: str = ""
    languages: list[str] = field(default_factory=lambda: ["en"])
    steps: list[Step] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)

    def error(self, message: str, line: int | None = None, step: str | None = None) -> None:
        self.issues.append(Issue("error", message, line, step))

    def warn(self, message: str, line: int | None = None, step: str | None = None) -> None:
        self.issues.append(Issue("warning", message, line, step))

    @property
    def has_errors(self) -> bool:
        return any(issue.severity == "error" for issue in self.issues)


def _suggest(word: str, choices: list[str]) -> str:
    match = difflib.get_close_matches(word, choices, n=1, cutoff=0.6)
    return f' Did you mean "{match[0]}"?' if match else ""


ENGLISH_NAMES = {"en": "English", "ar": "Arabic", "fr": "French", "es": "Spanish", "de": "German", "tr": "Turkish", "ur": "Urdu", "hi": "Hindi"}


def _language_name(code: str) -> str:
    """A language's name for messages to the author (the option labels use LANGUAGE_NAMES, in the language itself)."""
    return ENGLISH_NAMES.get(code, code.upper())


def _number(value: str) -> float | None:
    try:
        number = float(value.strip())
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def _split_labels(value: str) -> list[str]:
    return [part.strip() for part in value.split("|")]


# ------------------------------------------------------------------------------------------- reading


def parse_script(source: str) -> Script:
    """Read a script into steps. Never raises: every problem becomes an Issue with its line number."""
    script = Script()
    lines = source.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cleaned = [line.translate(_INVISIBLE).rstrip() for line in lines]

    declared = _declared_languages(cleaned, script)
    script.languages = declared
    text_keys = set(declared) | {"text"}

    current: Step | None = None
    text_lang: str | None = None  # the language whose text block is open, if any
    pending_blank = 0
    seen_ids: dict[str, int] = {}

    for number, raw in enumerate(cleaned, start=1):
        line = raw.strip()
        if line.startswith("```"):  # a code fence pasted along with the script
            continue
        if not line:
            if text_lang:
                pending_blank += 1
            continue
        if line.startswith("#"):
            continue

        header = _HEADER_RE.match(line)
        if header:
            step_id, kind_word = header.group(1), header.group(2).lower()
            kind = TYPE_ALIASES.get(kind_word, kind_word)
            if not kind_word:
                script.error(f'Step [{step_id}] has no type. Write the type after the brackets, for example "[{step_id}] message".', number, step_id)
                kind, broken = "message", True
            elif kind not in STEP_TYPES:
                script.error(f'"{kind_word}" is not a step type.{_suggest(kind_word, list(STEP_TYPES))} The types are: {", ".join(STEP_TYPES)}.', number, step_id)
                kind, broken = "message", True
            else:
                broken = False
            if step_id in seen_ids:
                script.error(f"The step name [{step_id}] is already used on line {seen_ids[step_id]}. Every step needs its own name.", number, step_id)
            else:
                seen_ids[step_id] = number
            current = Step(id=step_id, kind=kind, line=number, broken=broken)
            script.steps.append(current)
            text_lang, pending_blank = None, 0
            continue

        if current is None:
            key = _KEY_RE.match(line)
            if key and key.group(1).lower() in {"bot", "name", "title"}:
                script.name = key.group(2).strip()
            elif key and key.group(1).lower() in {"languages", "language", "langs"}:
                pass  # read by _declared_languages
            else:
                script.error('I do not understand this line. Before the first step only "bot:" and "languages:" are allowed. A step starts with a name in brackets, for example "[welcome] message".', number)
            continue

        option = _OPTION_RE.match(line)
        if option:
            _read_option(script, current, option.group(1).strip(), number)
            text_lang, pending_blank = None, 0
            continue

        route = _ROUTE_RE.match(line)
        if route:
            current.routes[route.group(1).lower()] = route.group(2)
            text_lang, pending_blank = None, 0
            continue

        arrow = _ARROW_RE.match(line)
        if arrow:
            current.next = arrow.group(1)
            text_lang, pending_blank = None, 0
            continue

        key = _KEY_RE.match(line)
        if key:
            word, value = key.group(1), key.group(2).strip()
            lowered = word.lower()
            if lowered in text_keys and (word == lowered or lowered != "text"):
                lang = lowered
                if lang == "text":
                    if len(declared) > 1:
                        script.error(f'This bot has {len(declared)} languages, so write one line per language ({", ".join(code + ":" for code in declared)}) instead of "text:".', number, current.id)
                    lang = declared[0]
                if lang in current.texts:
                    script.error(f'Step [{current.id}] already has {_language_name(lang)} text. Put the whole text under one "{lang}:" line.', number, current.id)
                current.texts[lang] = value
                text_lang, pending_blank = lang, 0
                continue
            if lowered in PLAIN_KEYS and word == lowered:
                _read_key(script, current, lowered, value, number)
                text_lang, pending_blank = None, 0
                continue
            if _LANG_RE.match(word) and word in LANGUAGE_NAMES and not text_lang:
                script.error(f'"{word}:" is a text line for {_language_name(word)}, but that language is not in the "languages:" line at the top ({", ".join(declared)}).', number, current.id)
                continue
            if text_lang is None:
                script.error(f'I do not understand "{word}:".{_suggest(lowered, sorted(PLAIN_KEYS | text_keys))}', number, current.id)
                continue
            if lowered in PLAIN_KEYS and len(value.split()) <= 3:
                script.warn(f'This line was read as part of the text above it. If you meant the keyword, write it in lowercase: "{lowered}:".', number, current.id)
            else:
                near = difflib.get_close_matches(lowered, sorted(PLAIN_KEYS | set(declared)), n=1, cutoff=0.75)
                if near and word == lowered and len(value.split()) <= 3:
                    script.warn(f'This line was read as part of the text above it. If you meant "{near[0]}:", fix the spelling.', number, current.id)

        if text_lang is None:
            script.error("I do not understand this line. Text must start with a language, for example \"en: Hello\". Options start with \"- \" and arrows with \"->\".", number, current.id)
            continue
        # A continuation of the open text block; blank lines inside it become paragraph breaks.
        current.texts[text_lang] += ("\n" * (pending_blank + 1)) + line
        pending_blank = 0

    for step in script.steps:
        step.texts = {lang: value.strip() for lang, value in step.texts.items()}
    _check(script)
    return script


def _declared_languages(lines: list[str], script: Script) -> list[str]:
    for number, raw in enumerate(lines, start=1):
        line = raw.strip()
        if _HEADER_RE.match(line):
            break
        key = _KEY_RE.match(line)
        if key and key.group(1).lower() in {"languages", "language", "langs"}:
            codes = [part.strip().lower() for part in re.split(r"[,\s/|]+", key.group(2)) if part.strip()]
            names = {name.lower(): code for code, name in LANGUAGE_NAMES.items()} | {"english": "en", "arabic": "ar", "french": "fr"}
            codes = [names.get(code, code) for code in codes]
            bad = [code for code in codes if not _LANG_RE.match(code)]
            if bad or not codes:
                script.error(f'The "languages:" line must list language codes, for example "languages: en, ar".{" I do not know " + ", ".join(bad) + "." if bad else ""}', number)
                break
            return list(dict.fromkeys(codes))
    # No usable header: infer the languages from the text lines that are used.
    used: list[str] = []
    for raw in lines:
        key = _KEY_RE.match(raw.strip())
        if key and key.group(1) in LANGUAGE_NAMES and key.group(1) not in used:
            used.append(key.group(1))
    if used and not any(issue.severity == "error" for issue in script.issues):
        script.warn(f'There is no "languages:" line at the top, so I assumed "languages: {", ".join(used)}".', 1)
    return used or ["en"]


def _read_option(script: Script, step: Step, value: str, number: int) -> None:
    if step.kind == "links":
        match = re.match(r"^([A-Za-z_]+)\s*:\s*(.*)$", value)
        if not match:
            script.error('A link is written as "- kind: destination | label", for example "- phone: +966500000000 | Call us | اتصل بنا".', number, step.id)
            return
        kind = LINK_ALIASES.get(match.group(1).lower(), match.group(1).lower())
        if kind not in LINK_KINDS:
            script.error(f'"{match.group(1)}" is not a link kind.{_suggest(kind, LINK_KINDS)} Common kinds: website, email, phone, whatsapp.', number, step.id)
            return
        parts = _split_labels(match.group(2))
        destination, labels = parts[0], [part for part in parts[1:]]
        if not destination:
            script.error("This link has no destination (the address, e-mail or number after the colon).", number, step.id)
            return
        step.links.append(Link(kind, destination, labels, number))
        return
    target = None
    arrow = re.search(rf"\s*{_ARROW}\s*(\S+)\s*$", value)
    if arrow:
        target, value = arrow.group(1), value[: arrow.start()]
    step.options.append(Option(_split_labels(value.strip()), target, number))


def _read_key(script: Script, step: Step, key: str, value: str, number: int) -> None:
    if key == "save":
        step.save = value
    elif key == "required":
        answer = value.lower()
        if answer in {"yes", "true", "required", "y"}:
            step.required = True
        elif answer in {"no", "false", "optional", "n"}:
            step.required = False
        else:
            script.error('"required:" must be yes or no.', number, step.id)
    elif key in {"min", "max"}:
        parsed = _number(value)
        if parsed is None:
            script.error(f'"{key}:" must be a number.', number, step.id)
        elif key == "min":
            step.minimum = parsed
        else:
            step.maximum = parsed
    elif key == "next":
        step.next = value
    elif key == "if":
        step.condition = _read_condition(script, step, value, number)
    elif key == "set":
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", value)
        if not match:
            script.error('"set:" is written as "set: variable = value".', number, step.id)
        else:
            step.assign = (match.group(1), match.group(2).strip())
    elif key == "button":
        parts = _split_labels(value)
        if len(parts) < 2 or not re.match(r"^(https?://|mailto:|tel:)", parts[-1], re.I):
            script.error('"button:" is written as "button: label | https://address" (one label per language, then the address).', number, step.id)
        else:
            step.button = (parts[:-1], parts[-1])
    elif key == "files":
        parsed = _number(value)
        if parsed is None or parsed < 1:
            script.error('"files:" is how many files may be uploaded, for example "files: 3".', number, step.id)
        else:
            step.files = int(parsed)
    elif key == "types":
        kinds = [part.strip().lower() for part in re.split(r"[,\s]+", value) if part.strip()]
        bad = [kind for kind in kinds if kind not in FILE_TYPES]
        if bad:
            script.error(f'"types:" accepts {", ".join(FILE_TYPES)}. I do not know {", ".join(bad)}.', number, step.id)
        else:
            step.types = kinds


def _read_condition(script: Script, step: Step, value: str, number: int) -> tuple[str, str, str] | None:
    for operator in CONDITION_OPERATORS:
        pattern = rf"^([A-Za-z_][A-Za-z0-9_]*)\s*{re.escape(operator)}\s*(.*)$" if not operator[0].isalpha() else rf"^([A-Za-z_][A-Za-z0-9_]*)\s+{re.escape(operator)}(?:\s+(.*))?$"
        match = re.match(pattern, value)
        if match:
            expected = (match.group(2) or "").strip().strip('"').strip("'")
            return (match.group(1), operator, expected)
    script.error('"if:" is written as "if: variable == value". You can compare with ==, !=, >, <, >=, <=, contains, or write "if: variable exists".', number, step.id)
    return None


# ------------------------------------------------------------------------------------------ checking


def _check(script: Script) -> None:
    languages = script.languages
    steps = script.steps
    ids = [step.id for step in steps]
    if not steps:
        if not script.has_errors:
            script.error('The code has no steps yet. A step starts with a name in brackets, for example "[welcome] message".', 1)
        return

    language_steps = [step for step in steps if step.kind == "language"]
    if language_steps and len(languages) < 2:
        script.error('A "language" step needs two or more languages in the "languages:" line at the top.', language_steps[0].line, language_steps[0].id)
    for extra in language_steps[1:]:
        script.error("There can be only one language step.", extra.line, extra.id)

    saved = {"language"} if len(languages) > 1 else set()
    for step in steps:
        if not step.broken:
            _check_step(script, step, languages, ids)
        if step.save:
            saved.add(step.save)
        if step.assign:
            saved.add(step.assign[0])
    for step in steps:
        if step.condition and step.condition[0] not in saved:
            script.error(f'The condition checks "{step.condition[0]}", but no step saves an answer under that name.{_suggest(step.condition[0], sorted(saved))}', step.line, step.id)

    if not any(step.kind == "end" for step in steps):
        script.error('The bot never ends. Add a last step such as "[goodbye] end" with a closing message.', steps[-1].line)

    # Where each step leads, to find dead ends, unreachable steps and bad crossings of the language question.
    language_index = _language_index(script)
    reached: set[str] = set()
    queue = [steps[0].id]
    position = {step.id: index for index, step in enumerate(steps)}
    while queue:
        step_id = queue.pop()
        if step_id in reached or step_id not in position:
            continue
        reached.add(step_id)
        step = steps[position[step_id]]
        for target in _targets(step, steps, position).values():
            if target is None:
                script.error(f"Step [{step.id}] does not lead anywhere: it is the last step and has no arrow. Add an end step after it, or an arrow such as \"-> goodbye\".", step.line, step.id)
            elif target in position:
                if language_index is not None and position[step.id] < language_index < position[target]:
                    script.error(f"Step [{step.id}] comes before the language question, so it cannot jump to [{target}], which comes after it. Let it continue to the language question instead.", step.line, step.id)
                queue.append(target)
    for step in steps:
        if step.id not in reached and ids.count(step.id) == 1:
            script.warn(f"Step [{step.id}] can never be reached: no step leads to it.", step.line, step.id)


def _language_index(script: Script) -> int | None:
    """Index of the language question; steps up to it are shared, steps after it are built per language."""
    if len(script.languages) < 2:
        return None
    for index, step in enumerate(script.steps):
        if step.kind == "language":
            return index
    return -1  # none written: one is added before the first step


def _targets(step: Step, steps: list[Step], position: dict[str, int]) -> dict[str, str | None]:
    """Every way out of a step: handle -> target step id (None when it leads nowhere)."""
    if step.kind == "end":
        return {}
    index = position.get(step.id, -1)
    fallthrough = steps[index + 1].id if 0 <= index < len(steps) - 1 else None
    default = step.next or fallthrough
    if step.kind == "choice":
        routes: dict[str, str | None] = {f"option-{number}": option.target or default for number, option in enumerate(step.options)}
        if not step.required:
            routes["skip"] = step.routes.get("skip") or default
        return routes
    if step.kind == "yesno":
        routes = {"option-0": step.routes.get("yes") or default, "option-1": step.routes.get("no") or default}
        if not step.required:
            routes["skip"] = step.routes.get("skip") or default
        return routes
    if step.kind == "condition":
        return {"true": step.routes.get("then") or default, "false": step.routes.get("else") or default}
    if step.kind == "multi":
        return {"next": default}
    return {"": default}


def _check_step(script: Script, step: Step, languages: list[str], ids: list[str]) -> None:
    kind, line = step.kind, step.line

    def error(message: str, at: int | None = None) -> None:
        script.error(message, at or line, step.id)

    # text
    if kind in TEXTLESS_KINDS:
        if step.texts:
            script.warn(f'A "{kind}" step shows nothing to the visitor, so its text is ignored.', line, step.id)
    elif kind != "language" or step.texts:
        for lang in languages:
            if not step.texts.get(lang):
                if len(languages) == 1:
                    error(f'Step [{step.id}] has no text. Add a line starting with "{lang}:" (or "text:").')
                else:
                    error(f'Step [{step.id}] has no {_language_name(lang)} text. Add a line starting with "{lang}:".')

    # answers
    if kind in INPUT_KINDS:
        if step.save is None:
            step.save = re.sub(r"[^A-Za-z0-9_]", "_", step.id)
            if step.save[0].isdigit():
                step.save = f"answer_{step.save}"
        elif not _VARIABLE_RE.match(step.save):
            error(f'"save: {step.save}" is not a valid name. Use letters, digits and underscores only, starting with a letter (for example "save: full_name").')
        if step.save == "language" and len(languages) > 1:
            error('The name "language" is kept for the language question. Choose another name after "save:".')
    elif step.save is not None and kind != "language":
        script.warn(f'A "{kind}" step does not ask anything, so "save:" is ignored.', line, step.id)

    # options
    if kind == "choice":
        if not step.options:
            error(f'Step [{step.id}] is a choice but has no options. Add lines such as "- Yes | نعم -> next_step".')
    elif kind == "multi":
        if not step.options:
            error(f'Step [{step.id}] is a multiple choice but has no options. Add lines starting with "- ".')
        for option in step.options:
            if option.target:
                error("In a multiple choice the visitor can pick several options, so an option cannot have its own arrow. Put one \"-> step\" line under the options instead.", option.line)
        if step.minimum is not None and step.maximum is not None and step.minimum > step.maximum:
            error('"min:" is larger than "max:".')
    elif kind == "links":
        if not step.links:
            error(f'Step [{step.id}] has no links. Add lines such as "- website: https://example.com | Visit our website".')
    elif step.options and kind not in {"links"}:
        if kind == "message":
            error('A message cannot have options. For bullet points start the line with "* ". For buttons use a "choice" step.', step.options[0].line)
        elif kind == "yesno":
            error('A yesno step writes its own Yes and No. Use "yes -> step" and "no -> step" lines, or change the type to "choice".', step.options[0].line)
        else:
            error(f'A "{kind}" step cannot have options.', step.options[0].line)
    if kind in {"choice", "multi"}:
        for option in step.options:
            if not all(option.labels):
                error("This option has an empty label.", option.line)
            elif len(option.labels) not in {1, len(languages)}:
                error(f'This option has {len(option.labels)} labels but the bot has {len(languages)} language(s). Write one label per language separated by "|", in this order: {", ".join(languages)}.', option.line)
    for link in step.links:
        if link.labels and len(link.labels) not in {1, len(languages)}:
            error(f'This link has {len(link.labels)} labels but the bot has {len(languages)} language(s). Write one label per language separated by "|".', link.line)
    if step.button and len(step.button[0]) not in {1, len(languages)}:
        error(f'"button:" needs one label per language ({", ".join(languages)}) and then the address.')
    if step.button and kind != "end":
        script.warn('"button:" only works on an end step.', line, step.id)

    # numbers
    if kind in {"rating", "scale", "number"} and step.minimum is not None and step.maximum is not None and step.minimum >= step.maximum:
        error('"min:" must be smaller than "max:".')
    if kind == "rating" and step.maximum is not None and not 2 <= step.maximum <= 10:
        error('A rating goes up to between 2 and 10 stars ("max: 5").')

    # routing words that do not belong to this type
    allowed = {"yesno": {"yes", "no", "skip"}, "condition": {"then", "else"}, "choice": {"skip"}}.get(kind, set())
    for word in step.routes:
        if word not in allowed:
            hint = {"yes": "yesno", "no": "yesno", "then": "condition", "else": "condition", "skip": "choice"}[word]
            error(f'"{word} ->" only works in a "{hint}" step.')
    if kind == "condition" and step.condition is None and not any(issue.step == step.id and issue.severity == "error" for issue in script.issues):
        error(f'Step [{step.id}] is a condition but has no "if:" line, for example "if: age >= 18".')
    if kind == "set" and step.assign is None and not any(issue.step == step.id and issue.severity == "error" for issue in script.issues):
        error(f'Step [{step.id}] has no "set:" line, for example "set: status = eligible".')
    if kind == "end" and (step.next or step.routes):
        error("An end step finishes the chat, so it cannot have an arrow.")

    # arrows must point at real steps
    named = [(step.next, line)] + [(target, line) for target in step.routes.values()] + [(option.target, option.line) for option in step.options]
    for target, at in named:
        if target and target not in ids:
            cleaned = target.strip("[]")
            if cleaned in ids:
                error(f'Write the step name without brackets after the arrow: "-> {cleaned}".', at)
            else:
                error(f'There is no step called [{target}].{_suggest(target, ids)}', at)


# ----------------------------------------------------------------------------------------- building


def text_to_markup(text: str) -> str:
    """Script text -> the chat's rich text: line breaks, and "* " lines as a bullet list. Text itself is not
    escaped here; the chat escapes everything except the few tags it allows."""
    parts: list[str] = []
    bullets: list[str] = []

    def flush() -> None:
        if bullets:
            parts.append("<ul>" + "".join(f"<li>{item}</li>" for item in bullets) + "</ul>")
            bullets.clear()

    for line in text.split("\n"):
        stripped = line.strip()
        bullet = re.match(r"^[*•]\s+(.*)$", stripped)
        if bullet:
            bullets.append(bullet.group(1))
            continue
        flush()
        parts.append(stripped)
    flush()
    result = ""
    for index, part in enumerate(parts):
        if index and not part.startswith("<ul>") and not parts[index - 1].startswith("<ul>"):
            result += "<br>"
        result += part
    return result


def _label(labels: list[str], languages: list[str], lang: str | None) -> str:
    """The label for one language, or all of them joined for a step shown before the language is chosen."""
    if len(labels) == 1:
        return labels[0]
    if lang is None:
        return " / ".join(labels)
    return labels[languages.index(lang)]


def build_flow(script: Script) -> dict[str, Any]:
    """Steps -> nodes and edges. Call only for a script without errors."""
    languages = script.languages
    steps = list(script.steps)
    language_index = _language_index(script)
    if language_index == -1:  # two languages and no language step written: add one at the very start
        steps.insert(0, Step(id=_free_id("language", [step.id for step in steps]), kind="language", line=None))
        language_index = 0
    position = {step.id: index for index, step in enumerate(steps)}

    def shared(step: Step) -> bool:
        return language_index is None or position[step.id] <= language_index

    def node_id(step: Step, lang: str | None) -> str:
        return step.id if shared(step) or lang is None else f"{step.id}__{lang}"

    nodes: list[dict[str, Any]] = [{"id": "start", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "Start"}}]
    edges: list[dict[str, Any]] = []

    def connect(source: str, target: str, handle: str = "") -> None:
        edge = {"id": f"e-{source}-{handle or 'next'}", "source": source, "target": target}
        if handle:
            edge["sourceHandle"] = handle
        edges.append(edge)

    connect("start", node_id(steps[0], None))
    row = 1
    for step in steps:
        variants: list[str | None] = [None] if shared(step) else list(languages)
        for column, lang in enumerate(variants):
            identifier = node_id(step, lang)
            x = 0 if lang is None else column * 460
            nodes.append({"id": identifier, "type": STEP_TYPES[step.kind], "position": {"x": x, "y": row * 190}, "data": _node_data(step, languages, lang)})
            targets = _targets(step, steps, position)
            if step.kind == "language":
                for number, code in enumerate(languages):
                    target = steps[position[step.id] + 1] if position[step.id] + 1 < len(steps) else None
                    explicit = step.next and steps[position[step.next]] if step.next in position else None
                    destination = explicit or target
                    if destination is not None:
                        connect(identifier, node_id(destination, code), f"option-{number}")
                continue
            for handle, target in targets.items():
                if target is not None and target in position:
                    connect(identifier, node_id(steps[position[target]], lang), handle)
        row += 1
    return {"nodes": nodes, "edges": edges}


def _free_id(base: str, taken: list[str]) -> str:
    candidate, number = base, 2
    while candidate in taken:
        candidate, number = f"{base}_{number}", number + 1
    return candidate


def _text(step: Step, languages: list[str], lang: str | None) -> str:
    if lang is not None:
        return text_to_markup(step.texts.get(lang, ""))
    present = [text_to_markup(step.texts[code]) for code in languages if step.texts.get(code)]
    return "<br><br>".join(present)


def _node_data(step: Step, languages: list[str], lang: str | None) -> dict[str, Any]:
    kind = step.kind
    data: dict[str, Any] = {"label": _text(step, languages, lang)}
    if kind == "language":
        prompts = [step.texts.get(code) or LANGUAGE_PROMPTS.get(code, "") for code in languages]
        data.update({
            "label": "<br>".join(text_to_markup(prompt) for prompt in prompts if prompt),
            "variable": "language",
            "required": True,
            "switch_locale": True,
            "options": [LANGUAGE_NAMES.get(code, code.upper()) for code in languages],
            "option_values": list(languages),
        })
        return data
    if kind in INPUT_KINDS:
        data["variable"] = step.save
        data["required"] = step.required
    if kind == "choice":
        data["options"] = [_label(option.labels, languages, lang) for option in step.options]
        # Stored values are the first language's labels, so results and conditions read the same in every language.
        data["option_values"] = [option.labels[0] for option in step.options]
    elif kind == "yesno":
        names = [YES_NO.get(code, YES_NO["en"]) for code in languages]
        yes, no = [name[0] for name in names], [name[1] for name in names]
        data["options"] = [_label(yes, languages, lang), _label(no, languages, lang)]
        data["option_values"] = ["Yes", "No"]
    elif kind == "multi":
        data["options"] = [_label(option.labels, languages, lang) for option in step.options]
        data["option_values"] = [option.labels[0] for option in step.options]
        data["single_next"] = True
        if step.minimum is not None:
            data["min_selections"] = int(step.minimum)
        if step.maximum is not None:
            data["max_selections"] = int(step.maximum)
    elif kind == "number":
        if step.minimum is not None:
            data["min_value"] = step.minimum
        if step.maximum is not None:
            data["max_value"] = step.maximum
    elif kind == "rating":
        data.update({"min_value": 1, "max_value": int(step.maximum or 5), "step": 1})
    elif kind == "scale":
        data.update({"min_value": int(step.minimum if step.minimum is not None else 0), "max_value": int(step.maximum if step.maximum is not None else 10), "step": 1})
    elif kind == "upload":
        kinds = step.types or ["pdf", "image"]
        data.update({
            "storage_provider": "local",
            "file_types": [mime for name in kinds for mime in FILE_TYPES[name]],
            "max_file_size_mb": 10,
            "max_files": step.files or 1,
        })
    elif kind == "links":
        data["links"] = [
            {"label": _label(link.labels, languages, lang) if link.labels else link.destination, "url": link.destination, "link_type": link.kind, "new_tab": True}
            for link in step.links
        ]
        data["show_link_icons"] = True
    elif kind == "condition":
        variable, operator, value = step.condition or ("", "==", "")
        data.update({"label": f"{variable} {operator} {value}".strip(), "variable": variable, "operator": operator, "value": value})
    elif kind == "set":
        variable, value = step.assign or ("", "")
        data.update({"label": f"{variable} = {value}", "variable": variable, "value": value})
    elif kind == "end":
        if step.button:
            data["cta_label"] = _label(step.button[0], languages, lang)
            data["cta_url"] = step.button[1]
        else:
            data["cta_label"] = ""
            data["cta_url"] = ""
    return data


def compile_script(source: str) -> dict[str, Any]:
    """Read, check and build. Returns issues (always) and the flow (only when there are no errors)."""
    script = parse_script(source)
    flow = None
    if not script.has_errors:
        flow = build_flow(script)
        _validate_built_flow(script, flow)
    unique: dict[tuple[int | None, str], Issue] = {}
    for issue in script.issues:
        unique.setdefault((issue.line, issue.message), issue)
    issues = sorted(unique.values(), key=lambda issue: (issue.line or 0, issue.severity != "error"))
    result: dict[str, Any] = {
        "ok": not script.has_errors,
        "issues": [issue.as_dict() for issue in issues],
        "languages": script.languages,
        "name": script.name,
        "steps": len(script.steps),
        "flow": None,
        "nodes": 0,
        "questions": sum(1 for step in script.steps if step.kind in INPUT_KINDS),
    }
    if script.has_errors or flow is None:
        return result
    result["flow"] = flow
    result["nodes"] = len(flow["nodes"])
    return result


def _validate_built_flow(script: Script, flow: dict[str, Any]) -> None:
    """The engine's own validator (the one that guards Publish) has the last word. Its findings are
    reported against the step and line they came from."""
    from app.engine.validator import validate_flow

    lines = {step.id: step.line for step in script.steps}
    # Mirrored language paths save the same answer twice by design, and unreachable steps are already reported by name.
    covered = {"duplicate_variable", "unreachable_nodes"}
    for issue in validate_flow(flow).issues:
        if issue.code in covered or issue.severity == "info":
            continue
        node_id = issue.node_ids[0] if issue.node_ids else None
        match = _MIRROR_RE.match(node_id) if node_id else None
        step_id = match.group(1) if match and match.group(1) in lines else node_id
        where = f"Step [{step_id}]: " if step_id in lines else ""
        script.issues.append(Issue("error" if issue.severity == "error" else "warning", f"{where}{issue.message}", lines.get(step_id), step_id if step_id in lines else None))


# ---------------------------------------------------------------------------------------- exporting

_NODE_KINDS = {
    "message": "message", "textInput": "text", "numberInput": "number", "emailInput": "email", "phoneInput": "phone",
    "dateInput": "date", "singleChoice": "choice", "choice": "choice", "searchableList": "choice", "multipleChoice": "multi",
    "ratingInput": "rating", "opinionScale": "scale", "rangeInput": "scale", "fileUpload": "upload", "links": "links",
    "condition": "condition", "setVariable": "set", "thankYou": "end", "end": "end", "whatsappRedirect": "end",
}
_MIRROR_RE = re.compile(r"^(.+)__([a-z]{2,3})$")


def markup_to_text(markup: str) -> str:
    """The chat's rich text -> script text (the reverse of text_to_markup, tolerant of hand-edited labels)."""
    value = str(markup or "")
    value = re.sub(r"<img\s+[^>]*alt=\"([^\"]*)\"[^>]*>", r"\1", value, flags=re.I)
    value = re.sub(r"<(ul|ol)>", "\n", value, flags=re.I)
    value = re.sub(r"<li>\s*", "* ", value, flags=re.I)
    value = re.sub(r"</li>", "\n", value, flags=re.I)
    value = re.sub(r"</(ul|ol)>", "", value, flags=re.I)
    value = re.sub(r"<br\s*/?>|</p>|</div>", "\n", value, flags=re.I)
    value = re.sub(r"<(strong|b)>(.*?)</\1>", r"**\2**", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", "", value)
    value = value.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'")
    lines = [line.strip() for line in value.split("\n")]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _split_bilingual(text: str, languages: list[str]) -> dict[str, str]:
    """A shared step's text holds every language. For English + Arabic the paragraphs are told apart by script."""
    if len(languages) == 2 and "ar" in languages:
        other = next(code for code in languages if code != "ar")
        buckets: dict[str, list[str]] = {"ar": [], other: []}
        for line in text.split("\n"):
            if not line.strip():
                continue
            buckets["ar" if _ARABIC.search(line) else other].append(line)
        if buckets["ar"] and buckets[other]:
            return {code: "\n".join(buckets[code]) for code in languages}
    return {languages[0]: text}


def _write_text(lines: list[str], key: str, text: str) -> None:
    first, *rest = (text or "").split("\n")
    lines.append(f"{key}: {first}".rstrip())
    lines.extend(rest)


def export_script(flow: dict[str, Any], name: str = "") -> dict[str, Any]:
    """Write a flow as a script. Flows built from a script come back in the same shape; other flows are
    written as a single-language script. Node types the script cannot express are listed in `warnings`."""
    nodes = {str(node.get("id")): node for node in flow.get("nodes") or [] if node.get("id")}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    for edge in flow.get("edges") or []:
        outgoing.setdefault(str(edge.get("source")), []).append(edge)
    warnings: list[str] = []

    language_node = next((node for node in nodes.values() if (node.get("data") or {}).get("switch_locale") or str((node.get("data") or {}).get("variable") or "").lower() == "language"), None)
    languages: list[str] = []
    if language_node is not None:
        values = [str(value) for value in (language_node.get("data") or {}).get("option_values") or []]
        if len(values) > 1 and all(_LANG_RE.match(value) for value in values) and any(_MIRROR_RE.match(node_id) for node_id in nodes):
            languages = values
    mirrored = bool(languages)
    if not mirrored:
        languages = ["ar"] if _mostly_arabic(nodes) else ["en"]
    primary = languages[0]

    def base(node_id: str) -> str:
        match = _MIRROR_RE.match(node_id)
        return match.group(1) if mirrored and match and match.group(2) in languages else node_id

    def variant(step_id: str, lang: str) -> dict[str, Any] | None:
        return nodes.get(f"{step_id}__{lang}") or nodes.get(step_id)

    # Step order: walk from Start following the first language's path, so "continues to the next step" reads naturally.
    order: list[str] = []
    seen: set[str] = set()
    start = next((node_id for node_id, node in nodes.items() if node.get("type") == "start"), None)
    stack = [edge.get("target") for edge in reversed(outgoing.get(start or "", []))]
    while stack:
        node_id = stack.pop()
        if node_id not in nodes:
            continue
        match = _MIRROR_RE.match(node_id)
        if mirrored and match and match.group(2) in languages and match.group(2) != primary:
            continue
        step_id = base(node_id)
        if step_id in seen:
            continue
        seen.add(step_id)
        order.append(step_id)
        handles = sorted(outgoing.get(node_id, []), key=lambda edge: _handle_rank(edge.get("sourceHandle")), reverse=True)
        stack.extend(edge.get("target") for edge in handles)
    for node_id, node in nodes.items():  # anything not connected to Start still gets written
        if node.get("type") != "start" and base(node_id) not in seen:
            seen.add(base(node_id))
            order.append(base(node_id))

    names = _step_names(order)
    lines: list[str] = []
    if name:
        lines.append(f"bot: {name}")
    lines.append(f"languages: {', '.join(languages)}")
    for index, step_id in enumerate(order):
        node = variant(step_id, primary)
        if node is None:
            continue
        data = node.get("data") or {}
        kind = _NODE_KINDS.get(str(node.get("type")))
        if node is language_node and mirrored:
            kind = "language"
        lossy = {"searchableList": "a choice", "rangeInput": "a scale", "whatsappRedirect": "an end step (the WhatsApp redirect is lost)"}.get(str(node.get("type")))
        if lossy:
            warnings.append(f"The {node.get('type')} step \"{markup_to_text(data.get('label', ''))[:40]}\" was written as {lossy}.")
        if kind is None:
            warnings.append(f"The {node.get('type')} step \"{markup_to_text(data.get('label', ''))[:40]}\" cannot be written as code. It was left out, and building from this code will remove it.")
            continue
        following = names.get(order[index + 1]) if index + 1 < len(order) else None
        lines.append("")
        lines.append(f"[{names[step_id]}] {kind}")
        routes = {str(edge.get("sourceHandle") or ""): names.get(base(str(edge.get("target")))) for edge in outgoing.get(str(node.get("id")), [])}

        # text
        if kind == "language":
            for code, text in _split_bilingual(markup_to_text(data.get("label", "")), languages).items():
                _write_text(lines, code, text)
        elif kind not in TEXTLESS_KINDS:
            if not mirrored:
                _write_text(lines, "text", markup_to_text(data.get("label", "")))
            elif node.get("id") == step_id and nodes.get(f"{step_id}__{primary}") is None:  # shared: one node holds every language
                for code, text in _split_bilingual(markup_to_text(data.get("label", "")), languages).items():
                    _write_text(lines, code, text)
            else:
                for code in languages:
                    twin = variant(step_id, code) or node
                    _write_text(lines, code, markup_to_text((twin.get("data") or {}).get("label", "")))

        if kind in INPUT_KINDS and data.get("variable"):
            lines.append(f"save: {data['variable']}")
        if kind in INPUT_KINDS and data.get("required") is False:
            lines.append("required: no")
        if kind == "number":
            _write_range(lines, data.get("min_value"), data.get("max_value"))
        elif kind == "rating" and data.get("max_value") not in (None, 5):
            lines.append(f"max: {_plain_number(data['max_value'])}")
        elif kind == "scale":
            _write_range(lines, data.get("min_value"), data.get("max_value"))
        elif kind == "multi":
            _write_range(lines, data.get("min_selections"), data.get("max_selections"))
        elif kind == "upload":
            if data.get("max_files") not in (None, 1):
                lines.append(f"files: {int(data['max_files'])}")
            kinds = [key for key, mimes in FILE_TYPES.items() if any(mime in (data.get("file_types") or []) for mime in mimes)]
            if kinds and kinds != ["pdf", "image"]:
                lines.append(f"types: {', '.join(kinds)}")
        elif kind == "condition":
            operator = str(data.get("operator") or "==")
            lines.append(f"if: {data.get('variable', '')} {operator} {data.get('value', '')}".rstrip())
            for word, handle in (("then", "true"), ("else", "false")):
                if routes.get(handle) and routes[handle] != following:
                    lines.append(f"{word} -> {routes[handle]}")
        elif kind == "set":
            lines.append(f"set: {data.get('variable', '')} = {data.get('value', '')}".rstrip())
        elif kind == "links":
            for position, link in enumerate(data.get("links") or []):
                labels = []
                for code in languages if mirrored and node.get("id") != step_id else [primary]:
                    twin_links = ((variant(step_id, code) or node).get("data") or {}).get("links") or []
                    labels.append(str((twin_links[position] if position < len(twin_links) else link).get("label") or ""))
                lines.append(f"- {link.get('link_type') or 'website'}: {link.get('url', '')} | {' | '.join(labels)}".rstrip(" |"))
        elif kind == "end" and data.get("cta_url") and data.get("cta_label"):
            labels = [str(((variant(step_id, code) or node).get("data") or {}).get("cta_label") or "") for code in (languages if mirrored and node.get("id") != step_id else [primary])]
            lines.append(f"button: {' | '.join(labels)} | {data['cta_url']}")

        if kind == "choice":
            option_sets = [((variant(step_id, code) or node).get("data") or {}).get("options") or [] for code in (languages if mirrored and node.get("id") != step_id else [primary])]
            for position, label in enumerate(data.get("options") or []):
                labels = [str(options[position]) if position < len(options) else str(label) for options in option_sets]
                target = routes.get(f"option-{position}") or routes.get("next")
                arrow = f" -> {target}" if target and target != following else ""
                lines.append(f"- {' | '.join(labels)}{arrow}")
            if data.get("required") is False and routes.get("skip") and routes["skip"] != following:
                lines.append(f"skip -> {routes['skip']}")
        elif kind == "multi":
            option_sets = [((variant(step_id, code) or node).get("data") or {}).get("options") or [] for code in (languages if mirrored and node.get("id") != step_id else [primary])]
            for position, label in enumerate(data.get("options") or []):
                lines.append("- " + " | ".join(str(options[position]) if position < len(options) else str(label) for options in option_sets))
            target = routes.get("next") or routes.get("option-0")
            if target and target != following:
                lines.append(f"-> {target}")
        elif kind not in {"end", "condition", "language"}:
            target = routes.get("")
            if target and target != following:
                lines.append(f"-> {target}")
    return {"code": "\n".join(lines).strip() + "\n", "warnings": warnings, "languages": languages}


def _handle_rank(handle: Any) -> int:
    text = str(handle or "")
    match = re.match(r"^option-(\d+)$", text)
    if match:
        return int(match.group(1))
    return {"": 0, "next": 0, "true": 0, "false": 1, "skip": 999}.get(text, 500)


def _mostly_arabic(nodes: dict[str, dict[str, Any]]) -> bool:
    labels = " ".join(markup_to_text((node.get("data") or {}).get("label", "")) for node in nodes.values())
    letters = [char for char in labels if char.isalpha()]
    return bool(letters) and sum(1 for char in letters if _ARABIC.match(char)) > len(letters) / 2


def _step_names(order: list[str]) -> dict[str, str]:
    """Readable, unique step names for node ids (generated ids such as textInput-3f2a... become step_3)."""
    names: dict[str, str] = {}
    taken: set[str] = set()
    for index, node_id in enumerate(order, start=1):
        candidate = node_id if _ID_RE.match(node_id) and len(node_id) <= 40 and not re.search(r"-[0-9a-f]{6,}", node_id) else f"step_{index}"
        while candidate in taken:
            candidate = f"{candidate}_{index}"
        taken.add(candidate)
        names[node_id] = candidate
    return names


def _plain_number(value: Any) -> str:
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number)


def _write_range(lines: list[str], minimum: Any, maximum: Any) -> None:
    if minimum is not None:
        lines.append(f"min: {_plain_number(minimum)}")
    if maximum is not None:
        lines.append(f"max: {_plain_number(maximum)}")
