from typing import Any


def verify_records(payload: dict[str, Any]) -> dict[str, Any]:
    sessions = payload.get("sessions") or []
    errors: list[dict[str, Any]] = []

    seen_ids: set[str] = set()
    for index, row in enumerate(sessions):
        record_id = str(row.get("id") or "")
        if record_id:
            if record_id in seen_ids:
                errors.append({
                    "index": index,
                    "code": "DUPLICATE_SESSION_ID",
                    "message": "중복 회기 ID가 있습니다.",
                    "id": record_id,
                })
            seen_ids.add(record_id)

        if not row.get("studentId") and not row.get("classId"):
            errors.append({
                "index": index,
                "code": "MISSING_TARGET",
                "message": "학생 또는 학급 연결 정보가 없습니다.",
            })

        minutes = row.get("minutes")
        if minutes is not None:
            try:
                if float(minutes) <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                errors.append({
                    "index": index,
                    "code": "INVALID_MINUTES",
                    "message": "활동 시간은 0보다 큰 숫자여야 합니다.",
                })

    return {
        "ok": len(errors) == 0,
        "errorCount": len(errors),
        "errors": errors,
    }
