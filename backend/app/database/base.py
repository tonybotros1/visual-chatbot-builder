from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import models so Alembic and create_all see their metadata.
from app.models import bot, conversation, deployment, integration, localization, logic, provider, subflow, team, user  # noqa: E402,F401
