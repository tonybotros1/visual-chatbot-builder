from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass(slots=True)
class TargetingResult:
    eligible: bool
    reasons: list[str] = field(default_factory=list)


def _resolve(context: dict[str, Any], path: str) -> Any:
    value: Any = context
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def _compare(actual: Any, operator: str, expected: Any) -> bool:
    normalized = operator.lower().replace(" ", "_")
    if normalized in {"exists", "not_exists"}:
        exists = actual is not None and actual != ""
        return exists if normalized == "exists" else not exists
    if normalized in {"equals", "eq", "=="}:
        return actual == expected
    if normalized in {"not_equals", "ne", "!="}:
        return actual != expected
    if normalized in {"in", "not_in"}:
        choices = expected if isinstance(expected, list) else [expected]
        matched = actual in choices
        return matched if normalized == "in" else not matched
    if normalized in {"contains", "not_contains"}:
        try:
            matched = expected in actual
        except TypeError:
            matched = False
        return matched if normalized == "contains" else not matched
    if normalized == "starts_with":
        return isinstance(actual, str) and actual.startswith(str(expected))
    if normalized == "ends_with":
        return isinstance(actual, str) and actual.endswith(str(expected))
    if normalized == "regex":
        return isinstance(actual, str) and re.search(str(expected), actual) is not None
    if normalized in {"gt", "gte", "lt", "lte"}:
        try:
            left, right = float(actual), float(expected)
        except (TypeError, ValueError):
            return False
        return {
            "gt": left > right,
            "gte": left >= right,
            "lt": left < right,
            "lte": left <= right,
        }[normalized]
    return False


def _matches_group(group: dict[str, Any], context: dict[str, Any]) -> bool:
    conditions = group.get("conditions", [])
    groups = group.get("groups", [])
    checks = [
        _compare(
            _resolve(context, str(condition.get("field", ""))),
            str(condition.get("operator", "equals")),
            condition.get("value"),
        )
        for condition in conditions
        if isinstance(condition, dict)
    ]
    checks.extend(
        _matches_group(child, context) for child in groups if isinstance(child, dict)
    )
    combinator = str(group.get("combinator", "all")).lower()
    matched = any(checks) if combinator == "any" else all(checks)
    return not matched if group.get("not") is True else matched


def _parse_instant(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def evaluate_targeting(
    rules: dict[str, Any] | None,
    context: dict[str, Any],
    *,
    now: datetime | None = None,
) -> TargetingResult:
    rules = rules or {}
    reasons: list[str] = []
    current = (now or datetime.now(UTC)).astimezone(UTC)

    schedule = rules.get("schedule", {})
    if isinstance(schedule, dict):
        starts_at = _parse_instant(schedule.get("starts_at"))
        ends_at = _parse_instant(schedule.get("ends_at"))
        if schedule.get("starts_at") and starts_at is None:
            reasons.append("Schedule start is invalid")
        elif starts_at and current < starts_at:
            reasons.append("Deployment is not active yet")
        if schedule.get("ends_at") and ends_at is None:
            reasons.append("Schedule end is invalid")
        elif ends_at and current > ends_at:
            reasons.append("Deployment schedule has ended")

    frequency = rules.get("frequency", {})
    if isinstance(frequency, dict):
        impressions = int(context.get("impressions") or 0)
        maximum = frequency.get("max_impressions")
        if maximum is not None and impressions >= int(maximum):
            reasons.append("Impression limit reached")
        if frequency.get("once_per_session") and context.get("shown_this_session"):
            reasons.append("Already shown in this session")

    matcher = rules.get("match")
    if isinstance(matcher, dict) and not _matches_group(matcher, context):
        reasons.append("Audience conditions did not match")

    return TargetingResult(eligible=not reasons, reasons=reasons)

