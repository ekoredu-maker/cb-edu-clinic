from __future__ import annotations

import calendar
import re
from datetime import date
from typing import Any

from services.format_contract import get_format_contract


VERIFIED_STATUSES = {"verified", "paid"}


def _money(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


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
    match = re.search(r"(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})", text)
    if not match:
        return 0.0
    start = int(match.group(1)) * 60 + int(match.group(2))
    end = int(match.group(3)) * 60 + int(match.group(4))
    return max(0.0, (end - start) / 60)


def pay_slip_model(
    settlement: dict[str, Any],
    staff: dict[str, Any],
    staff_id: str,
    ym: str,
    org: str,
) -> dict[str, Any]:
    contract = get_format_contract("pay_slip")
    data = (settlement.get("byStaff") or {}).get(staff_id) or {"coach": [], "cls": [], "travel": []}
    summary = (settlement.get("summaryByStaff") or {}).get(staff_id) or {}
    rates = settlement.get("rates") or {}

    rows: list[list[Any]] = []
    for row in data.get("coach", []):
        rows.append([
            row.get("date", ""), "학습코칭", row.get("stu", ""), row.get("sc", ""),
            row.get("time", ""), row.get("topic", ""), _money(rates.get("coach")), _money(row.get("amount")),
        ])
    for row in data.get("cls", []):
        rows.append([
            row.get("date", ""), "수업협력", row.get("stu", ""), row.get("sc", ""),
            row.get("time", ""), row.get("topic", ""), _money(rates.get("cls")), _money(row.get("amount")),
        ])
    for row in data.get("travel", []):
        hours = float(row.get("hours") or 0)
        rows.append([
            row.get("date", ""), "연수출장", row.get("title", ""), "", f"{hours:g}시간",
            "4시간이상" if hours >= 4 else "4시간미만", _money(row.get("amount")), _money(row.get("amount")),
        ])

    return {
        "key": "pay_slip",
        "contract": contract,
        "title": contract["title"].format(ym=ym),
        "meta": [
            ["수령인", f"{staff.get('nm','')} ({staff.get('ph') or '-'})"],
            ["소속", org],
            ["발행일", date.today().isoformat()],
        ],
        "columns": contract["columns"],
        "rows": rows,
        "summary": [
            [f"학습코칭 소계 ({summary.get('coachCount', 0)}회)", _money(summary.get("coachAmount"))],
            [f"수업협력 소계 ({summary.get('classCount', 0)}회)", _money(summary.get("classAmount"))],
            [f"연수 출장비 소계 ({summary.get('travelCount', 0)}회)", _money(summary.get("travelAmount"))],
            ["단가 합계 / 지급액(총액)", _money(summary.get("gross"))],
            [f"공제액 (원천징수 {rates.get('taxPct', 0)}%)", -_money(summary.get("tax"))],
            ["★ 실지급액", _money(summary.get("net"))],
        ],
    }


def execution_report_model(
    settlement: dict[str, Any],
    staff_by_id: dict[str, dict[str, Any]],
    ym: str,
    org: str,
) -> dict[str, Any]:
    contract = get_format_contract("execution_report")
    summaries = settlement.get("summaryByStaff") or {}
    rows: list[list[Any]] = []
    for idx, staff_id in enumerate(sorted(summaries), 1):
        s = summaries[staff_id]
        staff = staff_by_id.get(staff_id) or {}
        rows.append([
            idx, staff.get("nm", staff_id), s.get("coachCount", 0), _money(s.get("coachAmount")),
            s.get("classCount", 0), _money(s.get("classAmount")), s.get("travelCount", 0),
            _money(s.get("travelAmount")), _money(s.get("gross")), "",
        ])
    ex = settlement.get("executed") or {}
    return {
        "key": "execution_report",
        "contract": contract,
        "title": contract["title"].format(ym=ym),
        "meta": [["기관", org], ["대상", ym], ["발행일", date.today().isoformat()]],
        "columns": contract["columns"],
        "rows": rows,
        "summaryRow": ["", "합계", "", _money(ex.get("coach")), "", _money(ex.get("cls")), "", _money(ex.get("travel")), _money(ex.get("total")), ""],
    }


def manager_book_model(state: dict[str, Any], staff_id: str, ym: str) -> dict[str, Any]:
    contract = get_format_contract("manager_book")
    cfg = state.get("cfg") or {}
    staff_by_id = {str(x.get("id")): x for x in (state.get("stf") or [])}
    students = {str(x.get("id")): x for x in (state.get("stu") or [])}
    staff = staff_by_id.get(str(staff_id))
    if not staff:
        raise ValueError("지원단 정보를 찾을 수 없습니다.")
    try:
        year, month = [int(x) for x in str(ym).split("-", 1)]
    except Exception as exc:
        raise ValueError("ym은 YYYY-MM 형식이어야 합니다.") from exc

    logs: list[dict[str, Any]] = []
    assigned: list[str] = []
    for matching in state.get("mat") or []:
        if str(matching.get("stfId") or "") != str(staff_id):
            continue
        student = students.get(str(matching.get("stuId") or ""))
        if matching.get("st") == "active" and student:
            assigned.append(f"{_mask_name(student, cfg)}({student.get('sc') or ''})")
        for log in matching.get("logs") or []:
            log_date = str(log.get("date") or log.get("d") or "")
            if not log_date.startswith(str(ym)):
                continue
            if str(log.get("status") or "") not in VERIFIED_STATUSES:
                continue
            logs.append({
                "date": log_date,
                "time": log.get("time") or "",
                "topic": log.get("topic") or log.get("content") or "",
                "student": student,
                "school": (student or {}).get("sc") or (matching.get("classInfo") or {}).get("sc") or "",
            })
    logs.sort(key=lambda x: (str(x.get("date") or ""), str(x.get("time") or "")))

    by_day: dict[int, list[dict[str, Any]]] = {}
    for log in logs:
        day = int(str(log["date"]).split("-")[2])
        by_day.setdefault(day, []).append(log)

    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    last_day = calendar.monthrange(year, month)[1]
    rows: list[list[Any]] = []
    total_count = 0
    total_hours = 0.0
    for i in range(1, 17):
        d1 = i
        d2 = i + 16 if i + 16 <= last_day else None
        arr1 = by_day.get(d1, [])
        arr2 = by_day.get(d2, []) if d2 else []
        l1 = arr1[0] if arr1 else None
        l2 = arr2[0] if arr2 else None
        total_count += len(arr1) + len(arr2)
        total_hours += sum(_time_hours(x.get("time")) for x in [*arr1, *arr2])

        topic1 = str(l1.get("topic") or "") if l1 else ""
        topic2 = str(l2.get("topic") or "") if l2 else ""
        if len(arr1) > 1:
            topic1 += f" / 외 {len(arr1)-1}건"
        if len(arr2) > 1:
            topic2 += f" / 외 {len(arr2)-1}건"

        rows.append([
            d1,
            weekdays[date(year, month, d1).weekday()] if l1 else "",
            l1.get("school", "") if l1 else "",
            l1.get("time", "") if l1 else "",
            topic1,
            _mask_name(l1.get("student"), cfg) if l1 else "",
            "",
            d2 or "",
            weekdays[date(year, month, d2).weekday()] if d2 and l2 else "",
            l2.get("school", "") if l2 else "",
            l2.get("time", "") if l2 else "",
            topic2,
            _mask_name(l2.get("student"), cfg) if l2 else "",
        ])

    confirmer = str(cfg.get("confirmer") or "학습상담사")
    return {
        "key": "manager_book",
        "contract": contract,
        "title": contract["title"].format(year=year, month=month),
        "meta": [
            ["소속", str(cfg.get("org") or "")],
            ["성명", str(staff.get("nm") or "")],
            ["연락처", str(staff.get("ph") or "")],
            ["담당학생", ", ".join(assigned) if assigned else "(매칭 없음)"],
        ],
        "columns": contract["columns"],
        "rows": rows,
        "footer": f"총 실시 회기: {total_count}회 · 총 시수: {total_hours:.1f}시간 · 확인자({confirmer}): ______________ (인)",
        "totals": {"count": total_count, "hours": total_hours, "confirmer": confirmer},
    }
