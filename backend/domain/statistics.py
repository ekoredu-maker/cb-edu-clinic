from collections import Counter
from typing import Any


def build_statistics(payload: dict[str, Any]) -> dict[str, Any]:
    students = payload.get("students") or []
    staff = payload.get("staff") or []
    sessions = payload.get("sessions") or []
    matchings = payload.get("matchings") or []

    by_region = Counter(str(x.get("region", "미지정")) for x in students)
    by_school_type = Counter(str(x.get("schoolType", "미지정")) for x in students)
    by_support = Counter(str(x.get("supportType", "미지정")) for x in students)

    approved_sessions = [x for x in sessions if x.get("verified") in (True, "approved", "승인")]

    return {
        "counts": {
            "students": len(students),
            "staff": len(staff),
            "sessions": len(sessions),
            "approvedSessions": len(approved_sessions),
            "matchings": len(matchings),
        },
        "studentsByRegion": dict(by_region),
        "studentsBySchoolType": dict(by_school_type),
        "studentsBySupportType": dict(by_support),
    }
