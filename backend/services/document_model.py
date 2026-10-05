from __future__ import annotations

import calendar
import math
import re
from datetime import date, datetime
from typing import Any

from services.format_contract import get_format_contract


VERIFIED_STATUSES = {"verified", "paid"}


def _money(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _mask_name(student: dict[str, Any] | None, cfg: dict[str, Any]) -> str:
    """HTML legacy-js/00-core.js maskName 규칙과 동일하게 유지한다."""
    if not student:
        return ""
    name = str(student.get("nm") or "")
    mode = str(cfg.get("maskMode") or "full")
    if mode == "full":
        return name
    if mode == "ooo":
        return "OOO"
    if mode == "partial":
        return (name[:1] + "OO") if name else "OOO"
    if mode == "alias":
        alias = str(student.get("alias") or "").strip()
        if alias:
            return alias
        sid = str(student.get("id") or "")
        return f"학생{sid[-4:]}"
    return name


def _time_hours(value: Any) -> float:
    text = str(value or "")
    match = re.search(r"(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})", text)
    if not match:
        return 0.0
    start = int(match.group(1)) * 60 + int(match.group(2))
    end = int(match.group(3)) * 60 + int(match.group(4))
    return max(0.0, (end - start) / 60)


def _to_min(value: Any) -> int:
    text = str(value or "")
    match = re.match(r"^(\d{1,2}):(\d{2})$", text)
    if not match:
        return 0
    return int(match.group(1)) * 60 + int(match.group(2))


def _fmt_date(value: Any) -> str:
    if not value:
        return "____. __. __."
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text[:10])
        return f"{parsed.year}. {parsed.month:02d}. {parsed.day:02d}."
    except ValueError:
        return text


def _korean_today() -> str:
    today = date.today()
    return f"{today.year}년 {today.month}월 {today.day}일"


def _issuer_info(cfg: dict[str, Any]) -> dict[str, str]:
    office = str(cfg.get("org") or "○○교육지원청").strip()
    if "교육지원청" not in office:
        office = f"{office} 교육지원청".strip()
    prefix = re.sub(r"\s*교육지원청.*", "", office)
    superintendent = f"{prefix}교육지원청교육장"
    return {
        "officeName": office,
        "superintendent": superintendent,
        "confirmer": str(cfg.get("confirmer") or "담당 장학사"),
        "admin": str(cfg.get("admin") or "담당장학사"),
    }


def _staff(state: dict[str, Any], staff_id: str) -> dict[str, Any]:
    for staff in state.get("stf") or []:
        if str(staff.get("id") or "") == str(staff_id):
            return staff
    raise ValueError("지원단 정보를 찾을 수 없습니다.")


def _appointment_period(staff: dict[str, Any]) -> str:
    if staff.get("appointStart") and staff.get("appointEnd"):
        return f"{_fmt_date(staff.get('appointStart'))} ~ {_fmt_date(staff.get('appointEnd'))}"
    return "별도 공문에 따름"


def _js_month_round(start: Any, end: Any) -> int:
    try:
        d1 = datetime.fromisoformat(str(start)[:10])
        d2 = datetime.fromisoformat(str(end)[:10])
        value = (d2 - d1).total_seconds() / (60 * 60 * 24 * 30)
        return max(1, int(math.floor(value + 0.5)))
    except (TypeError, ValueError):
        return 1


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


def staff_appointment_model(state: dict[str, Any], staff_id: str) -> dict[str, Any]:
    contract = get_format_contract("staff_appoint")
    cfg = state.get("cfg") or {}
    staff = _staff(state, staff_id)
    issuer = _issuer_info(cfg)
    return {
        "key": "staff_appoint",
        "contract": contract,
        "title": contract["title"],
        "columns": contract["columns"],
        "rows": [
            ["성 명", staff.get("nm") or "", "생년월일", staff.get("bd") or "-"],
            ["위촉 분야", staff.get("appointArea") or "학습코칭", "", ""],
            ["위촉 기간", _appointment_period(staff), "", ""],
        ],
        "showHeader": False,
        "labelColumns": [0, 2],
        "paragraphsAfter": [
            f"위 사람을 {issuer['officeName']}의 충북종합학습클리닉 학습지원단으로 위촉합니다.",
            _korean_today(),
            issuer["superintendent"],
            "[직인]",
        ],
    }


def appointment_confirmation_model(state: dict[str, Any], staff_id: str) -> dict[str, Any]:
    contract = get_format_contract("appoint_confirm")
    cfg = state.get("cfg") or {}
    staff = _staff(state, staff_id)
    issuer = _issuer_info(cfg)
    return {
        "key": "appoint_confirm",
        "contract": contract,
        "title": contract["title"],
        "columns": contract["columns"],
        "rows": [
            ["성 명", staff.get("nm") or "", "생년월일", staff.get("bd") or "-"],
            ["연락처", staff.get("ph") or "-", "소 속", issuer["officeName"]],
            ["위촉 분야", staff.get("appointArea") or "학습코칭", "", ""],
            ["위촉 기간", _appointment_period(staff), "", ""],
        ],
        "showHeader": False,
        "labelColumns": [0, 2],
        "paragraphsAfter": [
            f"위 사람은 {issuer['officeName']}에서 위와 같이 충북종합학습클리닉 학습지원단으로 위촉되어 활동 중임을 확인합니다.",
            _korean_today(),
            issuer["superintendent"],
            "[직인]",
            f"담 당 자: {issuer['admin']} ______________ (인)",
            f"확 인 자: {issuer['confirmer']} ______________ (인)",
        ],
    }


def career_confirmation_model(state: dict[str, Any], staff_id: str) -> dict[str, Any]:
    contract = get_format_contract("career_confirm")
    cfg = state.get("cfg") or {}
    staff = _staff(state, staff_id)
    issuer = _issuer_info(cfg)
    histories = [dict(x) for x in (staff.get("careerHistory") or [])]
    if staff.get("appointStart") and staff.get("appointEnd"):
        histories.append({
            "start": staff.get("appointStart"),
            "end": staff.get("appointEnd"),
            "area": staff.get("appointArea") or "학습코칭",
            "current": True,
        })

    rows: list[list[Any]] = []
    total_months = 0
    for idx, item in enumerate(histories, 1):
        start = str(item.get("start") or "")
        end = str(item.get("end") or "")
        count = 0
        hours = 0.0
        for matching in state.get("mat") or []:
            if str(matching.get("stfId") or "") != str(staff_id):
                continue
            for log in matching.get("logs") or []:
                if str(log.get("status") or "") not in VERIFIED_STATUSES:
                    continue
                log_date = str(log.get("date") or "")
                if not log_date or not start or not end or not (start <= log_date <= end):
                    continue
                count += 1
                hours += float(log.get("minutes") or 50) / 60.0
        months = _js_month_round(start, end)
        total_months += months
        period = f"{_fmt_date(start)} ~ {_fmt_date(end)}"
        if item.get("current"):
            period += " (현재)"
        rows.append([idx, item.get("area") or "학습코칭", period, f"{months}개월", f"{count}회", f"{hours:.1f}h"])

    return {
        "key": "career_confirm",
        "contract": contract,
        "title": contract["title"],
        "columns": contract["columns"],
        "rows": rows,
        "tables": [
            {
                "columns": contract["infoColumns"],
                "rows": [
                    ["성 명", staff.get("nm") or "", "생년월일", staff.get("bd") or "-"],
                    ["연락처", staff.get("ph") or "-", "", ""],
                ],
                "widths": contract["infoColumnWidths"],
                "showHeader": False,
                "labelColumns": [0, 2],
            },
            {
                "title": f"▣ 위촉 이력 (누적 {len(histories)}회 · 총 {total_months}개월)",
                "columns": contract["columns"],
                "rows": rows,
                "widths": contract["columnWidths"],
                "showHeader": True,
            },
        ],
        "paragraphsAfter": [
            f"위와 같이 {issuer['officeName']}에서의 충북종합학습클리닉 학습지원단 활동 경력을 확인합니다.",
            _korean_today(),
            issuer["superintendent"],
            "[직인]",
            f"담 당 자: {issuer['admin']} ______________ (인)",
            f"확 인 자: {issuer['confirmer']} ______________ (인)",
        ],
        "totals": {"historyCount": len(histories), "months": total_months},
    }


def resignation_model(
    state: dict[str, Any],
    staff_id: str,
    *,
    resign_date: str = "",
    resign_reason: str = "",
    detail_reason: str = "",
) -> dict[str, Any]:
    contract = get_format_contract("resign")
    cfg = state.get("cfg") or {}
    staff = _staff(state, staff_id)
    issuer = _issuer_info(cfg)
    reason = resign_reason or str(staff.get("resignReason") or "")
    return {
        "key": "resign",
        "contract": contract,
        "title": contract["title"],
        "columns": contract["columns"],
        "rows": [
            ["성 명", staff.get("nm") or "", "생년월일", staff.get("bd") or "-"],
            ["연락처", staff.get("ph") or "-", "", ""],
            ["위촉 분야", staff.get("appointArea") or "학습코칭", "위촉일", _fmt_date(staff.get("appointStart"))],
            ["해촉 예정일", resign_date or "YYYY. MM. DD.", "해촉 사유", reason],
            ["세부 사유", detail_reason, "", ""],
        ],
        "showHeader": False,
        "labelColumns": [0, 2],
        "rowHeights": [2200, 2200, 2200, 2200, 7000],
        "paragraphsAfter": [
            f"위와 같은 사유로 {issuer['officeName']}의 충북종합학습클리닉 학습지원단 활동 해촉을 신청합니다.",
            _korean_today(),
            f"신청인: {staff.get('nm') or ''} ________________ (인)",
            "※ 접수/확인",
            f"담 당 자: {issuer['admin']} ______________ (인)    확 인 자: {issuer['confirmer']} ______________ (인)",
            f"{issuer['superintendent']} 귀하",
        ],
    }


def learning_plan_model(state: dict[str, Any], staff_id: str = "") -> dict[str, Any]:
    contract = get_format_contract("plan_doc")
    staff_name = ""
    if staff_id:
        try:
            staff_name = str(_staff(state, staff_id).get("nm") or "")
        except ValueError:
            staff_name = ""
    return {
        "key": "plan_doc",
        "contract": contract,
        "title": contract["title"],
        "columns": contract["columns"],
        "rows": [
            ["지원단", staff_name, "학생", ""],
            ["지원영역", "", "", ""],
            ["지원기간", "", "", ""],
            ["학습목표", "", "", ""],
            ["", "", "", ""],
            ["지도계획", "", "", ""],
            ["", "", "", ""],
            ["평가방법", "", "", ""],
            ["", "", "", ""],
        ],
        "showHeader": False,
        "labelColumns": [0, 2],
        "rowHeights": [2200, 2200, 2200, 2200, 7000, 2200, 12000, 2200, 6000],
    }


def _collect_timetable_slots(state: dict[str, Any], mode: str, target_id: str) -> list[dict[str, Any]]:
    cfg = state.get("cfg") or {}
    staff_map = {str(x.get("id")): x for x in (state.get("stf") or [])}
    student_map = {str(x.get("id")): x for x in (state.get("stu") or [])}
    slots: list[dict[str, Any]] = []
    for matching in state.get("mat") or []:
        if matching.get("st") != "active":
            continue
        staff = staff_map.get(str(matching.get("stfId") or ""))
        if not staff:
            continue
        is_class = matching.get("kind") == "class"
        student = None if is_class else student_map.get(str(matching.get("stuId") or ""))
        if not is_class and not student:
            continue
        class_info = matching.get("classInfo") or {}
        school = str(class_info.get("sc") or "") if is_class else str(student.get("sc") or "")
        student_key = f"class-{matching.get('id')}" if is_class else str(student.get("id") or "")
        student_name = (
            f"🏫 {class_info.get('scType') or ''} {class_info.get('gr') or ''}-{class_info.get('cls') or ''}반"
            if is_class else _mask_name(student, cfg)
        )
        grade = class_info.get("gr") if is_class else student.get("gr")
        class_no = class_info.get("cls") if is_class else student.get("cls")

        matched = (
            (mode == "staff" and str(staff.get("id") or "") == target_id)
            or (mode == "stu" and not is_class and str(student.get("id") or "") == target_id)
            or (mode == "sch" and school == target_id)
        )
        if not matched:
            continue
        support_types = (student or {}).get("supportTypes") or []
        area = "수업협력" if is_class else str(matching.get("area") or (support_types[0] if support_types else ""))
        for slot in matching.get("slots") or []:
            slots.append({
                "d": slot.get("d") or "",
                "s": slot.get("s") or "",
                "e": slot.get("e") or "",
                "stfId": str(staff.get("id") or ""),
                "stfNm": str(staff.get("nm") or ""),
                "stuId": student_key,
                "stuNm": student_name,
                "sc": school,
                "gr": grade or "",
                "cls": class_no or "",
                "area": area,
                "kind": "class" if is_class else "coach",
            })
    return slots


def timetable_model(state: dict[str, Any], mode: str, target_id: str) -> dict[str, Any]:
    contract = get_format_contract("timetable")
    mode = str(mode or "staff")
    target_id = str(target_id or "")
    if mode not in {"staff", "stu", "sch"}:
        raise ValueError("시간표 mode는 staff, stu, sch 중 하나여야 합니다.")
    if not target_id or target_id == "all":
        raise ValueError("HWPX 시간표는 개별 지원단·학생·학교를 선택해 생성하세요.")

    staff_map = {str(x.get("id")): x for x in (state.get("stf") or [])}
    student_map = {str(x.get("id")): x for x in (state.get("stu") or [])}
    cfg = state.get("cfg") or {}
    slots = _collect_timetable_slots(state, mode, target_id)

    if mode == "staff":
        target = staff_map.get(target_id)
        if not target:
            raise ValueError("지원단 정보를 찾을 수 없습니다.")
        title = f"[지원단] {target.get('nm') or ''} 주간 시간표"
        subtitle = f"담당 {len({x['stuId'] for x in slots})}명"
    elif mode == "stu":
        target = student_map.get(target_id)
        if not target:
            raise ValueError("학생 정보를 찾을 수 없습니다.")
        title = f"[학생] {_mask_name(target, cfg)} 주간 시간표"
        grade = f"{target.get('gr')}학년" if target.get("gr") else ""
        class_text = f" {target.get('cls')}반" if target.get("cls") else ""
        subtitle = f"{target.get('sc') or ''} {grade}{class_text}".strip()
    else:
        title = f"[학교] {target_id} 주간 시간표"
        subtitle = f"대상 {len({x['stuId'] for x in slots})}명"

    days = contract["days"]
    rows: list[list[Any]] = []
    start_hour = int(contract["startHour"])
    end_hour = int(contract["endHour"])
    step = int(contract["stepMinutes"])
    for hour in range(start_hour, end_hour):
        for minute in range(0, 60, step):
            cell_start = hour * 60 + minute
            cell_end = cell_start + step
            row: list[Any] = [f"{hour:02d}:00" if minute == 0 else ""]
            for day_name in days:
                overlapping = [
                    item for item in slots
                    if item["d"] == day_name and _to_min(item["s"]) < cell_end and _to_min(item["e"]) > cell_start
                ]
                new_items = [item for item in overlapping if cell_start <= _to_min(item["s"]) < cell_end]
                cell_texts: list[str] = []
                for item in new_items:
                    if mode == "staff":
                        primary = item["stuNm"]
                        secondary = f"{item['sc']} {str(item['gr']) + '학년' if item['gr'] else ''}".strip()
                    elif mode == "stu":
                        primary = item["stfNm"]
                        secondary = item["area"]
                    else:
                        primary = f"{item['stuNm']} ← {item['stfNm']}"
                        grade_class = f"{item['gr']}-{item['cls']}" if item["gr"] else ""
                        secondary = f"{grade_class} {item['area']}".strip()
                    cell_texts.append(f"{primary} / {secondary} / {item['s']}~{item['e']}".strip(" /"))
                row.append(" | ".join(cell_texts))
            rows.append(row)

    total_minutes = sum(max(0, _to_min(item["e"]) - _to_min(item["s"])) for item in slots)
    return {
        "key": "timetable",
        "contract": contract,
        "title": title,
        "meta": [["요약", subtitle], ["생성", date.today().isoformat()]],
        "columns": contract["columns"],
        "rows": rows,
        "footer": f"총 {len(slots)}건 / 주간 총 {total_minutes / 60:.1f}시간",
        "totals": {"slots": len(slots), "minutes": total_minutes},
    }
