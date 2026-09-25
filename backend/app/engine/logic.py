from dataclasses import dataclass
from typing import Any

from app.engine.executor import EngineError, evaluate_condition
from app.engine.facts import validate_facts
from app.schemas.flow import ValidationIssue, ValidationReport


@dataclass(frozen=True)
class LoadedLogic:
    kind: str
    version_id: str
    definition: dict[str, Any]
    input_schema: dict[str, dict[str, Any]]
    output_schema: dict[str, dict[str, Any]]
    published: bool


@dataclass(frozen=True)
class LogicEvaluation:
    outputs: dict[str, Any]
    matched: list[str]
    trace: list[dict[str, Any]]


def evaluate_logic(asset: LoadedLogic, facts: dict[str, Any]) -> LogicEvaluation:
    validate_facts(asset.input_schema, facts, context="Logic input")
    if asset.kind == "rule_set":
        result = _evaluate_rule_set(asset.definition, facts)
    elif asset.kind == "decision_table":
        result = _evaluate_decision_table(asset.definition, facts)
    else:
        raise EngineError(f"Unsupported logic asset kind: {asset.kind}")
    validate_facts(asset.output_schema, result.outputs, context="Logic output")
    return result


def validate_logic_definition(
    kind: str,
    definition: dict[str, Any],
    input_schema: dict[str, Any],
    output_schema: dict[str, Any],
) -> ValidationReport:
    issues: list[ValidationIssue] = []
    if kind not in {"rule_set", "decision_table"}:
        issues.append(_issue("invalid_logic_kind", "Logic kind must be rule_set or decision_table."))
        return ValidationReport(valid=False, issues=issues)

    entries = definition.get("rules" if kind == "rule_set" else "rows")
    if not isinstance(entries, list) or not entries:
        issues.append(_issue("missing_logic_entries", "At least one rule or decision row is required."))
        return ValidationReport(valid=False, issues=issues)

    seen: set[str] = set()
    known_inputs = set(input_schema)
    known_outputs = set(output_schema)
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            issues.append(_issue("invalid_logic_entry", f"Entry {index + 1} must be an object."))
            continue
        entry_id = str(entry.get("id") or "").strip()
        if not entry_id:
            issues.append(_issue("missing_logic_entry_id", f"Entry {index + 1} requires an ID."))
        elif entry_id in seen:
            issues.append(_issue("duplicate_logic_entry_id", f"Entry ID '{entry_id}' is duplicated."))
        seen.add(entry_id)
        conditions = _conditions(entry, kind)
        if not conditions:
            issues.append(_issue("missing_logic_conditions", f"Entry '{entry_id or index + 1}' requires conditions."))
        for condition in conditions:
            fact = str(condition.get("variable") or condition.get("fact") or "").strip()
            if fact not in known_inputs:
                issues.append(_issue("unknown_logic_input", f"Condition fact '{fact or '<empty>'}' is not declared."))
            try:
                evaluate_condition(
                    {"variable": fact, "operator": condition.get("operator", "=="), "value": condition.get("value")},
                    {fact: condition.get("value")},
                )
            except EngineError:
                issues.append(_issue("invalid_logic_operator", f"Condition operator '{condition.get('operator')}' is not supported."))
        outputs = entry.get("outputs")
        if not isinstance(outputs, dict) or not outputs:
            issues.append(_issue("missing_logic_outputs", f"Entry '{entry_id or index + 1}' requires outputs."))
        else:
            unknown = sorted(set(outputs) - known_outputs)
            if unknown:
                issues.append(_issue("unknown_logic_output", f"Unknown outputs: {', '.join(unknown)}."))

    if kind == "decision_table" and definition.get("hit_policy", "FIRST") not in {"FIRST", "UNIQUE"}:
        issues.append(_issue("invalid_hit_policy", "Decision table hit policy must be FIRST or UNIQUE."))

    default_outputs = definition.get("default_outputs") or {}
    unknown_defaults = sorted(set(default_outputs) - known_outputs) if isinstance(default_outputs, dict) else []
    if unknown_defaults:
        issues.append(_issue("unknown_default_output", f"Unknown default outputs: {', '.join(unknown_defaults)}."))

    return ValidationReport(
        valid=not any(issue.severity == "error" for issue in issues),
        issues=issues,
    )


def _evaluate_rule_set(definition: dict[str, Any], facts: dict[str, Any]) -> LogicEvaluation:
    strategy = str(definition.get("strategy") or "FIRST").upper()
    if strategy not in {"FIRST", "ALL"}:
        raise EngineError("Rule-set strategy must be FIRST or ALL")
    outputs: dict[str, Any] = {}
    matched: list[str] = []
    trace: list[dict[str, Any]] = []
    for rule in definition.get("rules") or []:
        conditions = _conditions(rule, "rule_set")
        evaluations = [evaluate_condition(_normalized_condition(item), facts) for item in conditions]
        is_match = all(evaluations) if str(rule.get("match") or "all").lower() == "all" else any(evaluations)
        rule_id = str(rule.get("id") or "")
        trace.append({"entry_id": rule_id, "matched": is_match, "evaluations": evaluations})
        if not is_match:
            continue
        matched.append(rule_id)
        outputs.update(rule.get("outputs") or {})
        if strategy == "FIRST":
            break
    if not matched:
        outputs.update(definition.get("default_outputs") or {})
    return LogicEvaluation(outputs=outputs, matched=matched, trace=trace)


def _evaluate_decision_table(definition: dict[str, Any], facts: dict[str, Any]) -> LogicEvaluation:
    hit_policy = str(definition.get("hit_policy") or "FIRST").upper()
    matching: list[dict[str, Any]] = []
    trace: list[dict[str, Any]] = []
    for row in definition.get("rows") or []:
        conditions = _conditions(row, "decision_table")
        evaluations = [evaluate_condition(_normalized_condition(item), facts) for item in conditions]
        is_match = all(evaluations)
        row_id = str(row.get("id") or "")
        trace.append({"entry_id": row_id, "matched": is_match, "evaluations": evaluations})
        if is_match:
            matching.append(row)
            if hit_policy == "FIRST":
                break
    if hit_policy == "UNIQUE" and len(matching) > 1:
        raise EngineError("UNIQUE decision table matched more than one row")
    if matching:
        row = matching[0]
        return LogicEvaluation(
            outputs=dict(row.get("outputs") or {}),
            matched=[str(row.get("id") or "")],
            trace=trace,
        )
    return LogicEvaluation(
        outputs=dict(definition.get("default_outputs") or {}),
        matched=[],
        trace=trace,
    )


def _conditions(entry: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    raw = entry.get("when" if kind == "rule_set" else "conditions")
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        return [
            {"fact": name, **(condition if isinstance(condition, dict) else {"value": condition})}
            for name, condition in raw.items()
        ]
    return []


def _normalized_condition(condition: dict[str, Any]) -> dict[str, Any]:
    return {
        "variable": condition.get("variable") or condition.get("fact"),
        "operator": condition.get("operator", "=="),
        "value": condition.get("value"),
    }


def _issue(code: str, message: str) -> ValidationIssue:
    return ValidationIssue(
        severity="error",
        code=code,
        message=message,
        entity_type="rule_set",
    )
