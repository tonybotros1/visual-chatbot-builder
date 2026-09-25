from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.database.session import get_db
from app.engine.executor import EngineError
from app.models.bot import Bot, BotVersion
from app.models.conversation import Conversation, ConversationAnswer
from app.models.provider import StoredFile
from app.models.user import User
from app.schemas.conversation import (
    AnswerRequest,
    AnswerRead,
    ConversationRead,
    ConversationStart,
    ConversationState,
    ConversationUpdate,
)
from app.services.conversation_service import start_conversation, submit_answer
from app.services.response_exports import csv_bytes, json_bytes, response_rows, xlsx_bytes
from app.services.providers import delete_file_content


router = APIRouter()
public_router = APIRouter()


def _version_for_bot(db: Session, bot_id: UUID, *, draft: bool) -> BotVersion:
    query = select(BotVersion).where(BotVersion.bot_id == bot_id)
    if draft:
        query = query.where(BotVersion.version_number == 0, BotVersion.published.is_(False))
    else:
        query = query.where(BotVersion.published.is_(True)).order_by(BotVersion.version_number.desc())
    version = db.scalar(query)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No runnable bot version")
    return version


@router.post("/bots/{bot_id}/preview/start", response_model=ConversationState)
def preview_start(
    bot_id: UUID,
    payload: ConversationStart,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationState:
    owned_bot(bot_id, user, db)
    return _start(db, _version_for_bot(db, bot_id, draft=True), payload, debug=True, source="preview")


@public_router.post("/{identifier}/start", response_model=ConversationState)
def public_start(
    identifier: str,
    payload: ConversationStart,
    db: Annotated[Session, Depends(get_db)],
) -> ConversationState:
    try:
        bot_id = UUID(identifier)
        bot = db.get(Bot, bot_id)
    except ValueError:
        bot = db.scalar(select(Bot).where(Bot.slug == identifier))
    if bot is None or bot.status != "published":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Published bot not found")
    return _start(db, _version_for_bot(db, bot.id, draft=False), payload, debug=False, source="public")


@router.post("/conversations/{conversation_id}/answer", response_model=ConversationState)
def answer(
    conversation_id: UUID,
    payload: AnswerRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ConversationState:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    version = db.get(BotVersion, conversation.bot_version_id)
    if version is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Conversation version missing")
    try:
        return submit_answer(db, conversation, version, payload.node_id, payload.value)
    except EngineError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.get("/bots/{bot_id}/responses", response_model=list[ConversationRead])
def responses(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    tag: str | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[ConversationRead]:
    owned_bot(bot_id, user, db)
    query = select(Conversation).where(Conversation.bot_id == bot_id)
    if status_filter:
        query = query.where(Conversation.status == status_filter)
    if tag:
        query = query.where(Conversation.tags.contains([tag]))
    if search:
        query = query.where(Conversation.session_id.ilike(f"%{search}%"))
    items = list(
        db.scalars(
            query.order_by(Conversation.started_at.desc()).offset(offset).limit(limit)
        )
    )
    return [_conversation_read(db, item) for item in items]


@router.patch("/conversations/{conversation_id}", response_model=ConversationRead)
def update_conversation(
    conversation_id: UUID,
    payload: ConversationUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationRead:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    owned_bot(conversation.bot_id, user, db, "editor")
    allowed = {"active", "completed", "qualified", "spam", "archived"}
    if payload.status is not None:
        if payload.status not in allowed:
            raise HTTPException(status_code=422, detail="Unsupported response status")
        conversation.status = payload.status
    if payload.tags is not None:
        conversation.tags = sorted({tag.strip() for tag in payload.tags if tag.strip()})[:30]
    if payload.note and payload.note.strip():
        conversation.notes = [*(conversation.notes or []), {"text": payload.note.strip(), "created_at": datetime.now(UTC).isoformat(), "user_id": str(user.id)}]
    db.commit()
    db.refresh(conversation)
    return _conversation_read(db, conversation)


@router.get("/bots/{bot_id}/responses/export")
def export_responses(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    format: Literal["csv", "json", "xlsx"] = "csv",
) -> Response:
    owned_bot(bot_id, user, db)
    conversations = list(db.scalars(select(Conversation).where(Conversation.bot_id == bot_id).order_by(Conversation.started_at.desc())))
    items = [
        (
            conversation,
            list(db.scalars(select(ConversationAnswer).where(ConversationAnswer.conversation_id == conversation.id).order_by(ConversationAnswer.created_at))),
        )
        for conversation in conversations
    ]
    rows = response_rows(items)
    if format == "json":
        body, media = json_bytes(rows), "application/json"
    elif format == "xlsx":
        body, media = xlsx_bytes(rows), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        body, media = csv_bytes(rows), "text/csv; charset=utf-8"
    return Response(body, media_type=media, headers={"Content-Disposition": f'attachment; filename="responses.{format}"'})


@router.get("/conversations/{conversation_id}", response_model=ConversationRead)
def conversation_detail(
    conversation_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ConversationRead:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    owned_bot(conversation.bot_id, user, db)
    return _conversation_read(db, conversation)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None: raise HTTPException(status_code=404, detail="Conversation not found")
    owned_bot(conversation.bot_id, user, db, "editor")
    _delete_stored_files(db, [conversation.id])
    db.delete(conversation); db.commit()


@router.delete("/bots/{bot_id}/responses/purge", response_model=dict[str, int])
def purge_responses(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    older_than_days: Annotated[int, Query(ge=1, le=3650)] = 365,
) -> dict[str, int]:
    owned_bot(bot_id, user, db, "admin")
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
    items = list(db.scalars(select(Conversation).where(Conversation.bot_id == bot_id, Conversation.started_at < cutoff)))
    _delete_stored_files(db, [item.id for item in items])
    for item in items: db.delete(item)
    db.commit()
    return {"deleted": len(items)}


def _delete_stored_files(db: Session, conversation_ids: list[UUID]) -> None:
    if not conversation_ids: return
    files = list(db.scalars(select(StoredFile).where(StoredFile.conversation_id.in_(conversation_ids))))
    for item in files:
        try: delete_file_content(db, item)
        except (OSError, EngineError): pass


def _start(
    db: Session,
    version: BotVersion,
    payload: ConversationStart,
    *,
    debug: bool,
    source: str = "public",
    metadata: dict | None = None,
) -> ConversationState:
    try:
        return start_conversation(db, version, session_id=payload.session_id, debug=debug, source=source, metadata=metadata or payload.metadata, locale=payload.locale)
    except EngineError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


def _conversation_read(db: Session, conversation: Conversation) -> ConversationRead:
    answers = list(
        db.scalars(
            select(ConversationAnswer)
            .where(ConversationAnswer.conversation_id == conversation.id)
            .order_by(ConversationAnswer.created_at)
        )
    )
    return ConversationRead(
        id=conversation.id,
        session_id=conversation.session_id,
        status=conversation.status,
        current_node_id=conversation.current_node_id,
        variables=conversation.variables or {},
        started_at=conversation.started_at,
        completed_at=conversation.completed_at,
        answers=[AnswerRead.model_validate(item) for item in answers],
        trace=(conversation.runtime_state or {}).get("trace", []),
        source=conversation.source,
        metadata=conversation.context_data or {},
        tags=conversation.tags or [],
        notes=conversation.notes or [],
    )
