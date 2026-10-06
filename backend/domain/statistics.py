from __future__ import annotations

from datetime import date
from typing import Any

ACTUAL_STATUSES = {"conducted", "verified", "paid"}


def _state(payload: dict[str, Any]) -> dict[str, Any]:
    return payload.get("state") or payload


def _students(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.get("stu") or state.get("students") or []


def _staff(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.get("stf") or state.get("staff") or []


def _matchings(state: dict[str, Any]) -> list[dict[str, Any]]:
    return state.get("mat") or state.get("matchings") or []


def _regions(state: dict[str, Any]) -> list[str]:
    cfg = state.get("cfg") or {}
    regions = cfg.get("regions") or []
    return list(regions) if regions else ["지역1", "지역2"]


def _is_actual_log(log: dict[str, Any]) -> bool:
    return (log.get("status") or "conducted") in ACTUAL_STATUSES


def _parse_day(value: Any) -> date | None:
    raw = str(value or "").strip()[:10]
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _period(as_of: str, report_type: str) -> tuple[date | None, date | None]:
    end = _parse_day(as_of)
    if end is None:
        return None, None
    kind = str(report_type or "").lower()
    if kind == "month":
        return end.replace(day=1), end
    if kind == "quarter":
        month = ((end.month - 1) // 3) * 3 + 1
        return end.replace(month=month, day=1), end
    return None, end


def _log_in_period(log: dict[str, Any], start: date | None, end: date | None) -> bool:
    if start is None and end is None:
        return True
    day = _parse_day(log.get("date") or log.get("d"))
    if day is None:
        return False
    if start is not None and day < start:
        return False
    if end is not None and day > end:
        return False
    return True


def _infer_region(class_info: dict[str, Any], students: list[dict[str, Any]]) -> str:
    if class_info.get("region"):
        return str(class_info["region"])
    for student in students:
        same_school = (student.get("sc") or "") == (class_info.get("sc") or "")
        same_type = not class_info.get("scType") or (student.get("scType") or "") == class_info.get("scType")
        same_grade = not class_info.get("gr") or str(student.get("gr") or "") == str(class_info.get("gr") or "")
        if same_school and same_type and same_grade:
            return str(student.get("region") or "")
    return ""


def _class_group_key(class_info: dict[str, Any]) -> str:
    return "__".join(str(class_info.get(k) or "") for k in ("sc", "scType", "gr", "cls"))


def _matching_class_student_ids(class_info: dict[str, Any], students: list[dict[str, Any]]) -> set[str]:
    ids: set[str] = set()
    for student in students:
        if "수업협력코칭" not in (student.get("supportTypes") or []):
            continue
        same_school = (student.get("sc") or "") == (class_info.get("sc") or "")
        same_type = (student.get("scType") or "") == (class_info.get("scType") or "")
        same_grade = str(student.get("gr") or "") == str(class_info.get("gr") or "")
        ci_cls = class_info.get("cls")
        stu_cls = student.get("cls")
        same_class = (
            ci_cls in (None, "") or stu_cls in (None, "") or str(stu_cls) == str(ci_cls)
        )
        if same_school and same_type and same_grade and same_class and student.get("id") is not None:
            ids.add(str(student["id"]))
    return ids


def _active_class_groups(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for matching in _matchings(state):
        if matching.get("kind") != "class" or matching.get("st") != "active":
            continue
        ci = matching.get("classInfo") or {}
        key = _class_group_key(ci)
        if key.strip("_"):
            groups.setdefault(key, ci)
    return groups


def _execution_metrics(
    state: dict[str, Any],
    *,
    as_of: str = "",
    report_type: str = "",
) -> dict[str, Any]:
    students = _students(state)
    by_id = {str(s.get("id")): s for s in students if s.get("id") is not None}
    start, end = _period(as_of, report_type)

    coach_stu_ids: set[str] = set()
    class_mat_ids: set[str] = set()
    class_group_keys: set[str] = set()
    class_stu_ids: set[str] = set()
    region_coach: dict[str, set[str]] = {}
    region_class_mat: dict[str, set[str]] = {}
    region_class_group: dict[str, set[str]] = {}
    region_class_stu: dict[str, set[str]] = {}

    for matching in _matchings(state):
        for log in matching.get("logs") or []:
            if not _is_actual_log(log) or not _log_in_period(log, start, end):
                continue
            kind = log.get("kind") or matching.get("kind")
            if kind == "class":
                mid = str(matching.get("id") or "")
                if mid:
                    class_mat_ids.add(mid)
                ci = matching.get("classInfo") or {}
                group_key = _class_group_key(ci)
                if group_key.strip("_"):
                    class_group_keys.add(group_key)
                student_ids = _matching_class_student_ids(ci, students)
                class_stu_ids.update(student_ids)
                region = _infer_region(ci, students)
                if region:
                    if mid:
                        region_class_mat.setdefault(region, set()).add(mid)
                    if group_key.strip("_"):
                        region_class_group.setdefault(region, set()).add(group_key)
                    region_class_stu.setdefault(region, set()).update(student_ids)
            else:
                stu_id = str(matching.get("stuId") or "")
                if stu_id:
                    coach_stu_ids.add(stu_id)
                    student = by_id.get(stu_id) or {}
                    region = str(student.get("region") or "")
                    if region:
                        region_coach.setdefault(region, set()).add(stu_id)

    return {
        "coachStuIds": coach_stu_ids,
        "classMatIds": class_mat_ids,
        "classGroupKeys": class_group_keys,
        "classStuIds": class_stu_ids,
        "regionCoachStuIds": region_coach,
        "regionClassMatIds": region_class_mat,
        "regionClassGroupKeys": region_class_group,
        "regionClassStuIds": region_class_stu,
        "periodStart": start.isoformat() if start else "",
        "periodEnd": end.isoformat() if end else "",
    }


def pivot_by_grade(
    state: dict[str, Any],
    *,
    as_of: str = "",
    report_type: str = "",
) -> dict[str, dict[str, int]]:
    students = _students(state)
    matchings = _matchings(state)
    by_id = {str(s.get("id")): s for s in students if s.get("id") is not None}
    result: dict[str, dict[str, int]] = {}
    for level, max_grade in (("초", 6), ("중", 3)):
        for grade in range(1, max_grade + 1):
            result[f"{level}{grade}"] = {
                "apply_coach": 0, "apply_class_cnt": 0, "apply_class_stu": 0, "diag": 0,
                "coach": 0, "class_cnt": 0, "class_stu": 0, "therapy": 0,
            }

    for student in students:
        key = f"{student.get('scType','')}{student.get('gr','')}"
        row = result.get(key)
        if not row:
            continue
        support = student.get("supportTypes") or []
        if "방과후학습코칭" in support:
            row["apply_coach"] += 1
        if "수업협력코칭" in support:
            row["apply_class_stu"] += 1
        if "심리진단" in support:
            row["diag"] += 1
        if "치료기관연계" in support:
            row["therapy"] += 1

    for ci in _active_class_groups(state).values():
        row = result.get(f"{ci.get('scType','')}{ci.get('gr','')}")
        if row:
            row["apply_class_cnt"] += 1

    metrics = _execution_metrics(state, as_of=as_of, report_type=report_type)
    for stu_id in metrics["coachStuIds"]:
        student = by_id.get(stu_id)
        if student:
            row = result.get(f"{student.get('scType','')}{student.get('gr','')}")
            if row:
                row["coach"] += 1

    seen_groups: set[str] = set()
    for matching in matchings:
        if str(matching.get("id") or "") not in metrics["classMatIds"]:
            continue
        ci = matching.get("classInfo") or {}
        key = _class_group_key(ci)
        if key in seen_groups:
            continue
        seen_groups.add(key)
        row = result.get(f"{ci.get('scType','')}{ci.get('gr','')}")
        if row:
            row["class_cnt"] += 1

    for stu_id in metrics["classStuIds"]:
        student = by_id.get(stu_id)
        if student:
            row = result.get(f"{student.get('scType','')}{student.get('gr','')}")
            if row:
                row["class_stu"] += 1
    return result


def pivot_by_region(
    state: dict[str, Any],
    *,
    as_of: str = "",
    report_type: str = "",
) -> dict[str, dict[str, int]]:
    students = _students(state)
    result = {r: {
        "apply_coach": 0, "apply_class_cnt": 0, "apply_class_stu": 0, "diag": 0,
        "coach": 0, "class_cnt": 0, "class_stu": 0, "therapy": 0,
    } for r in _regions(state)}

    for student in students:
        row = result.get(str(student.get("region") or ""))
        if not row:
            continue
        support = student.get("supportTypes") or []
        if "방과후학습코칭" in support:
            row["apply_coach"] += 1
        if "수업협력코칭" in support:
            row["apply_class_stu"] += 1
        if "심리진단" in support:
            row["diag"] += 1
        if "치료기관연계" in support:
            row["therapy"] += 1

    for ci in _active_class_groups(state).values():
        region = _infer_region(ci, students)
        if region in result:
            result[region]["apply_class_cnt"] += 1

    metrics = _execution_metrics(state, as_of=as_of, report_type=report_type)
    for region, ids in metrics["regionCoachStuIds"].items():
        if region in result:
            result[region]["coach"] = len(ids)
    for region, ids in metrics["regionClassGroupKeys"].items():
        if region in result:
            result[region]["class_cnt"] = len(ids)
    for region, ids in metrics["regionClassStuIds"].items():
        if region in result:
            result[region]["class_stu"] = len(ids)
    return result


def build_statistics(payload: dict[str, Any]) -> dict[str, Any]:
    state = _state(payload)
    students = _students(state)
    matchings = _matchings(state)
    as_of = str(payload.get("asOf") or payload.get("as_of") or "")
    report_type = str(payload.get("reportType") or payload.get("report_type") or "")
    metrics = _execution_metrics(state, as_of=as_of, report_type=report_type)
    active_staff = [s for s in _staff(state) if (s.get("st") or "active") == "active"]
    active_matchings = [m for m in matchings if (m.get("st") or "active") == "active"]
    return {
        "engine": "python",
        "period": {
            "asOf": as_of,
            "reportType": report_type,
            "start": metrics["periodStart"],
            "end": metrics["periodEnd"],
            "applicationSnapshot": "current",
        },
        "counts": {
            "students": len(students),
            "staff": len(active_staff),
            "matchings": len(active_matchings),
            "actualCoachStudents": len(metrics["coachStuIds"]),
            "actualClassMatchings": len(metrics["classMatIds"]),
            "actualClassGroups": len(metrics["classGroupKeys"]),
            "actualClassStudents": len(metrics["classStuIds"]),
        },
        "pivotByGrade": pivot_by_grade(state, as_of=as_of, report_type=report_type),
        "pivotByRegion": pivot_by_region(state, as_of=as_of, report_type=report_type),
    }
