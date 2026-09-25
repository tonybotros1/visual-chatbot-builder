from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from html import escape
from typing import Any

from app.models.conversation import Conversation, ConversationAnswer


def response_rows(items: list[tuple[Conversation, list[ConversationAnswer]]]) -> list[dict[str, Any]]:
    answer_names = sorted({answer.variable_name for _, answers in items for answer in answers})
    rows: list[dict[str, Any]] = []
    for conversation, answers in items:
        values = {answer.variable_name: answer.value for answer in answers}
        row: dict[str, Any] = {
            "conversation_id": str(conversation.id),
            "session_id": conversation.session_id,
            "status": conversation.status,
            "source": conversation.source,
            "started_at": conversation.started_at.isoformat(),
            "completed_at": conversation.completed_at.isoformat() if conversation.completed_at else "",
            "tags": ", ".join(conversation.tags or []),
            "metadata": json.dumps(conversation.context_data or {}, ensure_ascii=False),
        }
        for name in answer_names:
            value = values.get(name, "")
            row[f"answer:{name}"] = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
        rows.append(row)
    return rows


def csv_bytes(rows: list[dict[str, Any]]) -> bytes:
    stream = io.StringIO(newline="")
    fields = list(rows[0]) if rows else ["conversation_id", "session_id", "status", "source", "started_at", "completed_at", "tags", "metadata"]
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def json_bytes(rows: list[dict[str, Any]]) -> bytes:
    return json.dumps(rows, ensure_ascii=False, indent=2, default=str).encode("utf-8")


def _column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _clean(value: Any) -> str:
    return re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", str(value if value is not None else ""))


def xlsx_bytes(rows: list[dict[str, Any]]) -> bytes:
    fields = list(rows[0]) if rows else ["conversation_id", "session_id", "status", "source", "started_at", "completed_at", "tags", "metadata"]
    data = [fields, *[[row.get(field, "") for field in fields] for row in rows]]
    xml_rows = []
    for row_index, row in enumerate(data, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            ref = f"{_column_name(column_index)}{row_index}"
            style = ' s="1"' if row_index == 1 else ""
            cells.append(f'<c r="{ref}" t="inlineStr"{style}><is><t>{escape(_clean(value))}</t></is></c>')
        xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>' + "".join(xml_rows) + '</sheetData><autoFilter ref="A1:' + _column_name(len(fields)) + str(max(1, len(data))) + '"/></worksheet>'
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Responses" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr("xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs></styleSheet>')
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return output.getvalue()
