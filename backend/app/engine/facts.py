import re
from datetime import date
from typing import Any

from app.engine.executor import EngineError


TEMPLATE_PATTERN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def resolve_mapping(value: Any, variables: dict[str, Any]) -> Any:
    if not isinstance(value, str):
        return value
    matches = list(TEMPLATE_PATTERN.finditer(value))
    if len(matches) == 1 and matches[0].span() == (0, len(value)):
        return variables.get(matches[0].group(1))
    return TEMPLATE_PATTERN.sub(
        lambda match: str(variables.get(match.group(1), "")),
        value,
    )


def validate_facts(
    schema: dict[str, dict[str, Any]],
    facts: dict[str, Any],
    *,
    context: str,
) -> None:
    for name, definition in schema.items():
        required = definition.get("required", True)
        value = facts.get(name)
        if value in (None, ""):
            if required:
                raise EngineError(f"{context} requires fact '{name}'")
            continue
        fact_type = definition.get("type", "string")
        if not _matches_type(value, fact_type, definition.get("values", [])):
            raise EngineError(f"{context} fact '{name}' must be {fact_type}")


def _matches_type(value: Any, fact_type: str, enum_values: list[str]) -> bool:
    if fact_type == "string":
        return isinstance(value, str)
    if fact_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if fact_type == "boolean":
        return isinstance(value, bool)
    if fact_type == "date":
        if not isinstance(value, str):
            return False
        try:
            date.fromisoformat(value)
        except ValueError:
            return False
        return True
    if fact_type == "enum":
        return isinstance(value, str) and (not enum_values or value in enum_values)
    return False
