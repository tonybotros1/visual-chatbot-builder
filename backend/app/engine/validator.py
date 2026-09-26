from collections import defaultdict
from datetime import date
import re
from typing import Any
from urllib.parse import urlparse

from app.engine.executor import INPUT_TYPES, MESSAGE_TYPES, TERMINAL_TYPES
from app.schemas.flow import ValidationIssue, ValidationReport


def validate_flow(
    flow: dict[str, Any],
    *,
    terminal_types: set[str] | None = None,
    external_variables: set[str] | None = None,
    required_outputs: set[str] | None = None,
) -> ValidationReport:
    terminal_types = terminal_types or set(TERMINAL_TYPES)
    external_variables = external_variables or set()
    required_outputs = required_outputs or set()
    nodes = flow.get("nodes", [])
    edges = flow.get("edges", [])
    node_by_id = {node.get("id"): node for node in nodes if node.get("id")}
    node_ids = set(node_by_id)
    issues: list[ValidationIssue] = []
    input_types = set(INPUT_TYPES)
    supported_node_types = input_types | MESSAGE_TYPES | terminal_types | {
        "start",
        "condition",
        "setVariable",
        "subflow",
        "ruleSet",
        "decisionTable",
        "return",
    }
    valid_operators = {"==", "!=", ">", ">=", "<", "<=", "contains", "not contains"}
    variables: dict[str, list[str]] = defaultdict(list)
    defined_variables = set(external_variables)
    for node in nodes:
        if node.get("type") not in supported_node_types:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="unsupported_node_type",
                    message=f"Node type '{node.get('type')}' is not supported by this runtime.",
                    node_ids=[str(node.get("id"))],
                )
            )
        data = node.get("data", {})
        variable = str(data.get("variable", "")).strip()
        if variable and node.get("type") in input_types | {"setVariable"}:
            variables[variable].append(str(node.get("id")))
            defined_variables.add(variable)
        elif node.get("type") in input_types | {"setVariable"}:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_variable",
                    message="This node requires a variable name.",
                    node_ids=[str(node.get("id"))],
                )
            )

    for variable, owners in variables.items():
        if len(owners) > 1:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    code="duplicate_variable",
                    message=f"Variable '{variable}' is written by multiple nodes.",
                    node_ids=owners,
                )
            )

    missing_outputs = sorted(required_outputs - set(variables))
    for variable in missing_outputs:
        issues.append(
            ValidationIssue(
                severity="error",
                code="missing_output_fact",
                message=f"Required output fact '{variable}' is never written by this subflow.",
                entity_type="subflow",
                path=f"output_schema.{variable}",
                suggested_fix="Add a Set Variable or input node that writes this output fact.",
            )
        )

    starts = [node for node in nodes if node.get("type") == "start"]
    ends = [node for node in nodes if node.get("type") in terminal_types]

    if len(starts) != 1:
        issues.append(
            ValidationIssue(
                severity="error",
                code="start_count",
                message=f"Expected exactly one Start node; found {len(starts)}.",
                node_ids=[str(node.get("id")) for node in starts],
            )
        )
    if not ends:
        terminal_name = "Return" if terminal_types == {"return"} else "End state"
        issues.append(
            ValidationIssue(
                severity="error",
                code="missing_return" if terminal_types == {"return"} else "missing_end",
                message=f"At least one {terminal_name} node is required.",
            )
        )

    outgoing: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        missing = [str(node_id) for node_id in (source, target) if node_id not in node_ids]
        if missing:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="missing_edge_node",
                    message=f"Edge {edge.get('id', '<unknown>')} references a missing node.",
                    node_ids=missing,
                )
            )
            continue
        outgoing[str(source)].append(str(target))

    for node in nodes:
        node_id = str(node.get("id"))
        if node.get("type") not in terminal_types and node_id not in outgoing:
            issues.append(
                ValidationIssue(
                    severity="error",
                    code="dead_end",
                    message="This node has no outgoing path.",
                    node_ids=[node_id],
                )
            )

        if node.get("type") in {"choice", "singleChoice", "multipleChoice"}:
            options = node.get("data", {}).get("options", [])
            connected_handles = {
                edge.get("sourceHandle")
                for edge in edges
                if edge.get("source") == node_id
            }
            missing_handles = [
                f"option-{index}"
                for index in range(len(options))
                if f"option-{index}" not in connected_handles
            ]
            if node.get("data", {}).get("required", True) is False and "skip" not in connected_handles:
                missing_handles.append("skip")
            if missing_handles:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="unconnected_choice",
                        message="Every choice option and optional Skip route must have a connected output.",
                        node_ids=[node_id],
                    )
                )

        if node.get("type") in {"singleChoice", "choice", "multipleChoice", "searchableList"}:
            options = node.get("data", {}).get("options", [])
            if not options:
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="missing_options",
                        message="Choice nodes require at least one option.",
                        node_ids=[node_id],
                    )
                )
            option_values = node.get("data", {}).get("option_values")
            if option_values is not None and len(option_values) != len(options):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="option_value_count",
                        message="Option labels and stored values must have the same count.",
                        node_ids=[node_id],
                    )
                )

        if node.get("type") == "textInput":
            data = node.get("data", {})
            minimum = data.get("min_length")
            maximum = data.get("max_length")
            if minimum is not None and maximum is not None and int(minimum) > int(maximum):
                issues.append(_node_error(node_id, "invalid_text_limits", "Minimum length cannot exceed maximum length."))
            pattern = str(data.get("pattern") or "").strip()
            if pattern:
                try:
                    re.compile(pattern)
                except re.error:
                    issues.append(_node_error(node_id, "invalid_pattern", "The regular expression is invalid."))

        if node.get("type") in {"numberInput", "rangeInput", "ratingInput", "opinionScale"}:
            data = node.get("data", {})
            minimum = data.get("min_value")
            maximum = data.get("max_value")
            step = data.get("step")
            try:
                if minimum is not None and maximum is not None and float(minimum) > float(maximum):
                    issues.append(_node_error(node_id, "invalid_number_limits", "Minimum value cannot exceed maximum value."))
                if step is not None and float(step) <= 0:
                    issues.append(_node_error(node_id, "invalid_number_step", "Step must be greater than zero."))
            except (TypeError, ValueError):
                issues.append(_node_error(node_id, "invalid_number_config", "Numeric limits and step must be valid numbers."))

        if node.get("type") == "multipleChoice":
            data = node.get("data", {})
            minimum = int(data.get("min_selections") or 0)
            maximum = data.get("max_selections")
            if maximum is not None and minimum > int(maximum):
                issues.append(_node_error(node_id, "invalid_selection_limits", "Minimum selections cannot exceed maximum selections."))
            if maximum is not None and int(maximum) > len(data.get("options") or []):
                issues.append(_node_error(node_id, "invalid_selection_limit", "Maximum selections cannot exceed the option count."))

        if node.get("type") == "dateInput":
            data = node.get("data", {})
            try:
                minimum = date.fromisoformat(str(data["min_date"])) if data.get("min_date") else None
                maximum = date.fromisoformat(str(data["max_date"])) if data.get("max_date") else None
                if minimum and maximum and minimum > maximum:
                    issues.append(_node_error(node_id, "invalid_date_limits", "Minimum date cannot be after maximum date."))
            except ValueError:
                issues.append(_node_error(node_id, "invalid_date_config", "Date limits must use YYYY-MM-DD format."))

        if node.get("type") == "links":
            links = node.get("data", {}).get("links") or []
            if not links:
                issues.append(_node_error(node_id, "missing_links", "Links nodes require at least one link."))
            for link in links:
                if not isinstance(link, dict) or not _is_safe_link_action(link):
                    issues.append(_node_error(node_id, "invalid_link_url", "Each link needs a valid destination for its selected type."))
                    break

        if node.get("type") == "whatsappRedirect":
            phone = re.sub(r"\D", "", str(node.get("data", {}).get("whatsapp_phone") or ""))
            if len(phone) < 7:
                issues.append(_node_error(node_id, "invalid_whatsapp_phone", "WhatsApp redirect requires a valid destination number."))

        if node.get("type") == "fileUpload":
            data = node.get("data", {})
            if int(data.get("max_files") or 1) < 1 or float(data.get("max_file_size_mb") or 10) <= 0:
                issues.append(_node_error(node_id, "invalid_file_limits", "File count and size limits must be greater than zero."))

        if node.get("type") == "payment":
            data = node.get("data", {})
            try:
                if float(data.get("amount") or 0) < 0:
                    issues.append(_node_error(node_id, "invalid_payment_amount", "Payment amount cannot be negative."))
            except (TypeError, ValueError):
                issues.append(_node_error(node_id, "invalid_payment_amount", "Payment amount must be numeric."))
            if len(str(data.get("currency") or "")) != 3:
                issues.append(_node_error(node_id, "invalid_payment_currency", "Payment currency must be a three-letter code."))

        if node.get("type") == "appointment":
            data = node.get("data", {})
            try:
                if int(data.get("duration_minutes") or 30) < 5:
                    issues.append(_node_error(node_id, "invalid_appointment_duration", "Appointment duration must be at least five minutes."))
                opening_hour = int(9 if data.get("opening_hour") is None else data["opening_hour"])
                closing_hour = int(17 if data.get("closing_hour") is None else data["closing_hour"])
                if not 0 <= opening_hour <= 23 or not 1 <= closing_hour <= 24 or opening_hour >= closing_hour:
                    issues.append(_node_error(node_id, "invalid_appointment_hours", "Appointment hours must define a valid daily window."))
            except (TypeError, ValueError):
                issues.append(_node_error(node_id, "invalid_appointment_config", "Appointment duration and hours must be numeric."))

        if node.get("type") == "condition":
            data = node.get("data", {})
            conditions = data.get("conditions") or [data]
            for condition in conditions:
                variable = str(condition.get("variable", "")).strip()
                operator = condition.get("operator")
                if not variable or variable not in defined_variables:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="missing_condition_variable",
                            message=f"Condition variable '{variable or '<empty>'}' is not defined.",
                            node_ids=[node_id],
                        )
                    )
                if operator not in valid_operators:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            code="invalid_operator",
                            message=f"Condition operator '{operator}' is not supported.",
                            node_ids=[node_id],
                        )
                    )
            connected_handles = {
                edge.get("sourceHandle") for edge in edges if edge.get("source") == node_id
            }
            if not {"true", "false"}.issubset(connected_handles):
                issues.append(
                    ValidationIssue(
                        severity="error",
                        code="unconnected_condition",
                        message="Condition nodes require connected true and false outputs.",
                        node_ids=[node_id],
                    )
                )

    if len(starts) == 1:
        start_id = str(starts[0]["id"])
        reachable: set[str] = set()
        stack = [start_id]
        while stack:
            current = stack.pop()
            if current in reachable:
                continue
            reachable.add(current)
            stack.extend(outgoing[current])

        unreachable = sorted(node_ids - reachable)
        if unreachable:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    code="unreachable_nodes",
                    message="Some nodes cannot be reached from Start.",
                    node_ids=unreachable,
                )
            )

        if _has_cycle(start_id, outgoing):
            issues.append(
                ValidationIssue(
                    severity="warning",
                    code="cycle_detected",
                    message="A circular path exists. Confirm that it is intentional.",
                )
            )

    return ValidationReport(
        valid=not any(issue.severity == "error" for issue in issues),
        issues=issues,
    )


def validate_flow_connections(
    flow: dict[str, Any],
    *,
    terminal_types: set[str] | None = None,
) -> ValidationReport:
    """Return only node-connection problems for the visual builder validator."""
    terminal_types = terminal_types or set(TERMINAL_TYPES)
    nodes = [node for node in flow.get("nodes", []) if node.get("id")]
    node_by_id = {str(node["id"]): node for node in nodes}
    node_ids = set(node_by_id)
    valid_edges = [
        edge
        for edge in flow.get("edges", [])
        if str(edge.get("source")) in node_ids and str(edge.get("target")) in node_ids
    ]
    incoming: dict[str, list[dict[str, Any]]] = defaultdict(list)
    outgoing: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for edge in valid_edges:
        outgoing[str(edge["source"])].append(edge)
        incoming[str(edge["target"])].append(edge)

    unreachable: set[str] = set()
    starts = [node for node in nodes if node.get("type") == "start"]
    if len(starts) == 1:
        start_id = str(starts[0]["id"])
        reachable: set[str] = set()
        stack = [start_id]
        while stack:
            current = stack.pop()
            if current in reachable:
                continue
            reachable.add(current)
            stack.extend(str(edge["target"]) for edge in outgoing[current])
        unreachable = node_ids - reachable

    issues: list[ValidationIssue] = []
    branching_types = {"choice", "singleChoice", "multipleChoice"}
    for node in nodes:
        node_id = str(node["id"])
        node_type = str(node.get("type") or "")
        data = node.get("data") or {}
        reasons: list[str] = []
        if node_type != "start" and not incoming[node_id]:
            reasons.append("needs an incoming connection")
        if node_type not in terminal_types and not outgoing[node_id]:
            reasons.append("needs an outgoing connection")
        if node_id in unreachable:
            reasons.append("is not connected to Start")

        connected_handles = {str(edge.get("sourceHandle") or "") for edge in outgoing[node_id]}
        if node_type in branching_types:
            options = data.get("options") or []
            missing_routes = [
                str(option or f"Option {index + 1}")
                for index, option in enumerate(options)
                if f"option-{index}" not in connected_handles
            ]
            if data.get("required", True) is False and "skip" not in connected_handles:
                missing_routes.append("Skip")
            if missing_routes:
                reasons.append(f"has unconnected routes: {', '.join(missing_routes)}")
        elif node_type == "condition":
            missing_routes = [label for label in ("true", "false") if label not in connected_handles]
            if missing_routes:
                reasons.append(f"has unconnected routes: {', '.join(label.title() for label in missing_routes)}")

        if not reasons:
            continue
        number = data.get("node_number")
        label = re.sub(r"\s+", " ", str(data.get("label") or node_type or "Node")).strip()
        if len(label) > 64:
            label = f"{label[:61]}..."
        display_name = f"Node #{number}" if number is not None else "Node"
        if label:
            display_name += f' “{label}”'
        issues.append(
            ValidationIssue(
                severity="error",
                code="unconnected_node",
                message=f"{display_name} {'; '.join(reasons)}.",
                node_ids=[node_id],
            )
        )

    return ValidationReport(valid=not issues, issues=issues)


def _has_cycle(start_id: str, outgoing: dict[str, list[str]]) -> bool:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        if any(visit(next_id) for next_id in outgoing[node_id]):
            return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    return visit(start_id)


def _node_error(node_id: str, code: str, message: str) -> ValidationIssue:
    return ValidationIssue(
        severity="error",
        code=code,
        message=message,
        node_ids=[node_id],
    )


def _is_safe_public_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _is_safe_link_action(link: dict[str, Any]) -> bool:
    value = str(link.get("url") or "").strip()
    link_type = str(link.get("link_type") or "website").strip().lower()
    if link_type == "email":
        address = re.sub(r"^mailto:", "", value, flags=re.IGNORECASE)
        return re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", address) is not None
    if link_type == "phone":
        number = re.sub(r"^tel:", "", value, flags=re.IGNORECASE)
        return len(re.sub(r"\D", "", number)) >= 7
    if link_type == "whatsapp":
        return _is_safe_public_url(value) or len(re.sub(r"\D", "", value)) >= 7
    return _is_safe_public_url(value)
