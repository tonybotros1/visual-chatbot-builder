from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4
from zipfile import ZipFile

from app.services.response_exports import csv_bytes, response_rows, xlsx_bytes


def test_response_exports_flatten_answer_columns_and_create_valid_xlsx() -> None:
    conversation = SimpleNamespace(
        id=uuid4(), session_id="session-1", status="completed", source="widget",
        started_at=datetime(2026, 1, 1, tzinfo=UTC), completed_at=None,
        tags=["lead"], context_data={"country": "AE"},
    )
    answer = SimpleNamespace(variable_name="email", value="paul@example.com")
    rows = response_rows([(conversation, [answer])])
    assert rows[0]["answer:email"] == "paul@example.com"
    assert b"answer:email" in csv_bytes(rows)
    with ZipFile(BytesIO(xlsx_bytes(rows))) as archive:
        assert "xl/worksheets/sheet1.xml" in archive.namelist()
        assert b"paul@example.com" in archive.read("xl/worksheets/sheet1.xml")
