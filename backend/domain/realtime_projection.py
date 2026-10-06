from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

# 대한민국은 현재 일광절약시간제를 사용하지 않으므로 UTC+9 고정 오프셋을 사용한다.\n# Windows 포터블 환경에서 tzdata 패키지 없이도 동일하게 동작한다.\nSEOUL = timezone(timedelta(hours=9), name="Asia/Seoul")\n

def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        raw = str(value).strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SEOUL)
    return dt.astimezone(SEOUL)


def _time_text(value: Any) -> str:
    dt = _parse_dt(value)
    return dt.strftime("%H:%M") if dt else ""


def _date_text(row: dict[str, Any]) -> str:
    if row.get("work_date"):
        return str(row.get("work_date"))[:10]
    for key in ("start_at", "end_at", "planned_start_at"):
        dt = _parse_dt(row.get(key))
        if dt:
            return dt.strftime("%Y-%m-%d")
    return ""


def _minutes(row: dict[str, Any]) -> int:
    raw = row.get("actual_minutes")
    if raw not in (None, ""):
        try:
            return max(0, int(round(float(raw))))
        except (TypeError, ValueError):
            pass
    start = _parse_dt(row.get("start_at"))
    end = _parse_dt(row.get("end_at"))
    if start and end and end > start:
        return max(0, int(round((end - start).total_seconds() / 60)))
    return 0


def _legacy_status(row: dict[str, Any]) -> str:
    settlement = str(row.get("settlement_state") or "")
    verification = str(row.get("verification_state") or "")
    if settlement == "paid":
        return "paid"
    if settlement == "approved":
        return "verified"
    if verification == "rejected":
        return "rejected"
    return "conducted"


def to_legacy_log(row: dict[str, Any]) -> dict[str, Any]:
    session_id = str(row.get("id") or row.get("session_id") or "")
    day = _date_text(row)
    start = _time_text(row.get("start_at"))
    end = _time_text(row.get("end_at"))
    topic = str(row.get("topic") or row.get("content") or "")
    content = str(row.get("content") or topic)
    kind = "class" if str(row.get("kind") or "") == "class" else "coach"
    minutes = _minutes(row)

    return {
        "id": session_id,
        "date": day,
        "d": day,
        "s": start,
        "e": end,
        "time": f"{start}~{end}" if start and end else "",
        "minutes": minutes,
        "topic": topic,
        "content": content,
        "place": str(row.get("place") or row.get("school_name") or ""),
        "kind": kind,
        "status": _legacy_status(row),
        "source": "realtime",
        "verificationState": str(row.get("verification_state") or ""),
        "settlementState": str(row.get("settlement_state") or ""),
        "verificationReason": str(row.get("verification_reason") or ""),
    }


def project_realtime_sessions(
    state: dict[str, Any],
    sessions: list[dict[str, Any]],
) -> dict[str, Any]:
    projected_state = deepcopy(state)
    matchings = projected_state.get("mat")
    if not isinstance(matchings, list):
        projected_state["mat"] = []
        matchings = projected_state["mat"]

    matching_by_id = {
        str(row.get("id")): row
        for row in matchings
        if isinstance(row, dict) and row.get("id") not in (None, "")
    }

    projected = 0
    updated = 0
    skipped = 0
    warnings: list[dict[str, Any]] = []

    for row in sessions or []:
        if not isinstance(row, dict):
            skipped += 1
            warnings.append({"code": "INVALID_SESSION", "message": "세션 데이터가 객체가 아닙니다."})
            continue

        matching_id = str(row.get("legacy_matching_id") or row.get("matching_id") or "")
        session_id = str(row.get("id") or row.get("session_id") or "")
        if not matching_id:
            skipped += 1
            warnings.append({
                "code": "MISSING_MATCHING_ID",
                "sessionId": session_id,
                "message": "기존 V13 매칭 ID가 없어 투영하지 않았습니다.",
            })
            continue

        matching = matching_by_id.get(matching_id)
        if matching is None:
            skipped += 1
            warnings.append({
                "code": "MATCHING_NOT_FOUND",
                "sessionId": session_id,
                "matchingId": matching_id,
                "message": "V13 상태에서 대응하는 매칭을 찾지 못했습니다.",
            })
            continue

        log = to_legacy_log(row)
        if not log["id"]:
            skipped += 1
            warnings.append({
                "code": "MISSING_SESSION_ID",
                "matchingId": matching_id,
                "message": "실시간 세션 ID가 없어 투영하지 않았습니다.",
            })
            continue

        logs = matching.setdefault("logs", [])
        found = next((i for i, item in enumerate(logs) if str(item.get("id") or "") == log["id"]), None)
        if found is None:
            logs.append(log)
            projected += 1
        else:
            logs[found] = {**logs[found], **log}
            updated += 1

    return {
        "ok": True,
        "state": projected_state,
        "projected": projected,
        "updated": updated,
        "skipped": skipped,
        "warnings": warnings,
    }
