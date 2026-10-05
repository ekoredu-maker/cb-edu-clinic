from __future__ import annotations

from typing import Any


def build_large_state(
    *,
    staff_count: int = 50,
    student_count: int = 1500,
    class_matching_count: int = 300,
    sessions_per_matching: int = 6,
    training_count: int = 24,
    ym: str = "2026-10",
) -> dict[str, Any]:
    """운영 상한 수준의 결정적 더미데이터를 생성한다.

    기본값 기준:
    - 지원단 50명
    - 학생 1,500명
    - 매칭 1,500건(학습코칭 1,200 + 수업협력 300)
    - 활동로그 9,000건
    - 연수 24건, 매 회 전 지원단 참석

    랜덤 모듈을 사용하지 않아 회귀 테스트 결과가 매번 동일하다.
    """
    if class_matching_count < 0 or class_matching_count > student_count:
        raise ValueError("class_matching_count는 0 이상 student_count 이하여야 합니다.")

    regions = ["제천", "단양"]
    school_types = ["초", "중"]
    weekdays = ["월", "화", "수", "목", "금"]
    statuses = ["verified", "paid", "conducted", "verified", "rejected", "paid"]

    staff = [
        {
            "id": f"sf{i:03d}",
            "nm": f"지원단{i:03d}",
            "st": "active",
            "areas": [regions[i % len(regions)]],
        }
        for i in range(1, staff_count + 1)
    ]

    students = []
    for i in range(1, student_count + 1):
        sc_type = school_types[i % len(school_types)]
        max_grade = 6 if sc_type == "초" else 3
        grade = ((i - 1) % max_grade) + 1
        support = ["방과후학습코칭"] if i <= student_count - class_matching_count else ["수업협력코칭"]
        if i % 10 == 0:
            support.append("심리진단")
        if i % 25 == 0:
            support.append("치료기관연계")
        students.append({
            "id": f"st{i:04d}",
            "nm": f"학생{i:04d}",
            "sc": f"가상학교{((i - 1) % 60) + 1:02d}",
            "scType": sc_type,
            "gr": grade,
            "region": regions[i % len(regions)],
            "supportTypes": support,
            "st": "active",
        })

    coach_count = student_count - class_matching_count
    matchings = []
    for i, student in enumerate(students, start=1):
        kind = "coach" if i <= coach_count else "class"
        logs = []
        for j in range(1, sessions_per_matching + 1):
            status = statuses[(j - 1) % len(statuses)]
            date = f"{ym}-{j:02d}"
            logs.append({
                "id": f"lg{i:04d}_{j:02d}",
                "d": date,
                "date": date,
                "s": "15:00",
                "e": "15:50" if kind == "coach" else "15:45",
                "time": "15:00",
                "topic": f"활동 {j}",
                "status": status,
                "kind": kind,
                "minutes": 50 if kind == "coach" else (45 if student["scType"] == "중" else 40),
            })
        matching = {
            "id": f"m{i:04d}",
            "stfId": staff[(i - 1) % staff_count]["id"],
            "stuId": student["id"],
            "kind": kind,
            "st": "active",
            "slots": [{"d": weekdays[(i - 1) % len(weekdays)], "s": "15:00", "e": "15:50"}],
            "logs": logs,
        }
        if kind == "class":
            matching["classInfo"] = {
                "sc": student["sc"],
                "scType": student["scType"],
                "gr": student["gr"],
                "cls": ((i - 1) % 4) + 1,
                "region": student["region"],
            }
        matchings.append(matching)

    trainings = []
    attendee_ids = [x["id"] for x in staff]
    for i in range(1, training_count + 1):
        trainings.append({
            "id": f"t{i:03d}",
            "nm": f"역량강화연수 {i}",
            "dt": f"{ym}-{((i - 1) % 28) + 1:02d}",
            "hr": 5 if i % 2 == 0 else 3,
            "verified": True,
            "attendees": attendee_ids,
        })

    return {
        "cfg": {
            "org": "제천교육지원청",
            "confirmer": "담당 장학사",
            "regions": regions,
            "rateCoach": 40000,
            "rateClass": 30000,
            "rateTravelLong": 20000,
            "rateTravelShort": 10000,
            "taxPct": 3.3,
            "budget": {
                "total": 300_000_000,
                "coach": 210_000_000,
                "cls": 45_000_000,
                "travel": 25_000_000,
            },
        },
        "stf": staff,
        "stu": students,
        "mat": matchings,
        "trn": trainings,
        "fixtureMeta": {
            "staffCount": staff_count,
            "studentCount": student_count,
            "matchingCount": student_count,
            "logCount": student_count * sessions_per_matching,
            "trainingCount": training_count,
            "ym": ym,
        },
    }
