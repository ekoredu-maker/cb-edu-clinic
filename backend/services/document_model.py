from __future__ import annotations

from datetime import date
from typing import Any

from services.format_contract import get_format_contract


def _money(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


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


def manager_book_model(
    *,
    title: str,
    meta: list[list[str]],
    columns: list[str],
    rows: list[list[Any]],
    total_count: int,
    total_hours: float,
    confirmer: str,
) -> dict[str, Any]:
    return {
        "key": "manager_book",
        "contract": get_format_contract("manager_book"),
        "title": title,
        "meta": meta,
        "columns": columns,
        "rows": rows,
        "footer": f"총 실시 회기: {total_count}회 · 총 시수: {total_hours:.1f}시간 · 확인자({confirmer}): ______________ (인)",
    }
