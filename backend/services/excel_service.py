from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

from services.format_contract import get_format_contract


VERIFIED_STATUSES = {"verified", "paid"}


def _money(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _today_str() -> str:
    return date.today().isoformat()


def _set_widths(ws, widths: list[int | float]) -> None:
    for idx, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(idx)].width = width


def _mask_name(student: dict[str, Any] | None, cfg: dict[str, Any]) -> str:
    if not student:
        return ""
    name = str(student.get("nm") or "")
    mode = str(cfg.get("maskMode") or "full")
    if mode == "ooo":
        return "OOO"
    if mode == "partial" and name:
        if len(name) == 1:
            return "*"
        if len(name) == 2:
            return name[0] + "*"
        return name[0] + ("*" * (len(name) - 2)) + name[-1]
    return name


def _time_hours(value: Any) -> float:
    text = str(value or "")
    m = re.search(r"(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})", text)
    if not m:
        return 0.0
    start = int(m.group(1)) * 60 + int(m.group(2))
    end = int(m.group(3)) * 60 + int(m.group(4))
    return max(0.0, (end - start) / 60)


def create_pay_slip_xlsx(
    output_path: str | Path,
    settlement: dict[str, Any],
    staff: dict[str, Any],
    staff_id: str,
    ym: str,
    org: str = "",
) -> Path:
    contract = get_format_contract("pay_slip")
    data = (settlement.get("byStaff") or {}).get(staff_id) or {"coach": [], "cls": [], "travel": []}
    summary = (settlement.get("summaryByStaff") or {}).get(staff_id) or {}
    rates = settlement.get("rates") or {}

    wb = Workbook()
    ws = wb.active
    ws.title = contract["sheet"]
    ws.merge_cells("A1:H1")
    ws["A1"] = contract["title"].format(ym=ym)
    ws["A1"].font = Font(bold=True, size=16)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append([
        f"수령인: {staff.get('nm','')} ({staff.get('ph') or '-'})",
        "",
        f"소속: {org}",
        "",
        f"발행일: {_today_str()}",
    ])
    ws.append([])
    ws.append(contract["columns"])

    for row in data.get("coach", []):
        ws.append([
            row.get("date", ""), "학습코칭", row.get("stu", ""), row.get("sc", ""),
            row.get("time", ""), row.get("topic", ""), _money(rates.get("coach")), _money(row.get("amount")),
        ])
    for row in data.get("cls", []):
        ws.append([
            row.get("date", ""), "수업협력", row.get("stu", ""), row.get("sc", ""),
            row.get("time", ""), row.get("topic", ""), _money(rates.get("cls")), _money(row.get("amount")),
        ])
    for row in data.get("travel", []):
        hours = float(row.get("hours") or 0)
        ws.append([
            row.get("date", ""), "연수출장", row.get("title", ""), "", f"{hours:g}시간",
            "4시간이상" if hours >= 4 else "4시간미만", _money(row.get("amount")), _money(row.get("amount")),
        ])

    ws.append([])
    ws.append([
        f"학습코칭 소계 ({summary.get('coachCount', 0)}회)", _money(summary.get("coachAmount")),
        f"수업협력 소계 ({summary.get('classCount', 0)}회)", _money(summary.get("classAmount")),
        f"연수 출장비 소계 ({summary.get('travelCount', 0)}회)", _money(summary.get("travelAmount")),
    ])
    ws.append([
        "단가 합계 / 지급액(총액)", _money(summary.get("gross")),
        f"공제액 (원천징수 {rates.get('taxPct', 0)}%)", -_money(summary.get("tax")),
        "★ 실지급액", _money(summary.get("net")),
    ])

    _set_widths(ws, contract["columnWidths"])
    for row in ws.iter_rows(min_row=4):
        for cell in row:
            cell.alignment = Alignment(vertical="center", wrap_text=True)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out


def create_execution_xlsx(
    output_path: str | Path,
    settlement: dict[str, Any],
    staff_by_id: dict[str, dict[str, Any]],
    ym: str,
    org: str = "",
) -> Path:
    contract = get_format_contract("execution_report")
    wb = Workbook()
    ws = wb.active
    ws.title = contract["sheet"]
    ws.merge_cells("A1:J1")
    ws["A1"] = contract["title"].format(ym=ym)
    ws["A1"].font = Font(bold=True, size=16)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append([f"기관: {org}", "", f"대상: {ym}", "", f"발행일: {_today_str()}"])
    ws.append([])
    ws.append(contract["columns"])

    summaries = settlement.get("summaryByStaff") or {}
    for idx, staff_id in enumerate(sorted(summaries), 1):
        s = summaries[staff_id]
        staff = staff_by_id.get(staff_id) or {}
        ws.append([
            idx,
            staff.get("nm", staff_id),
            s.get("coachCount", 0),
            _money(s.get("coachAmount")),
            s.get("classCount", 0),
            _money(s.get("classAmount")),
            s.get("travelCount", 0),
            _money(s.get("travelAmount")),
            _money(s.get("gross")),
            "",
        ])

    ex = settlement.get("executed") or {}
    ws.append([])
    ws.append(["", "합계", "", _money(ex.get("coach")), "", _money(ex.get("cls")), "", _money(ex.get("travel")), _money(ex.get("total")), ""])
    _set_widths(ws, contract["columnWidths"])

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out


def _collect_manager_logs(state: dict[str, Any], staff_id: str, ym: str) -> list[dict[str, Any]]:
    students = {str(x.get("id")): x for x in (state.get("stu") or [])}
    result: list[dict[str, Any]] = []
    for matching in state.get("mat") or []:
        if str(matching.get("stfId") or "") != staff_id:
            continue
        student = students.get(str(matching.get("stuId") or ""))
        for log in matching.get("logs") or []:
            log_date = str(log.get("date") or log.get("d") or "")
            if not log_date.startswith(ym):
                continue
            if str(log.get("status") or "") not in VERIFIED_STATUSES:
                continue
            result.append({
                "date": log_date,
                "time": log.get("time") or "",
                "topic": log.get("topic") or log.get("content") or "",
                "place": log.get("place") or "",
                "student": student,
                "school": (student or {}).get("sc") or (matching.get("classInfo") or {}).get("sc") or "",
            })
    result.sort(key=lambda x: (str(x.get("date") or ""), str(x.get("time") or "")))
    return result


def create_manager_book_xlsx(
    output_path: str | Path,
    state: dict[str, Any],
    staff_id: str,
    ym: str,
) -> Path:
    contract = get_format_contract("manager_book")
    cfg = state.get("cfg") or {}
    staff_by_id = {str(x.get("id")): x for x in (state.get("stf") or [])}
    students = {str(x.get("id")): x for x in (state.get("stu") or [])}
    staff = staff_by_id.get(staff_id)
    if not staff:
        raise ValueError("지원단 정보를 찾을 수 없습니다.")

    try:
        year, month = [int(x) for x in ym.split("-", 1)]
    except Exception as exc:
        raise ValueError("ym은 YYYY-MM 형식이어야 합니다.") from exc

    logs = _collect_manager_logs(state, staff_id, ym)
    by_day: dict[int, list[dict[str, Any]]] = {}
    for log in logs:
        day = int(str(log["date"]).split("-")[2])
        by_day.setdefault(day, []).append(log)

    assigned: list[str] = []
    for matching in state.get("mat") or []:
        if str(matching.get("stfId") or "") != staff_id or matching.get("st") != "active":
            continue
        student = students.get(str(matching.get("stuId") or ""))
        if not student:
            continue
        assigned.append(f"{_mask_name(student, cfg)}({student.get('sc') or ''})")
    student_list = ", ".join(assigned) if assigned else "(매칭 없음)"

    wb = Workbook()
    ws = wb.active
    ws.title = contract["sheet"]
    ws.merge_cells("A1:M1")
    ws["A1"] = contract["title"].format(year=year, month=month)
    ws["A1"].font = Font(bold=True, size=16)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append([
        f"소속: {cfg.get('org') or ''}", "", f"성명: {staff.get('nm') or ''}", "",
        f"연락처: {staff.get('ph') or ''}", "", "", "", "", "", "", "", "",
    ])
    ws.append([f"담당학생: {student_list}"])
    ws.append([])
    ws.append(contract["columns"])

    total_count = 0
    total_hours = 0.0
    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    import calendar
    last_day = calendar.monthrange(year, month)[1]

    for i in range(1, 17):
        d1 = i
        d2 = i + 16 if i + 16 <= last_day else None
        arr1 = by_day.get(d1, [])
        arr2 = by_day.get(d2, []) if d2 else []
        l1 = arr1[0] if arr1 else None
        l2 = arr2[0] if arr2 else None
        total_count += len(arr1) + len(arr2)
        total_hours += sum(_time_hours(x.get("time")) for x in [*arr1, *arr2])

        w1 = weekdays[date(year, month, d1).weekday()] if l1 else ""
        w2 = weekdays[date(year, month, d2).weekday()] if d2 and l2 else ""
        topic1 = str(l1.get("topic") or "") if l1 else ""
        topic2 = str(l2.get("topic") or "") if l2 else ""
        if len(arr1) > 1:
            topic1 += f" / 외 {len(arr1)-1}건"
        if len(arr2) > 1:
            topic2 += f" / 외 {len(arr2)-1}건"

        ws.append([
            d1,
            w1,
            l1.get("school", "") if l1 else "",
            l1.get("time", "") if l1 else "",
            topic1,
            _mask_name(l1.get("student"), cfg) if l1 else "",
            "",
            d2 or "",
            w2,
            l2.get("school", "") if l2 else "",
            l2.get("time", "") if l2 else "",
            topic2,
            _mask_name(l2.get("student"), cfg) if l2 else "",
        ])

    ws.append([])
    signer = cfg.get("confirmer") or "학습상담사"
    ws.append(["", "", "", "", f"총 실시 회기: {total_count}회 · 총 시수: {total_hours:.1f}시간 · 확인자({signer}):", "(인)"])
    _set_widths(ws, contract["columnWidths"])
    for row in ws.iter_rows(min_row=5):
        for cell in row:
            cell.alignment = Alignment(vertical="center", wrap_text=True)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out
