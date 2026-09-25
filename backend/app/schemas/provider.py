from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class UploadInitiate(BaseModel):
    conversation_id: UUID
    node_id: str
    name: str = Field(min_length=1, max_length=500)
    type: str = Field(min_length=1, max_length=200)
    size: int = Field(ge=1)


class UploadTicket(BaseModel):
    upload_url: str
    expires_in: int


class UploadedFileRead(BaseModel):
    file_id: UUID
    name: str
    type: str
    size: int
    scan_status: str
    download_url: str


class PaymentCreate(BaseModel):
    conversation_id: UUID
    node_id: str


class PaymentRead(BaseModel):
    payment_id: UUID
    provider: str
    status: str
    amount: float
    currency: str
    action_url: str | None = None


class AppointmentSlotsRequest(BaseModel):
    conversation_id: UUID
    node_id: str


class AppointmentSlot(BaseModel):
    starts_at: datetime
    ends_at: datetime
    timezone: str


class AppointmentBook(BaseModel):
    conversation_id: UUID
    node_id: str
    starts_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class AppointmentRead(BaseModel):
    appointment_id: UUID
    provider: str
    status: str
    starts_at: datetime
    ends_at: datetime
    timezone: str


class OtpSend(BaseModel):
    conversation_id: UUID
    node_id: str
    phone: str = Field(min_length=7, max_length=80)


class OtpSent(BaseModel):
    challenge_id: UUID
    expires_in: int
    debug_code: str | None = None


class OtpVerify(BaseModel):
    challenge_id: UUID
    code: str = Field(min_length=4, max_length=10)


class OtpVerified(BaseModel):
    challenge_id: UUID
    verified: bool
    answer_value: str
