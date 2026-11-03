from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_super_admin
from app.database.session import get_db
from app.models.platform import PlatformSetting
from app.models.user import User
from app.schemas.branding import BrandingRead, BrandingUpdate, merge_branding


router = APIRouter()

BRANDING_KEY = "branding"


def current_branding(db: Session) -> dict[str, str]:
    row = db.get(PlatformSetting, BRANDING_KEY)
    return merge_branding(row.value if row else None)


@router.get("", response_model=BrandingRead)
def read_branding(db: Annotated[Session, Depends(get_db)]) -> BrandingRead:
    """Public: every app (builder, admin console, visitor pages) reads its colours from here."""
    return BrandingRead(**current_branding(db))


@router.put("", response_model=BrandingRead)
def update_branding(
    payload: BrandingUpdate,
    admin: Annotated[User, Depends(get_super_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> BrandingRead:
    row = db.get(PlatformSetting, BRANDING_KEY)
    if row is None:
        row = PlatformSetting(key=BRANDING_KEY, value={})
        db.add(row)
    row.value = {**(row.value or {}), **payload.model_dump(), "updated_by": str(admin.id)}
    db.commit()
    db.refresh(row)
    return BrandingRead(**merge_branding(row.value))
