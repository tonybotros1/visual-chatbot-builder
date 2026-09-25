from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings


ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: UUID) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expires_at},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> UUID | None:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
        return UUID(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        return None

