from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database.session import get_db
from app.engine.executor import EngineError, validate_answer
from app.models.provider import PaymentTransaction, StoredFile
from app.schemas.provider import (
    AppointmentBook, AppointmentRead, AppointmentSlot, AppointmentSlotsRequest,
    PaymentCreate, PaymentRead, UploadInitiate, UploadTicket, UploadedFileRead,
    OtpSend, OtpSent, OtpVerify, OtpVerified,
)
from app.services.providers import (
    appointment_slots, book_appointment, create_download_token, create_payment,
    create_upload_token, current_provider_node, decode_download_token, decode_upload_token,
    safe_filename, scan_bytes, storage_path,
    refresh_payment,
    send_otp, verify_otp,
    read_file_content, store_file_content,
)


router = APIRouter()


def _engine_error(exc: EngineError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@router.post("/files/initiate", response_model=UploadTicket)
def initiate_upload(payload: UploadInitiate, request: Request, db: Annotated[Session, Depends(get_db)]) -> UploadTicket:
    try:
        _, node = current_provider_node(db, payload.conversation_id, payload.node_id, "fileUpload")
        validate_answer(node, {"name": payload.name, "type": payload.type, "size": payload.size})
        if payload.size > get_settings().max_upload_size_mb * 1024 * 1024: raise EngineError("File exceeds the server upload limit")
        token = create_upload_token({**payload.model_dump(mode="json"), "storage_provider": node.get("data", {}).get("storage_provider", "local"), "provider_connection_id": node.get("data", {}).get("provider_connection_id")})
    except EngineError as exc: raise _engine_error(exc) from exc
    return UploadTicket(upload_url=str(request.url_for("upload_file", token=token)), expires_in=900)


@router.put("/files/upload/{token}", response_model=UploadedFileRead, name="upload_file")
async def upload_file(token: str, request: Request, db: Annotated[Session, Depends(get_db)]) -> UploadedFileRead:
    try: payload = decode_upload_token(token)
    except EngineError as exc: raise _engine_error(exc) from exc
    content = await request.body()
    if len(content) != int(payload["size"]): raise HTTPException(status_code=422, detail="Uploaded size does not match the ticket")
    scan_status = scan_bytes(content)
    storage_key = f"{payload['conversation_id']}/{uuid4().hex}-{safe_filename(str(payload['name']))}"
    storage_provider, connection_id = "local", None
    if scan_status == "clean":
        try: storage_provider, connection_id = store_file_content(db, payload, storage_key, content)
        except EngineError as exc: raise _engine_error(exc) from exc
    item = StoredFile(
        conversation_id=UUID(str(payload["conversation_id"])), node_id=str(payload["node_id"]),
        connection_id=connection_id, storage_provider=storage_provider,
        original_name=str(payload["name"]), mime_type=str(payload["type"]), size=len(content),
        storage_key=storage_key, scan_status=scan_status,
    )
    db.add(item); db.commit(); db.refresh(item)
    if scan_status != "clean": raise HTTPException(status_code=422, detail="File failed malware scanning")
    download = str(request.url_for("download_file", token=create_download_token(item.id)))
    return UploadedFileRead(file_id=item.id, name=item.original_name, type=item.mime_type, size=item.size, scan_status=item.scan_status, download_url=download)


@router.get("/files/download/{token}", name="download_file")
def download_file(token: str, db: Annotated[Session, Depends(get_db)]) -> Response:
    try: file_id = decode_download_token(token)
    except EngineError as exc: raise HTTPException(status_code=403, detail=str(exc)) from exc
    item = db.get(StoredFile, file_id)
    if item is None or item.scan_status != "clean": raise HTTPException(status_code=404, detail="File not found")
    if item.storage_provider == "local":
        path = storage_path(item.storage_key)
        if not path.is_file(): raise HTTPException(status_code=404, detail="Stored file is unavailable")
        return FileResponse(path, media_type=item.mime_type, filename=item.original_name)
    try: body = read_file_content(db, item)
    except EngineError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(body, media_type=item.mime_type, headers={"Content-Disposition": f'attachment; filename="{safe_filename(item.original_name)}"'})


@router.post("/payments", response_model=PaymentRead)
def start_payment(payload: PaymentCreate, request: Request, db: Annotated[Session, Depends(get_db)]) -> PaymentRead:
    try: item = create_payment(db, payload.conversation_id, payload.node_id)
    except EngineError as exc: raise _engine_error(exc) from exc
    action = str(request.url_for("complete_sandbox_payment", payment_id=item.id)) if item.provider == "sandbox" else (item.details or {}).get("action_url")
    return PaymentRead(payment_id=item.id, provider=item.provider, status=item.status, amount=item.amount_minor / 100, currency=item.currency, action_url=action)


@router.get("/payments/{payment_id}", response_model=PaymentRead)
def payment_status(payment_id: UUID, db: Annotated[Session, Depends(get_db)]) -> PaymentRead:
    item = db.get(PaymentTransaction, payment_id)
    if item is None: raise HTTPException(status_code=404, detail="Payment not found")
    try: item = refresh_payment(db, item)
    except EngineError as exc: raise _engine_error(exc) from exc
    return PaymentRead(payment_id=item.id, provider=item.provider, status=item.status, amount=item.amount_minor / 100, currency=item.currency, action_url=(item.details or {}).get("action_url"))


@router.post("/payments/{payment_id}/sandbox-complete", response_model=PaymentRead, name="complete_sandbox_payment")
def complete_sandbox_payment(payment_id: UUID, db: Annotated[Session, Depends(get_db)]) -> PaymentRead:
    item = db.get(PaymentTransaction, payment_id)
    if item is None or item.provider != "sandbox": raise HTTPException(status_code=404, detail="Sandbox payment not found")
    item.status = "paid"; db.commit(); db.refresh(item)
    return PaymentRead(payment_id=item.id, provider=item.provider, status=item.status, amount=item.amount_minor / 100, currency=item.currency)


@router.post("/appointments/slots", response_model=list[AppointmentSlot])
def available_slots(payload: AppointmentSlotsRequest, db: Annotated[Session, Depends(get_db)]) -> list[AppointmentSlot]:
    try: return [AppointmentSlot(starts_at=start, ends_at=end, timezone=timezone) for start, end, timezone in appointment_slots(db, payload.conversation_id, payload.node_id)]
    except EngineError as exc: raise _engine_error(exc) from exc


@router.post("/appointments/book", response_model=AppointmentRead)
def reserve_appointment(payload: AppointmentBook, db: Annotated[Session, Depends(get_db)]) -> AppointmentRead:
    try: item = book_appointment(db, payload.conversation_id, payload.node_id, payload.starts_at, payload.metadata)
    except EngineError as exc: raise _engine_error(exc) from exc
    return AppointmentRead(appointment_id=item.id, provider=item.provider, status=item.status, starts_at=item.starts_at, ends_at=item.ends_at, timezone=item.timezone)


@router.post("/otp/send", response_model=OtpSent)
def request_otp(payload: OtpSend, db: Annotated[Session, Depends(get_db)]) -> OtpSent:
    try: challenge, debug_code = send_otp(db, payload.conversation_id, payload.node_id, payload.phone)
    except EngineError as exc: raise _engine_error(exc) from exc
    return OtpSent(challenge_id=challenge.id, expires_in=600, debug_code=debug_code)


@router.post("/otp/verify", response_model=OtpVerified)
def confirm_otp(payload: OtpVerify, db: Annotated[Session, Depends(get_db)]) -> OtpVerified:
    try: challenge = verify_otp(db, payload.challenge_id, payload.code)
    except EngineError as exc: raise _engine_error(exc) from exc
    return OtpVerified(challenge_id=challenge.id, verified=True, answer_value=challenge.phone)
