import math
import re
from dataclasses import dataclass
from datetime import date
from typing import Any


INPUT_TYPES = {
    "textInput",
    "numberInput",
    "emailInput",
    "phoneInput",
    "singleChoice",
    "choice",
    "multipleChoice",
    "searchableList",
    "rangeInput",
    "ratingInput",
    "opinionScale",
    "dateInput",
    "fileUpload",
    "payment",
    "appointment",
}

MESSAGE_TYPES = {"message", "links"}
TERMINAL_TYPES = {"end", "thankYou", "whatsappRedirect"}


class EngineError(ValueError):
    pass


@dataclass
class ExecutionResult:
    messages: list[dict[str, Any]]
    next_node: dict[str, Any] | None
    variables: dict[str, Any]
    completed: bool


def evaluate_condition(condition: dict[str, Any], variables: dict[str, Any]) -> bool:
    actual = variables.get(str(condition.get("variable", "")))
    expected = condition.get("value")
    if isinstance(actual, (int, float)) and not isinstance(actual, bool) and isinstance(expected, str):
        try:
            expected = float(expected)
        except ValueError:
            pass
    operator = condition.get("operator", "==")
    try:
        if operator == "==":
            return actual == expected
        if operator == "!=":
            return actual != expected
        if operator == ">":
            return actual > expected
        if operator == ">=":
            return actual >= expected
        if operator == "<":
            return actual < expected
        if operator == "<=":
            return actual <= expected
        if operator == "contains":
            return expected in actual
        if operator == "not contains":
            return expected not in actual
        if operator == "in":
            return actual in expected
        if operator == "not in":
            return actual not in expected
        if operator == "starts with":
            return str(actual).startswith(str(expected))
        if operator == "ends with":
            return str(actual).endswith(str(expected))
        if operator == "exists":
            return actual is not None
        if operator == "not exists":
            return actual is None
    except (TypeError, ValueError):
        return False
    raise EngineError(f"Unsupported condition operator: {operator}")


def advance_flow(
    flow: dict[str, Any],
    start_node_id: str,
    variables: dict[str, Any],
) -> ExecutionResult:
    node_by_id = {node["id"]: node for node in flow.get("nodes", [])}
    edges = flow.get("edges", [])
    current_id: str | None = start_node_id
    messages: list[dict[str, Any]] = []
    next_variables = dict(variables)
    visited_steps = 0

    while current_id:
        visited_steps += 1
        if visited_steps > 100:
            raise EngineError("Flow exceeded 100 automatic steps; check for a circular path")
        node = node_by_id.get(current_id)
        if node is None:
            raise EngineError(f"Node not found: {current_id}")
        node_type = node.get("type")
        data = node.get("data", {})

        if node_type in INPUT_TYPES:
            return ExecutionResult(messages, node, next_variables, False)
        if node_type in TERMINAL_TYPES:
            return ExecutionResult(messages, node, next_variables, True)
        if node_type in MESSAGE_TYPES:
            messages.append(node)
            current_id = edge_target(edges, current_id)
            continue
        if node_type == "setVariable":
            variable = str(data.get("variable", "")).strip()
            if variable:
                next_variables[variable] = data.get("value")
            current_id = edge_target(edges, current_id)
            continue
        if node_type == "condition":
            conditions = data.get("conditions") or [
                {
                    "variable": data.get("variable"),
                    "operator": data.get("operator", "=="),
                    "value": data.get("value"),
                }
            ]
            results = [evaluate_condition(item, next_variables) for item in conditions]
            matched = all(results) if data.get("match", "all") == "all" else any(results)
            current_id = edge_target(edges, current_id, "true" if matched else "false")
            continue
        if node_type == "start":
            current_id = edge_target(edges, current_id)
            continue
        raise EngineError(f"Unsupported node type: {node_type}")

    return ExecutionResult(messages, None, next_variables, True)


def validate_answer(node: dict[str, Any], value: Any) -> Any:
    node_type = node.get("type")
    data = node.get("data", {})
    required = data.get("required", True)
    if value in (None, "", []) and required:
        raise EngineError("An answer is required")
    if value in (None, "", []):
        return value
    if node_type == "textInput":
        text = str(value)
        minimum = data.get("min_length")
        maximum = data.get("max_length")
        if minimum is not None and len(text) < int(minimum):
            raise EngineError(f"Enter at least {minimum} characters")
        if maximum is not None and len(text) > int(maximum):
            raise EngineError(f"Enter no more than {maximum} characters")
        pattern = str(data.get("pattern") or "").strip()
        if pattern:
            try:
                matches = re.fullmatch(pattern, text)
            except re.error as exc:
                raise EngineError("This question has an invalid validation pattern") from exc
            if matches is None:
                raise EngineError(str(data.get("pattern_message") or "Enter a value in the required format"))
        return text
    if node_type in {"numberInput", "rangeInput", "ratingInput", "opinionScale"}:
        number = _parse_number(value)
        minimum = data.get("min_value")
        maximum = data.get("max_value")
        step = data.get("step")
        if minimum is not None and number < float(minimum):
            raise EngineError(f"Enter a value of at least {minimum}")
        if maximum is not None and number > float(maximum):
            raise EngineError(f"Enter a value no greater than {maximum}")
        if node_type == "ratingInput" and not number.is_integer():
            raise EngineError("Choose a whole-number rating")
        if step not in (None, 0, "0"):
            base = float(minimum or 0)
            quotient = (number - base) / float(step)
            if not math.isclose(quotient, round(quotient), abs_tol=1e-9):
                raise EngineError(f"Choose a value in increments of {step}")
        return int(number) if number.is_integer() else number
    if node_type == "emailInput":
        email = str(value).strip()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise EngineError("Enter a valid email address")
        allowed_domains = {
            str(domain).lower().lstrip("@")
            for domain in data.get("allowed_domains", [])
            if str(domain).strip()
        }
        if allowed_domains and email.rsplit("@", 1)[-1].lower() not in allowed_domains:
            raise EngineError("Use an email address from an allowed domain")
        return email
    if node_type == "phoneInput" and len(re.sub(r"\D", "", str(value))) < 7:
        raise EngineError("Enter a valid phone number")
    if node_type == "phoneInput":
        return str(value).strip()
    if node_type == "dateInput":
        try:
            parsed = date.fromisoformat(str(value))
        except ValueError as exc:
            raise EngineError("Choose a valid date") from exc
        minimum = _optional_date(data.get("min_date"))
        maximum = _optional_date(data.get("max_date"))
        if minimum and parsed < minimum:
            raise EngineError(f"Choose a date on or after {minimum.isoformat()}")
        if maximum and parsed > maximum:
            raise EngineError(f"Choose a date on or before {maximum.isoformat()}")
        return parsed.isoformat()
    options = choice_options(data)
    option_values = choice_values(data)
    if node_type in {"singleChoice", "choice", "searchableList"} and options:
        if value in option_values:
            return value
        if value in options:
            return option_values[options.index(value)]
        raise EngineError("Choose one of the available options")
    if node_type == "multipleChoice":
        if not isinstance(value, list):
            raise EngineError("Choose one or more options")
        normalized: list[Any] = []
        for item in value:
            if item in option_values:
                normalized.append(item)
            elif item in options:
                normalized.append(option_values[options.index(item)])
            else:
                raise EngineError("Choose only available options")
        minimum = int(data.get("min_selections") or (1 if required else 0))
        maximum = data.get("max_selections")
        if len(normalized) < minimum:
            raise EngineError(f"Choose at least {minimum} options")
        if maximum is not None and len(normalized) > int(maximum):
            raise EngineError(f"Choose no more than {maximum} options")
        return normalized
    if node_type == "fileUpload":
        files = value if isinstance(value, list) else [value]
        if not all(isinstance(item, dict) for item in files):
            raise EngineError("Upload metadata is invalid")
        maximum = int(data.get("max_files") or 1)
        if len(files) > maximum:
            raise EngineError(f"Upload no more than {maximum} files")
        max_size_bytes = int(float(data.get("max_file_size_mb") or 10) * 1024 * 1024)
        allowed = {str(item).lower() for item in data.get("file_types", []) if str(item).strip()}
        for file in files:
            if int(file.get("size") or 0) > max_size_bytes:
                raise EngineError("One or more files exceed the size limit")
            mime_type = str(file.get("type") or "").lower()
            if allowed and mime_type not in allowed:
                raise EngineError("One or more files have an unsupported type")
        return files
    return value


def answer_target(flow: dict[str, Any], node: dict[str, Any], value: Any) -> str | None:
    node_type = node.get("type")
    handle = None
    if node_type in {"singleChoice", "choice"}:
        data = node.get("data", {})
        values = choice_values(data)
        if value in (None, "", []):
            handle = "skip"
        elif value in values:
            handle = f"option-{values.index(value)}"
    elif node_type == "multipleChoice":
        data = node.get("data", {})
        values = choice_values(data)
        if value in (None, "", []):
            handle = "skip"
        elif isinstance(value, list):
            # Multi-select conversations remain a single path. When several
            # answers are selected, the first selected option determines the
            # branch while the complete list is still saved as the response.
            first_selected = next((item for item in value if item in values), None)
            if first_selected is not None:
                handle = f"option-{values.index(first_selected)}"
    return edge_target(flow.get("edges", []), node["id"], handle)


def edge_target(edges: list[dict[str, Any]], source: str, source_handle: str | None = None) -> str | None:
    candidates = [edge for edge in edges if edge.get("source") == source]
    if source_handle is not None:
        match = next((edge for edge in candidates if edge.get("sourceHandle") == source_handle), None)
        return match.get("target") if match else None
    return candidates[0].get("target") if candidates else None


def choice_options(data: dict[str, Any]) -> list[Any]:
    options = data.get("options")
    return list(options) if isinstance(options, list) else []


def choice_values(data: dict[str, Any]) -> list[Any]:
    options = choice_options(data)
    values = data.get("option_values")
    if not isinstance(values, list) or len(values) != len(options):
        return options
    return list(values)


def _parse_number(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise EngineError("Enter a valid number") from exc
    if not math.isfinite(number):
        raise EngineError("Enter a finite number")
    return number


def _optional_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise EngineError("This question has an invalid date limit") from exc
