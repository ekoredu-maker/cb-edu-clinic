from __future__ import annotations

import calendar
from copy import deepcopy
from datetime import date
from typing import Any

from services.document_model import VERIFIED_STATUSES, _mask_name, _money, _time_hours
from services.format_contract import get_format_contract
from services.print_contract import get_print_contract


def _contract(key: str, *, kind: str = "coach") -> dict[str, Any]:
    base = deepcopy(get_format_contract(key))
    printed = get_print_contract(key, kind=kind)
    base["columns"] = list(printed["columns"])
    base["columnWidths"] = list(printed["columnWidths"])
    base["printSourceFunction"] = printed["sourceFunction"]
    base["outputContract"] = "print"
    return base


def pay_slip_print_model(
    settlement: dict[str, Any],
    staff: dict[str, Any],
    staff_id: str,
    ym: str,
    org: str,
    confirmer: str = "",
) -> dict[str, Any]:
    """HTML buildPaySlipHtml()의 6열 인쇄 구조를 그대로 모델링한다."""
    contract = _contract("pay_slip")
    data = (settlement.get("byStaff") or {}).get(staff_id) or {"coach": [], "cls": [], "travel": []}
    summary = (settlement.get("summaryByStaff") or {}).get(staff_id) or {}
    rates = settlement.get("rates") or {}
    rows: list[list[Any]] = []

    for row in data.get("coach", []):
        rows.append([
            row.get("date", ""), row.get("stu", ""), row.get("sc", ""),
            row.get("time", ""), row.get("topic", ""), _money(row.get("amount")),
        ])
    for row in data.get("cls", []):
        rows.append([
            row.get("date", ""), row.get("stu", ""), row.get("sc", ""),
            row.get("time", ""), row.get("topic", ""), _money(row.get("amount")),
        ])
    for row in data.get("travel", []):
        hours = float(row.get("hours") or 0)
        rows.append([
            row.get("date", ""), row.get("title", ""), "", f"{hours:g}시간",
            "4시간이상" if hours >= 4 else "4시간미만", _money(row.get("amount")),
        ])

    who = str(confirmer or "학습상담사")
    return {
        "key": "pay_slip",
        "contract": contract,
        "layout": "print",
        "title": contract["title"].format(ym=ym),
        "meta": [
            ["수령인", f"{staff.get('nm','')} ({staff.get('ph') or '-'})"],
            ["소속", org],
            ["발행일", date.today().isoformat()],
        ],
        "columns": contract["columns"],
        "rows": rows,
        "summary": [
            [f"학습코칭 소계 ({summary.get('coachCount', 0)}회 × {_money(rates.get('coach')):,}원)", _money(summary.get("coachAmount"))],
            [f"수업협력 소계 ({summary.get('classCount', 0)}회 × {_money(rates.get('cls')):,}원)", _money(summary.get("classAmount"))],
            [f"연수 출장비 소계 ({summary.get('travelCount', 0)}회)", _money(summary.get("travelAmount"))],
            ["단가 합계 / 지급액(총액)", _money(summary.get("gross"))],
            [f"공제액 (원천징수 {rates.get('taxPct', 0)}%)", -_money(summary.get("tax"))],
            ["★ 실지급액", _money(summary.get("net"))],
        ],
        "paragraphsAfter": [
            "※ 실제 입금은 지출담당 부서(K-에듀파인)에서 처리됩니다.",
            f"※ 확인자: {who} ______________________ (인)",
        ],
    }


def execution_report_print_model(
    settlement: dict[str, Any],
    staff_by_id: dict[str, dict[str, Any]],
    ym: str,
    org: str,
    confirmer: str = "",
) -> dict[str, Any]:
    """HTML buildExecReportHtml()의 9열 인쇄 구조를 그대로 모델링한다."""
    contract = _contract("execution_report")
    summaries = settlement.get("summaryByStaff") or {}
    rows: list[list[Any]] = []
    for idx, staff_id in enumerate(sorted(summaries), 1):
        s = summaries[staff_id]
        staff = staff_by_id.get(staff_id) or {}
        rows.append([
            idx,
            staff.get("nm", staff_id),
            s.get("coachCount", 0), _money(s.get("coachAmount")),
            s.get("classCount", 0), _money(s.get("classAmount")),
            s.get("travelCount", 0), _money(s.get("travelAmount")),
            _money(s.get("gross")),
        ])
    ex = settlement.get("executed") or {}
    who = str(confirmer or "학습상담사")
    return {
        "key": "execution_report",
        "contract": contract,
        "layout": "print",
        "title": contract["title"].format(ym=ym),
        "meta": [["기관", org], ["대상", ym], ["발행일", date.today().isoformat()]],
        "columns": contract["columns"],
        "rows": rows,
        "summaryRow": [
            "", "합계", "", _money(ex.get("coach")), "", _money(ex.get("cls")),
            "", _money(ex.get("travel")), _money(ex.get("total")),
        ],
        "paragraphsAfter": [
            "※ 이 내역서는 K-에듀파인 지출결의 첨부용입니다. 금액은 총액(세전)이며 원천징수는 지출담당 부서에서 처리합니다.",
            f"※ 발행·확인자: {who} ______________ (인)",
        ],
    }


def _class_label(class_info: dict[str, Any]) -> str:
    sc_type = str(class_info.get("scType") or "").strip()
    gr = str(class_info.get("gr") or "").strip()
    cls = str(class_info.get("cls") or "").strip()
    grade_class = ""
    if gr or cls:
        grade_class = f"{gr}-{cls}반" if cls else f"{gr}학년"
    return " ".join(x for x in (sc_type, grade_class) if x).strip()


def manager_book_print_model(
    state: dict[str, Any],
    staff_id: str,
    ym: str,
    *,
    kind: str = "coach",
) -> dict[str, Any]:
    """HTML buildMgrBookHtml(stfId, ym, kindFilter)의 12열 분리형 구조."""
    kind = "class" if str(kind) == "class" else "coach"
    contract = _contract("manager_book", kind=kind)
    cfg = state.get("cfg") or {}
    staff_map = {str(x.get("id")): x for x in (state.get("stf") or [])}
    student_map = {str(x.get("id")): x for x in (state.get("stu") or [])}
    staff = staff_map.get(str(staff_id))
    if not staff:
        raise ValueError("지원단 정보를 찾을 수 없습니다.")
    try:
        year, month = [int(x) for x in str(ym).split("-", 1)]
    except Exception as exc:
        raise ValueError("ym은 YYYY-MM 형식이어야 합니다.") from exc

    logs: list[dict[str, Any]] = []
    for matching in state.get("mat") or []:
        if str(matching.get("stfId") or "") != str(staff_id):
            continue
        matching_kind = str(matching.get("kind") or "coach")
        student = student_map.get(str(matching.get("stuId") or ""))
        class_info = matching.get("classInfo") or {}
        for log in matching.get("logs") or []:
            log_kind = str(log.get("kind") or matching_kind or "coach")
            if log_kind != kind:
                continue
            log_date = str(log.get("date") or log.get("d") or "")
            if not log_date.startswith(str(ym)):
                continue
            if str(log.get("status") or "") not in VERIFIED_STATUSES:
                continue
            logs.append({
                "date": log_date,
                "time": log.get("time") or "",
                "topic": log.get("topic") or log.get("content") or "",
                "minutes": float(log.get("minutes") or 0),
                "school": str(class_info.get("sc") or "") if kind == "class" else str((student or {}).get("sc") or ""),
                "target": _class_label(class_info) if kind == "class" else _mask_name(student, cfg),
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
        for item in [*arr1, *arr2]:
            hours = _time_hours(item.get("time"))
            total_hours += hours if hours > 0 else float(item.get("minutes") or 0) / 60.0

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
            l1.get("target", "") if l1 else "",
            d2 or "",
            weekdays[date(year, month, d2).weekday()] if d2 and l2 else "",
            l2.get("school", "") if l2 else "",
            l2.get("time", "") if l2 else "",
            topic2,
            l2.get("target", "") if l2 else "",
        ])

    kind_label = "수업협력" if kind == "class" else "학습코칭"
    confirmer = str(cfg.get("confirmer") or "학습상담사")
    return {
        "key": "manager_book",
        "contract": contract,
        "layout": "print",
        "kind": kind,
        "title": f"학습지원단 관리부 — {kind_label} ({year}년 {month}월)",
        "meta": [
            ["소속", str(cfg.get("org") or "")],
            ["성명", str(staff.get("nm") or "")],
            ["연락처", str(staff.get("ph") or "")],
            ["구분", kind_label],
        ],
        "columns": contract["columns"],
        "rows": rows,
        "footer": f"총 실시 회기: {total_count}회 · 총 시수: {total_hours:.1f}시간 · 확인자({confirmer}): ______________ (인)",
        "totals": {"count": total_count, "hours": total_hours, "confirmer": confirmer},
    }
