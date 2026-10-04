from __future__ import annotations

from pathlib import Path
from typing import Any
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font


def _money(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def create_pay_slip_xlsx(output_path: str | Path, settlement: dict[str, Any], staff: dict[str, Any], staff_id: str, ym: str, org: str = "") -> Path:
    data = (settlement.get("byStaff") or {}).get(staff_id) or {"coach": [], "cls": [], "travel": []}
    summary = (settlement.get("summaryByStaff") or {}).get(staff_id) or {}
    rates = settlement.get("rates") or {}

    wb = Workbook()
    ws = wb.active
    ws.title = "지급명세서"
    ws.merge_cells("A1:H1")
    ws["A1"] = f"활동비 지급 명세서 ({ym})"
    ws["A1"].font = Font(bold=True, size=16)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append([f"수령인: {staff.get('nm','')}", "", f"소속: {org}"])
    ws.append([])
    ws.append(["날짜", "구분", "학생/제목", "학교", "시간/회차", "내용", "단가", "지급액"])

    for row in data.get("coach", []):
        ws.append([row.get("date", ""), "학습코칭", row.get("stu", ""), row.get("sc", ""), row.get("time", ""), row.get("topic", ""), _money(rates.get("coach")), _money(row.get("amount"))])
    for row in data.get("cls", []):
        ws.append([row.get("date", ""), "수업협력", row.get("stu", ""), row.get("sc", ""), row.get("time", ""), row.get("topic", ""), _money(rates.get("cls")), _money(row.get("amount"))])
    for row in data.get("travel", []):
        hours = float(row.get("hours") or 0)
        ws.append([row.get("date", ""), "연수출장", row.get("title", ""), "", f"{hours:g}시간", "4시간이상" if hours >= 4 else "4시간미만", _money(row.get("amount")), _money(row.get("amount"))])

    ws.append([])
    ws.append(["학습코칭 소계", _money(summary.get("coachAmount")), "수업협력 소계", _money(summary.get("classAmount")), "출장비 소계", _money(summary.get("travelAmount"))])
    ws.append(["세전 지급액", _money(summary.get("gross")), "공제액", _money(summary.get("tax")), "실지급액", _money(summary.get("net"))])

    for col, width in zip("ABCDEFGH", [12, 12, 20, 18, 14, 24, 14, 14]):
        ws.column_dimensions[col].width = width
    for row in ws.iter_rows(min_row=4):
        for cell in row:
            cell.alignment = Alignment(vertical="center", wrap_text=True)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out


def create_execution_xlsx(output_path: str | Path, settlement: dict[str, Any], staff_by_id: dict[str, dict[str, Any]], ym: str, org: str = "") -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "월별집행내역"
    ws.merge_cells("A1:J1")
    ws["A1"] = f"월별 활동비 집행내역서 ({ym})"
    ws["A1"].font = Font(bold=True, size=16)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append([f"기관: {org}"])
    ws.append([])
    ws.append(["No", "지원단", "코칭(회)", "코칭금액", "협력(회)", "협력금액", "출장(회)", "출장금액", "합계(세전)", "실수령"])

    summaries = settlement.get("summaryByStaff") or {}
    for idx, staff_id in enumerate(sorted(summaries), 1):
        s = summaries[staff_id]
        staff = staff_by_id.get(staff_id) or {}
        ws.append([idx, staff.get("nm", staff_id), s.get("coachCount", 0), _money(s.get("coachAmount")), s.get("classCount", 0), _money(s.get("classAmount")), s.get("travelCount", 0), _money(s.get("travelAmount")), _money(s.get("gross")), _money(s.get("net"))])

    ex = settlement.get("executed") or {}
    ws.append([])
    ws.append(["합계", "", "", _money(ex.get("coach")), "", _money(ex.get("cls")), "", _money(ex.get("travel")), _money(ex.get("total"))])
    for col, width in zip("ABCDEFGHIJ", [8, 14, 10, 14, 10, 14, 10, 14, 16, 16]):
        ws.column_dimensions[col].width = width

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out
