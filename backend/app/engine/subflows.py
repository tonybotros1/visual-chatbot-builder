from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Callable

from app.engine.executor import (
    INPUT_TYPES,
    MESSAGE_TYPES,
    TERMINAL_TYPES,
    EngineError,
    answer_target,
    edge_target,
    evaluate_condition,
    validate_answer,
)
from app.engine.facts import resolve_mapping, validate_facts
from app.engine.logic import LoadedLogic, evaluate_logic


@dataclass(frozen=True)
class LoadedFlow:
    kind: str
    version_id: str
    flow: dict[str, Any]
    input_schema: dict[str, dict[str, Any]]
    output_schema: dict[str, dict[str, Any]]
    published: bool


@dataclass
class RuntimeAdvanceResult:
    messages: list[dict[str, Any]]
    next_node: dict[str, Any] | None
    variables: dict[str, Any]
    completed: bool
    runtime_state: dict[str, Any]


FlowLoader = Callable[[str, str], LoadedFlow]
LogicLoader = Callable[[str, str], LoadedLogic]


def initial_runtime_state(version_id: str, start_node_id: str, *, debug: bool = False, locale: str = "en", direction: str = "ltr", translations: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "debug": debug,
        "trace": [],
        "locale": locale,
        "direction": direction,
        "translations": translations or {},
        "frames": [
            {
                "kind": "bot",
                "version_id": version_id,
                "node_id": start_node_id,
                "variables": {},
            }
        ]
    }


def advance_runtime(
    loader: FlowLoader,
    runtime_state: dict[str, Any],
    logic_loader: LogicLoader | None = None,
) -> RuntimeAdvanceResult:
    state = deepcopy(runtime_state)
    frames = state.get("frames")
    if not isinstance(frames, list) or not frames:
        raise EngineError("Runtime state does not contain an execution frame")

    messages: list[dict[str, Any]] = []
    visited_steps = 0

    while frames:
        visited_steps += 1
        if visited_steps > 100:
            raise EngineError("Flow exceeded 100 automatic steps; check for a circular path")
        if len(frames) > 12:
            raise EngineError("Subflow nesting exceeded the maximum depth of 12")

        frame = frames[-1]
        if frame.pop("preview_complete", False):
            return _result(messages, None, True, state)
        loaded = loader(str(frame["kind"]), str(frame["version_id"]))
        flow = loaded.flow
        node_by_id = {node["id"]: node for node in flow.get("nodes", [])}
        node_id = frame.get("node_id")
        if not node_id or node_id not in node_by_id:
            raise EngineError(f"Node not found: {node_id}")
        node = node_by_id[node_id]
        node_type = node.get("type")
        data = node.get("data", {})
        variables = frame.setdefault("variables", {})
        _trace(state, frame, node, "entered", variables=variables)

        if node_type in INPUT_TYPES:
            return _result(messages, _localized_node(node, state), False, state)
        if node_type in MESSAGE_TYPES:
            messages.append(_localized_node(node, state))
            frame["node_id"] = edge_target(flow.get("edges", []), node_id)
            continue
        if node_type == "setVariable":
            variable = str(data.get("variable", "")).strip()
            if variable:
                variables[variable] = data.get("value")
            frame["node_id"] = edge_target(flow.get("edges", []), node_id)
            continue
        if node_type == "condition":
            conditions = data.get("conditions") or [
                {
                    "variable": data.get("variable"),
                    "operator": data.get("operator", "=="),
                    "value": data.get("value"),
                }
            ]
            evaluations = [evaluate_condition(item, variables) for item in conditions]
            matched = all(evaluations) if data.get("match", "all") == "all" else any(evaluations)
            _trace(
                state,
                frame,
                node,
                "condition",
                details={"matched": matched, "evaluations": evaluations},
                variables=variables,
            )
            frame["node_id"] = edge_target(
                flow.get("edges", []),
                node_id,
                "true" if matched else "false",
            )
            continue
        if node_type in {"ruleSet", "decisionTable"}:
            if logic_loader is None:
                raise EngineError("Logic loader is not configured")
            dependency_id = str(data.get("logic_version_id", "")).strip()
            if not dependency_id:
                raise EngineError("Logic node is missing a pinned version")
            kind = "rule_set" if node_type == "ruleSet" else "decision_table"
            dependency = logic_loader(kind, dependency_id)
            if not dependency.published:
                raise EngineError("Logic nodes must reference a published version")
            local_facts = {
                name: resolve_mapping(mapping, variables)
                for name, mapping in (data.get("inputs") or {}).items()
            }
            evaluation = evaluate_logic(dependency, local_facts)
            for output_name, parent_name in (data.get("outputs") or {}).items():
                destination = str(parent_name).strip()
                if destination and output_name in evaluation.outputs:
                    variables[destination] = evaluation.outputs[output_name]
            _trace(
                state,
                frame,
                node,
                "logic_evaluated",
                details={
                    "logic_kind": kind,
                    "logic_version_id": dependency_id,
                    "matched": evaluation.matched,
                    "evaluation": evaluation.trace,
                },
                variables=variables,
            )
            frame["node_id"] = edge_target(flow.get("edges", []), node_id)
            continue
        if node_type == "start":
            frame["node_id"] = edge_target(flow.get("edges", []), node_id)
            continue
        if node_type == "subflow":
            dependency_id = str(data.get("subflow_version_id", "")).strip()
            if not dependency_id:
                raise EngineError("Subflow node is missing a pinned version")
            if any(
                item.get("kind") == "subflow" and str(item.get("version_id")) == dependency_id
                for item in frames
            ):
                raise EngineError("Circular subflow reference detected")
            dependency = loader("subflow", dependency_id)
            if not dependency.published:
                raise EngineError("Subflow node must reference a published version")
            starts = [item for item in dependency.flow.get("nodes", []) if item.get("type") == "start"]
            if len(starts) != 1:
                raise EngineError("Subflow must contain exactly one Start node")
            input_mapping = data.get("inputs") or {}
            child_variables = {
                name: resolve_mapping(mapping, variables)
                for name, mapping in input_mapping.items()
            }
            validate_facts(
                dependency.input_schema,
                child_variables,
                context=f"Subflow {data.get('subflow_name') or dependency_id}",
            )
            parent_target = edge_target(flow.get("edges", []), node_id)
            if parent_target is None:
                raise EngineError("Subflow node has no connected return path")
            frame["node_id"] = parent_target
            frames.append(
                {
                    "kind": "subflow",
                    "version_id": dependency_id,
                    "node_id": starts[0]["id"],
                    "variables": child_variables,
                    "caller_node_id": node_id,
                    "output_mapping": data.get("outputs") or {},
                }
            )
            continue
        if node_type in TERMINAL_TYPES | {"return"}:
            if len(frames) == 1:
                return _result(messages, _localized_node(node, state), True, state)
            validate_facts(
                loaded.output_schema,
                variables,
                context="Subflow output",
            )
            child = frames.pop()
            parent = frames[-1]
            parent_variables = parent.setdefault("variables", {})
            for child_name, parent_name in (child.get("output_mapping") or {}).items():
                destination = str(parent_name).strip()
                if destination and child_name in variables:
                    parent_variables[destination] = variables[child_name]
            continue
        raise EngineError(f"Unsupported node type: {node_type}")

    raise EngineError("Runtime exited without a root frame")


def apply_runtime_answer(
    loader: FlowLoader,
    runtime_state: dict[str, Any],
    node_id: str,
    value: Any,
) -> tuple[dict[str, Any], str, Any]:
    state = deepcopy(runtime_state)
    frames = state.get("frames")
    if not isinstance(frames, list) or not frames:
        raise EngineError("Runtime state does not contain an execution frame")
    frame = frames[-1]
    loaded = loader(str(frame["kind"]), str(frame["version_id"]))
    node = next((item for item in loaded.flow.get("nodes", []) if item.get("id") == node_id), None)
    if node is None or frame.get("node_id") != node_id:
        raise EngineError("This node is not awaiting an answer")
    normalized = validate_answer(node, value)
    variable_name = str(node.get("data", {}).get("variable") or node_id)
    frame.setdefault("variables", {})[variable_name] = normalized
    _trace(
        state,
        frame,
        node,
        "answered",
        details={"variable": variable_name, "value": normalized},
        variables=frame["variables"],
    )
    target = answer_target(loaded.flow, node, normalized)
    if target is None:
        if state.get("debug") and len(frames) == 1:
            frame["preview_complete"] = True
            return state, variable_name, normalized
        raise EngineError("The selected answer has no connected path")
    frame["node_id"] = target
    return state, variable_name, normalized


def _result(
    messages: list[dict[str, Any]],
    next_node: dict[str, Any] | None,
    completed: bool,
    state: dict[str, Any],
) -> RuntimeAdvanceResult:
    frames = state["frames"]
    root_variables = dict(frames[0].get("variables") or {})
    return RuntimeAdvanceResult(
        messages=messages,
        next_node=next_node,
        variables=root_variables,
        completed=completed,
        runtime_state=state,
    )


def _trace(
    state: dict[str, Any],
    frame: dict[str, Any],
    node: dict[str, Any],
    action: str,
    *,
    details: dict[str, Any] | None = None,
    variables: dict[str, Any] | None = None,
) -> None:
    trace = state.setdefault("trace", [])
    trace.append(
        {
            "sequence": len(trace) + 1,
            "at": datetime.now(UTC).isoformat(),
            "frame_kind": frame.get("kind"),
            "version_id": str(frame.get("version_id")),
            "node_id": str(node.get("id")),
            "node_type": str(node.get("type")),
            "action": action,
            "details": deepcopy(details or {}),
            "variables": deepcopy(variables or {}),
        }
    )
    if len(trace) > 500:
        del trace[:-500]


def _localized_node(node: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    translations = state.get("translations") or {}
    if not translations: return node
    result = deepcopy(node)
    data = result.setdefault("data", {})
    node_id = str(node.get("id"))
    for field in ("label", "description", "cta_label", "whatsapp_message"):
        key = f"{node_id}.{field}"
        if key in translations: data[field] = translations[key]
    if isinstance(data.get("options"), list):
        data["options"] = [translations.get(f"{node_id}.option.{index}", value) for index, value in enumerate(data["options"])]
    if isinstance(data.get("links"), list):
        data["links"] = [{**item, "label": translations.get(f"{node_id}.link.{index}.label", item.get("label"))} for index, item in enumerate(data["links"])]
    return result
