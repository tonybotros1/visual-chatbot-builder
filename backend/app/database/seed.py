from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.bot import Bot, BotVersion
from app.models.subflow import Subflow, SubflowVersion
from app.models.user import User
from app.security import hash_password, verify_password


DEMO_BOT_ID = UUID("00000000-0000-0000-0000-000000000002")
DEMO_SUBFLOW_ID = UUID("00000000-0000-0000-0000-000000000003")
DEMO_SUBFLOW_DRAFT_ID = UUID("00000000-0000-0000-0000-000000000004")
DEMO_SUBFLOW_VERSION_ID = UUID("00000000-0000-0000-0000-000000000005")

DEFAULT_FLOW = {
    "nodes": [
        {
            "id": "start",
            "type": "start",
            "position": {"x": 80, "y": 220},
            "data": {"label": "Start", "node_number": 1},
        },
        {
            "id": "welcome-message",
            "type": "message",
            "position": {"x": 350, "y": 210},
            "data": {
                "label": "Welcome! Let's check your eligibility.",
                "description": "A short opening message before the first question.",
                "node_number": 2,
            },
        },
        {
            "id": "continue-choice",
            "type": "singleChoice",
            "position": {"x": 665, "y": 190},
            "data": {
                "label": "Would you like to continue?",
                "variable": "continue_choice",
                "options": ["Yes", "No"],
                "node_number": 3,
            },
        },
        {
            "id": "yes-end",
            "type": "end",
            "position": {"x": 1020, "y": 95},
            "data": {"label": "Continue path complete", "node_number": 4},
        },
        {
            "id": "no-end",
            "type": "end",
            "position": {"x": 1020, "y": 330},
            "data": {"label": "Conversation ended", "node_number": 5},
        },
    ],
    "edges": [
        {"id": "start-welcome", "source": "start", "target": "welcome-message"},
        {
            "id": "welcome-choice",
            "source": "welcome-message",
            "target": "continue-choice",
        },
        {
            "id": "choice-yes",
            "source": "continue-choice",
            "sourceHandle": "option-0",
            "target": "yes-end",
            "label": "Yes",
        },
        {
            "id": "choice-no",
            "source": "continue-choice",
            "sourceHandle": "option-1",
            "target": "no-end",
            "label": "No",
        },
    ],
    "variables": [],
}


DEMO_SUBFLOW_FLOW = {
    "nodes": [
        {
            "id": "start",
            "type": "start",
            "position": {"x": 80, "y": 220},
            "data": {"label": "Start"},
        },
        {
            "id": "check-consent",
            "type": "condition",
            "position": {"x": 350, "y": 200},
            "data": {
                "label": "Check consent",
                "variable": "continue_choice",
                "operator": "==",
                "value": "Yes",
            },
        },
        {
            "id": "approve",
            "type": "setVariable",
            "position": {"x": 660, "y": 110},
            "data": {"label": "Approve", "variable": "approved", "value": True},
        },
        {
            "id": "decline",
            "type": "setVariable",
            "position": {"x": 660, "y": 320},
            "data": {"label": "Decline", "variable": "approved", "value": False},
        },
        {
            "id": "return",
            "type": "return",
            "position": {"x": 980, "y": 215},
            "data": {"label": "Return approval"},
        },
    ],
    "edges": [
        {"id": "start-check", "source": "start", "target": "check-consent"},
        {
            "id": "check-yes",
            "source": "check-consent",
            "sourceHandle": "true",
            "target": "approve",
        },
        {
            "id": "check-no",
            "source": "check-consent",
            "sourceHandle": "false",
            "target": "decline",
        },
        {"id": "approve-return", "source": "approve", "target": "return"},
        {"id": "decline-return", "source": "decline", "target": "return"},
    ],
    "variables": [],
}

DEMO_SUBFLOW_INPUTS = {
    "continue_choice": {
        "type": "enum",
        "required": True,
        "description": "The answer collected by the parent bot.",
        "values": ["Yes", "No"],
    }
}

DEMO_SUBFLOW_OUTPUTS = {
    "approved": {
        "type": "boolean",
        "required": True,
        "description": "Whether the user can continue.",
        "values": [],
    }
}


def seed_platform_admin(session: Session) -> User | None:
    """Create or update the super admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD."""
    settings = get_settings()
    email = settings.super_admin_email.strip().lower()
    if not email:
        return None
    user = session.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        if not settings.super_admin_password:
            return None
        user = User(name=settings.super_admin_name, email=email, password_hash=hash_password(settings.super_admin_password), role="superadmin", is_active=True)
        session.add(user)
    else:
        user.role = "superadmin"
        user.is_active = True
        # The environment password is authoritative so a lost password can be reset by redeploying.
        if settings.super_admin_password and not verify_password(settings.super_admin_password, user.password_hash):
            user.password_hash = hash_password(settings.super_admin_password)
    session.flush()
    return user


def seed_development_data(session: Session) -> None:
    owner = seed_platform_admin(session)
    if owner is None or not get_settings().seed_demo_data:
        session.commit()
        return
    owner_id = owner.id

    bot = session.get(Bot, DEMO_BOT_ID)
    if bot is None:
        bot = Bot(
            id=DEMO_BOT_ID,
            user_id=owner_id,
            name="Eligibility demo",
            slug="eligibility-demo",
            description="First V1 visual flow",
            status="draft",
        )
        session.add(bot)
        session.flush()

    draft = session.scalar(
        select(BotVersion).where(
            BotVersion.bot_id == DEMO_BOT_ID,
            BotVersion.version_number == 0,
        )
    )
    if draft is None:
        session.add(
            BotVersion(
                bot_id=DEMO_BOT_ID,
                version_number=0,
                flow_json=DEFAULT_FLOW,
                published=False,
            )
        )

    subflow = session.get(Subflow, DEMO_SUBFLOW_ID)
    if subflow is None:
        subflow = Subflow(
            id=DEMO_SUBFLOW_ID,
            user_id=owner_id,
            name="Consent decision",
            slug="consent-decision",
            description="Reusable typed decision component for the V2 subflow runtime.",
            status="published",
        )
        session.add(subflow)
        session.flush()

    subflow_draft = session.get(SubflowVersion, DEMO_SUBFLOW_DRAFT_ID)
    if subflow_draft is None:
        session.add(
            SubflowVersion(
                id=DEMO_SUBFLOW_DRAFT_ID,
                subflow_id=DEMO_SUBFLOW_ID,
                version_number=0,
                flow_json=DEMO_SUBFLOW_FLOW,
                input_schema=DEMO_SUBFLOW_INPUTS,
                output_schema=DEMO_SUBFLOW_OUTPUTS,
                published=False,
            )
        )

    subflow_version = session.get(SubflowVersion, DEMO_SUBFLOW_VERSION_ID)
    if subflow_version is None:
        session.add(
            SubflowVersion(
                id=DEMO_SUBFLOW_VERSION_ID,
                subflow_id=DEMO_SUBFLOW_ID,
                version_number=1,
                flow_json=DEMO_SUBFLOW_FLOW,
                input_schema=DEMO_SUBFLOW_INPUTS,
                output_schema=DEMO_SUBFLOW_OUTPUTS,
                published=True,
            )
        )

    session.commit()
