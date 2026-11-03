from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import models so Alembic and create_all see their metadata.
from app.models import bot, conversation, deployment, integration, localization, logic, platform, provider, subflow, team, user, workspace  # noqa: E402,F401
