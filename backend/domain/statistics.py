from __future__ import annotations

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


def _execution_metrics(state: dict[str, Any]) -> dict[str, Any]:
    students = _students(state)
    by_id = {str(s.get("id")): s for s in students if s.get("id") is not None}
    coach_stu_ids: set[str] = set()
    class_mat_ids: set[str] = set()
    class_group_keys: set[str] = set()
    region_coach: dict[str, set[str]] = {}
    region_class_mat: dict[str, set[str]] = {}
    region_class_group: dict[str, set[str]] = {}

    for matching in _matchings(state):
        for log in matching.get("logs") or []:
            if not _is_actual_log(log):
                continue
            kind = log.get("kind") or matching.get("kind")
            if kind == "class":
                mid = str(matching.get("id") or "")
                if mid:
                    class_mat_ids.add(mid)
                ci = matching.get("classInfo") or {}
                group_key = f"{ci.get('sc','')}__{ci.get('gr','')}__{ci.get('cls','')}"
                class_group_keys.add(group_key)
                region = _infer_region(ci, students)
                if region:
                    if mid:
                        region_class_mat.setdefault(region, set()).add(mid)
                    region_class_group.setdefault(region, set()).add(group_key)
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
        "regionCoachStuIds": region_coach,
        "regionClassMatIds": region_class_mat,
        "regionClassGroupKeys": region_class_group,
    }


def pivot_by_grade(state: dict[str, Any]) -> dict[str, dict[str, int]]:
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
        if "방과후학습코칭" in support: row["apply_coach"] += 1
        if "수업협력코칭" in support: row["apply_class_stu"] += 1
        if "심리진단" in support: row["diag"] += 1
        if "치료기관연계" in support: row["therapy"] += 1

    for matching in matchings:
        if matching.get("kind") == "class" and matching.get("st") == "active":
            ci = matching.get("classInfo") or {}
            row = result.get(f"{ci.get('scType','')}{ci.get('gr','')}")
            if row: row["apply_class_cnt"] += 1

    metrics = _execution_metrics(state)
    for stu_id in metrics["coachStuIds"]:
        student = by_id.get(stu_id)
        if student:
            row = result.get(f"{student.get('scType','')}{student.get('gr','')}")
            if row: row["coach"] += 1

    by_matching_id = {str(m.get("id")): m for m in matchings if m.get("id") is not None}
    for mat_id in metrics["classMatIds"]:
        matching = by_matching_id.get(mat_id) or {}
        ci = matching.get("classInfo") or {}
        row = result.get(f"{ci.get('scType','')}{ci.get('gr','')}")
        if row: row["class_cnt"] += 1

    for group_key in metrics["classGroupKeys"]:
        parts = group_key.split("__")
        sc = parts[0] if parts else ""
        gr = parts[1] if len(parts) > 1 else ""
        student = next((s for s in students if (s.get("sc") or "") == sc and str(s.get("gr") or "") == str(gr)), None)
        if student:
            row = result.get(f"{student.get('scType','')}{student.get('gr','')}" )
            if row: row["class_stu"] += 1
    return result


def pivot_by_region(state: dict[str, Any]) -> dict[str, dict[str, int]]:
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
        if "방과후학습코칭" in support: row["apply_coach"] += 1
        if "수업협력코칭" in support: row["apply_class_stu"] += 1
        if "심리진단" in support: row["diag"] += 1
        if "치료기관연계" in support: row["therapy"] += 1

    for matching in _matchings(state):
        if matching.get("kind") == "class" and matching.get("st") == "active":
            ci = matching.get("classInfo") or {}
            region = _infer_region(ci, students)
            if region in result: result[region]["apply_class_cnt"] += 1

    metrics = _execution_metrics(state)
    for region, ids in metrics["regionCoachStuIds"].items():
        if region in result: result[region]["coach"] = len(ids)
    for region, ids in metrics["regionClassMatIds"].items():
        if region in result: result[region]["class_cnt"] = len(ids)
    for region, ids in metrics["regionClassGroupKeys"].items():
        if region in result: result[region]["class_stu"] = len(ids)
    return result


def build_statistics(payload: dict[str, Any]) -> dict[str, Any]:
    state = _state(payload)
    students = _students(state)
    matchings = _matchings(state)
    metrics = _execution_metrics(state)
    return {
        "engine": "python",
        "counts": {
            "students": len(students),
            "staff": len(_staff(state)),
            "matchings": len(matchings),
            "actualCoachStudents": len(metrics["coachStuIds"]),
            "actualClassMatchings": len(metrics["classMatIds"]),
            "actualClassGroups": len(metrics["classGroupKeys"]),
        },
        "pivotByGrade": pivot_by_grade(state),
        "pivotByRegion": pivot_by_region(state),
    }
