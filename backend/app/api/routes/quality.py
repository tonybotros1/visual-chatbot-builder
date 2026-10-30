from collections import Counter, defaultdict
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.api.routes.flows import _get_draft
from app.database.session import get_db
from app.engine.executor import EngineError
from app.engine.subflows import advance_runtime, apply_runtime_answer, initial_runtime_state
from app.models.conversation import Conversation, ConversationAnswer
from app.models.logic import BotTestScenario
from app.models.user import User
from app.schemas.logic import (
    BotAnalyticsRead,
    ScenarioCreate,
    ScenarioRead,
    ScenarioRunRead,
)
from app.services.conversation_service import _flow_loader, _logic_loader


router = APIRouter()


@router.get("/{bot_id}/tests", response_model=list[ScenarioRead])
def list_scenarios(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BotTestScenario]:
    owned_bot(bot_id, user, db)
    return list(
        db.scalars(
            select(BotTestScenario)
            .where(BotTestScenario.bot_id == bot_id)
            .order_by(BotTestScenario.updated_at.desc())
        )
    )


@router.post("/{bot_id}/tests", response_model=ScenarioRead, status_code=status.HTTP_201_CREATED)
def create_scenario(
    bot_id: UUID,
    payload: ScenarioCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotTestScenario:
    owned_bot(bot_id, user, db, "editor")
    scenario = BotTestScenario(
        bot_id=bot_id,
        name=payload.name.strip(),
        answers=payload.answers,
        expected=payload.expected.model_dump(exclude_none=True),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.put("/{bot_id}/tests/{scenario_id}", response_model=ScenarioRead)
def update_scenario(
    bot_id: UUID,
    scenario_id: UUID,
    payload: ScenarioCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotTestScenario:
    owned_bot(bot_id, user, db, "editor")
    scenario = db.scalar(
        select(BotTestScenario).where(
            BotTestScenario.id == scenario_id,
            BotTestScenario.bot_id == bot_id,
        )
    )
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    scenario.name = payload.name.strip()
    scenario.answers = payload.answers
    scenario.expected = payload.expected.model_dump(exclude_none=True)
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete("/{bot_id}/tests/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    bot_id: UUID,
    scenario_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    owned_bot(bot_id, user, db, "editor")
    scenario = db.scalar(
        select(BotTestScenario).where(
            BotTestScenario.id == scenario_id,
            BotTestScenario.bot_id == bot_id,
        )
    )
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    db.delete(scenario)
    db.commit()


@router.post("/{bot_id}/tests/{scenario_id}/run", response_model=ScenarioRunRead)
def run_scenario(
    bot_id: UUID,
    scenario_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ScenarioRunRead:
    draft = _get_draft(bot_id, user, db)
    scenario = db.scalar(
        select(BotTestScenario).where(
            BotTestScenario.id == scenario_id,
            BotTestScenario.bot_id == bot_id,
        )
    )
    if scenario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    starts = [node for node in draft.flow_json.get("nodes", []) if node.get("type") == "start"]
    if len(starts) != 1:
        raise HTTPException(status_code=422, detail="Draft requires exactly one Start node")
    runtime = initial_runtime_state(str(draft.id), str(starts[0]["id"]), debug=True)
    final_status = "active"
    variables: dict[str, Any] = {}
    terminal_node_id: str | None = None
    try:
        for _ in range(200):
            result = advance_runtime(_flow_loader(db), runtime, _logic_loader(db))
            runtime = result.runtime_state
            variables = result.variables
            if result.completed:
                final_status = "completed"
                terminal_node_id = str(result.next_node.get("id")) if result.next_node else None
                break
            if result.next_node is None:
                break
            node_id = str(result.next_node["id"])
            if node_id not in (scenario.answers or {}):
                final_status = "missing_answer"
                break
            runtime, _, _ = apply_runtime_answer(
                _flow_loader(db),
                runtime,
                node_id,
                scenario.answers[node_id],
            )
        else:
            final_status = "step_limit"
    except EngineError as exc:
        final_status = "error"
        return ScenarioRunRead(
            scenario_id=scenario.id,
            passed=False,
            status=final_status,
            variables=variables,
            failures=[str(exc)],
            trace=runtime.get("trace", []),
        )

    failures: list[str] = []
    expected = scenario.expected or {}
    if expected.get("status") and expected["status"] != final_status:
        failures.append(f"Expected status {expected['status']!r}, got {final_status!r}")
    if expected.get("terminal_node_id") and expected["terminal_node_id"] != terminal_node_id:
        failures.append(f"Expected terminal node {expected['terminal_node_id']!r}, got {terminal_node_id!r}")
    for name, expected_value in (expected.get("variables") or {}).items():
        if variables.get(name) != expected_value:
            failures.append(f"Expected variable {name!r}={expected_value!r}, got {variables.get(name)!r}")
    return ScenarioRunRead(
        scenario_id=scenario.id,
        passed=not failures and final_status == "completed",
        status=final_status,
        variables=variables,
        failures=failures,
        trace=runtime.get("trace", []),
    )


@router.get("/{bot_id}/analytics", response_model=BotAnalyticsRead)
def bot_analytics(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotAnalyticsRead:
    owned_bot(bot_id, user, db)
    conversations = list(db.scalars(select(Conversation).where(Conversation.bot_id == bot_id)))
    ids = [item.id for item in conversations]
    answers = list(
        db.scalars(select(ConversationAnswer).where(ConversationAnswer.conversation_id.in_(ids)))
    ) if ids else []
    completed = sum(item.status == "completed" for item in conversations)
    active = len(conversations) - completed
    drop_off = Counter(
        str(item.current_node_id)
        for item in conversations
        if item.status != "completed" and item.current_node_id
    )
    answer_counts = Counter(str(item.node_id) for item in answers)
    entered = Counter()
    errors = Counter()
    dwell: dict[str, list[float]] = defaultdict(list)
    for conversation in conversations:
        pending: dict[str, datetime] = {}
        for event in (conversation.runtime_state or {}).get("trace", []):
            node_id = str(event.get("node_id") or "")
            if not node_id: continue
            if event.get("action") == "entered":
                entered[node_id] += 1
                try: pending[node_id] = datetime.fromisoformat(str(event.get("at")))
                except (TypeError, ValueError): pass
            elif event.get("action") == "answered" and node_id in pending:
                try:
                    answered_at = datetime.fromisoformat(str(event.get("at")))
                    dwell[node_id].append(max(0.0, (answered_at - pending[node_id]).total_seconds()))
                except (TypeError, ValueError): pass
            elif event.get("action") == "error": errors[node_id] += 1
    all_node_ids = set(entered) | set(answer_counts) | set(drop_off) | set(errors)
    node_metrics = {
        node_id: {
            "entered": entered[node_id], "answered": answer_counts[node_id],
            "dropoffs": drop_off[node_id], "errors": errors[node_id],
            "average_dwell_seconds": round(sum(dwell[node_id]) / len(dwell[node_id]), 3) if dwell[node_id] else 0.0,
        }
        for node_id in all_node_ids
    }
    return BotAnalyticsRead(
        conversations=len(conversations),
        completed=completed,
        active=active,
        completion_rate=(completed / len(conversations)) if conversations else 0.0,
        drop_off_by_node=dict(drop_off),
        answers_by_node=dict(answer_counts),
        node_metrics=node_metrics,
    )
