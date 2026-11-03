from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_super_admin
from app.database.session import get_db
from app.models.platform import PlatformSetting
from app.models.user import User
from app.schemas.platform import AccessRead, AccessUpdate, SiteRead, SiteUpdate, merge_access, merge_site


router = APIRouter()

ACCESS_KEY = "access"
SITE_KEY = "site"


def current_access(db: Session) -> dict[str, str]:
    row = db.get(PlatformSetting, ACCESS_KEY)
    return merge_access(row.value if row else None)


def bot_sharing_mode(db: Session) -> str:
    return current_access(db)["bot_sharing"]


@router.get("/access", response_model=AccessRead)
def read_access(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> AccessRead:
    return AccessRead(**current_access(db))


@router.put("/access", response_model=AccessRead)
def update_access(
    payload: AccessUpdate,
    admin: Annotated[User, Depends(get_super_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> AccessRead:
    row = db.get(PlatformSetting, ACCESS_KEY)
    if row is None:
        row = PlatformSetting(key=ACCESS_KEY, value={})
        db.add(row)
    row.value = {**(row.value or {}), **payload.model_dump(), "updated_by": str(admin.id)}
    db.commit()
    db.refresh(row)
    return AccessRead(**merge_access(row.value))


def public_site_url(db: Session) -> str:
    row = db.get(PlatformSetting, SITE_KEY)
    return merge_site(row.value if row else None)["public_url"]


@router.get("/site", response_model=SiteRead)
def read_site(db: Annotated[Session, Depends(get_db)]) -> SiteRead:
    """Public: the address share links and embed snippets should use (empty = the address the page was opened with)."""
    return SiteRead(public_url=public_site_url(db))


@router.put("/site", response_model=SiteRead)
def update_site(
    payload: SiteUpdate,
    admin: Annotated[User, Depends(get_super_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> SiteRead:
    row = db.get(PlatformSetting, SITE_KEY)
    if row is None:
        row = PlatformSetting(key=SITE_KEY, value={})
        db.add(row)
    row.value = {**(row.value or {}), "public_url": payload.public_url, "updated_by": str(admin.id)}
    db.commit()
    db.refresh(row)
    return SiteRead(public_url=merge_site(row.value)["public_url"])
