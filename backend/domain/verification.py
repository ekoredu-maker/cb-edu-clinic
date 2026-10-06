from __future__ import annotations

import calendar
from datetime import date
from typing import Any

DAY_INDEX = {"월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5, "일": 6}


def _state(payload: dict[str, Any]) -> dict[str, Any]:
    return payload.get("state") or payload


def _to_minutes(value: str | None) -> int | None:
    if not value or ":" not in value:
        return None
    try:
        hour, minute = value.split(":", 1)
        return int(hour) * 60 + int(minute)
    except (TypeError, ValueError):
        return None


def _log_date(log: dict[str, Any]) -> str:
    """V12 legacy(d)와 V13/V14(date)를 모두 허용한다."""
    return str(log.get("date") or log.get("d") or "")


def _log_hours(log: dict[str, Any]) -> float:
    """실제 시작/종료가 있으면 우선 사용하고, 없으면 minutes를 사용한다."""
    start = _to_minutes(log.get("s"))
    end = _to_minutes(log.get("e"))
    if start is not None and end is not None and end > start:
        return (end - start) / 60

    minutes = log.get("minutes")
    if minutes not in (None, ""):
        try:
            return max(0.0, float(minutes) / 60)
        except (TypeError, ValueError):
            pass

    # 과거 로그 호환: 시간 정보가 전혀 없던 기존 1회 활동은 1시간으로 간주한다.
    return 1.0


def dates_for_day_in_month(ym: str, day_label: str) -> list[str]:
    target = DAY_INDEX.get(day_label)
    if target is None:
        return []
    try:
        year, month = (int(x) for x in ym.split("-", 1))
        days = calendar.monthrange(year, month)[1]
    except (TypeError, ValueError):
        return []
    return [
        f"{ym}-{day:02d}"
        for day in range(1, days + 1)
        if date(year, month, day).weekday() == target
    ]


def build_monthly_verification(state: dict[str, Any], ym: str) -> list[dict[str, Any]]:
    students = state.get("stu") or state.get("students") or []
    staff = state.get("stf") or state.get("staff") or []
    matchings = state.get("mat") or state.get("matchings") or []
    stu_by_id = {str(x.get("id")): x for x in students if x.get("id") is not None}
    stf_by_id = {str(x.get("id")): x for x in staff if x.get("id") is not None}
    rows: list[dict[str, Any]] = []

    for matching in matchings:
        if matching.get("st") != "active":
            continue
        staff_row = stf_by_id.get(str(matching.get("stfId") or ""))
        student = stu_by_id.get(str(matching.get("stuId") or ""))
        if not staff_row or not student:
            continue

        slot = (matching.get("slots") or [None])[0]
        expected = len(dates_for_day_in_month(ym, (slot or {}).get("d"))) if slot else 0
        logs = [x for x in (matching.get("logs") or []) if _log_date(x).startswith(ym)]
        total_hours = sum(_log_hours(log) for log in logs)

        rows.append({
            "matchingId": matching.get("id"),
            "staffId": matching.get("stfId"),
            "staffName": staff_row.get("nm") or "",
            "studentId": matching.get("stuId"),
            "studentName": student.get("nm") or "",
            "expected": expected,
            "actual": len(logs),
            "totalHours": round(total_hours, 4),
            "ok": len(logs) >= expected * 0.8,
        })
    return rows


def verify_records(payload: dict[str, Any]) -> dict[str, Any]:
    state = _state(payload)
    ym = str(payload.get("ym") or "")
    matchings = state.get("mat") or state.get("matchings") or []
    errors: list[dict[str, Any]] = []

    seen_log_ids: set[str] = set()
    for matching_index, matching in enumerate(matchings):
        for log_index, log in enumerate(matching.get("logs") or []):
            record_id = str(log.get("id") or "")
            if record_id:
                if record_id in seen_log_ids:
                    errors.append({
                        "matchingIndex": matching_index,
                        "logIndex": log_index,
                        "code": "DUPLICATE_LOG_ID",
                        "message": "중복 활동 로그 ID가 있습니다.",
                        "id": record_id,
                    })
                seen_log_ids.add(record_id)

            start = _to_minutes(log.get("s"))
            end = _to_minutes(log.get("e"))
            if start is not None and end is not None and end <= start:
                errors.append({
                    "matchingIndex": matching_index,
                    "logIndex": log_index,
                    "code": "INVALID_TIME_RANGE",
                    "message": "활동 종료시각은 시작시각보다 늦어야 합니다.",
                })

            minutes = log.get("minutes")
            if minutes not in (None, ""):
                try:
                    if float(minutes) < 0:
                        raise ValueError
                except (TypeError, ValueError):
                    errors.append({
                        "matchingIndex": matching_index,
                        "logIndex": log_index,
                        "code": "INVALID_MINUTES",
                        "message": "활동시간(분)은 0 이상의 숫자여야 합니다.",
                    })

    monthly = build_monthly_verification(state, ym) if ym else []
    return {
        "engine": "python",
        "ok": len(errors) == 0,
        "errorCount": len(errors),
        "errors": errors,
        "monthly": monthly,
    }
