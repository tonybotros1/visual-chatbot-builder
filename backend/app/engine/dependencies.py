from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.subflow import Subflow, SubflowVersion
from app.models.logic import LogicAsset, LogicAssetVersion
from app.models.integration import IntegrationConnection
from app.schemas.flow import ValidationIssue, ValidationReport


def validate_subflow_dependencies(
    db: Session,
    user_id: UUID,
    flow: dict,
    report: ValidationReport,
) -> ValidationReport:
    issues = list(report.issues)
    for node in flow.get("nodes", []):
        if node.get("type") != "subflow":
            continue
        node_id = str(node.get("id", ""))
        data = node.get("data", {})
        raw_version_id = str(data.get("subflow_version_id", "")).strip()
        if not raw_version_id:
            issues.append(
                _issue(
                    node_id,
                    "missing_subflow_version",
                    "Select a published subflow version.",
                    "Choose a version in the node properties.",
                )
            )
            continue
        try:
            version_id = UUID(raw_version_id)
        except ValueError:
            issues.append(
                _issue(
                    node_id,
                    "invalid_subflow_version",
                    "The referenced subflow version ID is invalid.",
                    "Select the subflow version again.",
                )
            )
            continue
        version = db.scalar(
            select(SubflowVersion)
            .join(Subflow, Subflow.id == SubflowVersion.subflow_id)
            .where(SubflowVersion.id == version_id, Subflow.user_id == user_id)
        )
        if version is None:
            issues.append(
                _issue(
                    node_id,
                    "missing_subflow_dependency",
                    "The referenced subflow version does not exist in this workspace.",
                    "Select an available published version.",
                )
            )
            continue
        if not version.published:
            issues.append(
                _issue(
                    node_id,
                    "draft_subflow_dependency",
                    "A bot cannot publish with a draft subflow dependency.",
                    "Publish the subflow and select that immutable version.",
                )
            )
        inputs = data.get("inputs") or {}
        missing_inputs = [
            name
            for name, definition in (version.input_schema or {}).items()
            if definition.get("required", True) and name not in inputs
        ]
        if missing_inputs:
            issues.append(
                _issue(
                    node_id,
                    "missing_subflow_inputs",
                    f"Required subflow inputs are not mapped: {', '.join(missing_inputs)}.",
                    "Map every required input in the node properties.",
                )
            )
        outputs = data.get("outputs") or {}
        unknown_outputs = sorted(set(outputs) - set(version.output_schema or {}))
        if unknown_outputs:
            issues.append(
                _issue(
                    node_id,
                    "unknown_subflow_outputs",
                    f"Output mappings reference unknown facts: {', '.join(unknown_outputs)}.",
                    "Refresh the selected version and map only contract outputs.",
                )
            )
    for node in flow.get("nodes", []):
        if node.get("type") not in {"ruleSet", "decisionTable"}:
            continue
        node_id = str(node.get("id", ""))
        data = node.get("data", {})
        raw_version_id = str(data.get("logic_version_id", "")).strip()
        if not raw_version_id:
            issues.append(
                _issue(
                    node_id,
                    "missing_logic_version",
                    "Select a published rule-set or decision-table version.",
                    "Choose a version in the node properties.",
                )
            )
            continue
        try:
            version_id = UUID(raw_version_id)
        except ValueError:
            issues.append(_issue(node_id, "invalid_logic_version", "The logic version ID is invalid.", "Select the version again."))
            continue
        expected_kind = "rule_set" if node.get("type") == "ruleSet" else "decision_table"
        row = db.execute(
            select(LogicAssetVersion, LogicAsset)
            .join(LogicAsset, LogicAsset.id == LogicAssetVersion.logic_asset_id)
            .where(LogicAssetVersion.id == version_id, LogicAsset.user_id == user_id)
        ).first()
        if row is None:
            issues.append(_issue(node_id, "missing_logic_dependency", "The referenced logic version does not exist.", "Select an available published version."))
            continue
        version, asset = row
        if asset.kind != expected_kind:
            issues.append(_issue(node_id, "wrong_logic_dependency", "The selected logic version has the wrong type.", "Select the correct asset type."))
        if not version.published:
            issues.append(_issue(node_id, "draft_logic_dependency", "A bot cannot publish with draft logic.", "Publish the logic asset first."))
        inputs = data.get("inputs") or {}
        missing_inputs = [
            name
            for name, definition in (version.input_schema or {}).items()
            if definition.get("required", True) and name not in inputs
        ]
        if missing_inputs:
            issues.append(_issue(node_id, "missing_logic_inputs", f"Required logic inputs are not mapped: {', '.join(missing_inputs)}.", "Map every required input."))
        outputs = data.get("outputs") or {}
        unknown_outputs = sorted(set(outputs) - set(version.output_schema or {}))
        if unknown_outputs:
            issues.append(_issue(node_id, "unknown_logic_outputs", f"Unknown logic outputs are mapped: {', '.join(unknown_outputs)}.", "Refresh the version and output mappings."))
    provider_kinds = {
        "fileUpload": {"storage"},
        "payment": {"stripe", "paypal"},
        "appointment": {"google_calendar", "microsoft_calendar"},
        "phoneInput": {"sms"},
    }
    for node in flow.get("nodes", []):
        node_type = str(node.get("type"))
        data = node.get("data", {})
        requires_provider = (
            (node_type == "fileUpload" and str(data.get("storage_provider") or "local") != "local")
            or (node_type == "payment" and str(data.get("provider") or "sandbox") not in {"sandbox", "cash"})
            or (node_type == "appointment" and str(data.get("provider") or "local") != "local")
            or (node_type == "phoneInput" and data.get("otp_required") is True)
        )
        if not requires_provider:
            continue
        node_id = str(node.get("id", ""))
        raw_connection_id = str(data.get("provider_connection_id") or "")
        try:
            connection_id = UUID(raw_connection_id)
        except ValueError:
            issues.append(_issue(node_id, "missing_provider_connection", "Select an active provider connection.", "Configure the provider under Integrations, then select it here."))
            continue
        connection = db.scalar(select(IntegrationConnection).where(IntegrationConnection.id == connection_id, IntegrationConnection.user_id == user_id, IntegrationConnection.status == "active"))
        if connection is None or connection.kind not in provider_kinds[node_type]:
            issues.append(_issue(node_id, "invalid_provider_connection", "The selected provider connection is missing, disabled, or has the wrong type.", "Select a matching active provider connection."))
    return ValidationReport(
        valid=not any(issue.severity == "error" for issue in issues),
        issues=issues,
    )


def _issue(node_id: str, code: str, message: str, suggested_fix: str) -> ValidationIssue:
    return ValidationIssue(
        severity="error",
        code=code,
        message=message,
        node_ids=[node_id],
        entity_type="node",
        entity_id=node_id,
        suggested_fix=suggested_fix,
    )
