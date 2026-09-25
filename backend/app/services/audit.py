from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.team import AuditLog


def record_audit(db: Session, bot_id: UUID, user_id: UUID | None, action: str, entity_type: str, entity_id: str = "", details: dict[str, Any] | None = None) -> None:
    db.add(AuditLog(bot_id=bot_id, user_id=user_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details or {}))
