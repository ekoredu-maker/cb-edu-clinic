from __future__ import annotations

from typing import Any

VERIFIED_STATUSES = {"verified", "paid"}


def _state(payload: dict[str, Any]) -> dict[str, Any]:
    return payload.get("state") or payload


def _rates(state: dict[str, Any]) -> dict[str, float]:
    cfg = state.get("cfg") or {}
    return {
        "coach": float(cfg.get("rateCoach") or 40000),
        "cls": float(cfg.get("rateClass") or 30000),
        "travelLong": float(cfg.get("rateTravelLong") or 20000),
        "travelShort": float(cfg.get("rateTravelShort") or 10000),
        "taxPct": float(cfg.get("taxPct") or 3.3),
    }


def _budget(state: dict[str, Any]) -> dict[str, float]:
    raw = (state.get("cfg") or {}).get("budget") or {}
    # V12/초기 데이터 중에는 전체예산을 숫자 하나로 저장한 경우가 있을 수 있다.
    # 그 값은 총예산으로 안전하게 승격하고 세부 항목은 0으로 둔다.
    if isinstance(raw, (int, float, str)):
        try:
            total = float(raw or 0)
        except (TypeError, ValueError):
            total = 0.0
        return {"total": total, "coach": 0.0, "cls": 0.0, "travel": 0.0}
    if not isinstance(raw, dict):
        raw = {}
    return {
        "total": float(raw.get("total") or 0),
        "coach": float(raw.get("coach") or 0),
        "cls": float(raw.get("cls") or 0),
        "travel": float(raw.get("travel") or 0),
    }


def _students_by_id(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(s.get("id")): s for s in (state.get("stu") or []) if s.get("id") is not None}


def _log_amount(log: dict[str, Any], rates: dict[str, float]) -> float:
    if log.get("amount") not in (None, ""):
        try:
            return float(log.get("amount"))
        except (TypeError, ValueError):
            pass
    return rates["cls"] if (log.get("kind") == "class") else rates["coach"]


def build_settlement(payload: dict[str, Any]) -> dict[str, Any]:
    state = _state(payload)
    ym = str(payload.get("ym") or "")
    rates = _rates(state)
    students = _students_by_id(state)
    by_staff: dict[str, dict[str, list[dict[str, Any]]]] = {}

    for matching in state.get("mat") or []:
        staff_id = str(matching.get("stfId") or "")
        if not staff_id:
            continue
        for log in matching.get("logs") or []:
            status = log.get("status") or "conducted"
            if status not in VERIFIED_STATUSES:
                continue
            date = str(log.get("date") or "")
            if ym and not date.startswith(ym):
                continue
            kind = log.get("kind") or matching.get("kind") or "coach"
            amount = _log_amount({**log, "kind": kind}, rates)
            bucket = "cls" if kind == "class" else "coach"
            by_staff.setdefault(staff_id, {"coach": [], "cls": [], "travel": []})
            stu = students.get(str(matching.get("stuId") or "")) or {}
            ci = matching.get("classInfo") or {}
            by_staff[staff_id][bucket].append({
                "date": date,
                "time": log.get("time") or "",
                "topic": log.get("topic") or "",
                "minutes": log.get("minutes"),
                "amount": amount,
                "stu": (f"{ci.get('gr')}-{ci.get('cls')}반" if ci.get("gr") else (ci.get("sc") or "")) if kind == "class" else (stu.get("nm") or ""),
                "sc": (ci.get("sc") or "") if kind == "class" else (stu.get("sc") or ""),
            })

    for training in state.get("trn") or []:
        if not training.get("verified"):
            continue
        dt = str(training.get("dt") or "")
        if ym and not dt.startswith(ym):
            continue
        hours = float(training.get("hr") or 0)
        per = rates["travelLong"] if hours >= 4 else rates["travelShort"]
        for staff_id in training.get("attendees") or []:
            key = str(staff_id)
            by_staff.setdefault(key, {"coach": [], "cls": [], "travel": []})
            by_staff[key]["travel"].append({
                "date": dt[:10],
                "title": training.get("nm") or "",
                "hours": hours,
                "amount": per,
            })

    summary_by_staff: dict[str, dict[str, Any]] = {}
    executed = {"coach": 0.0, "cls": 0.0, "travel": 0.0, "total": 0.0}
    for staff_id, data in by_staff.items():
        coach_sum = sum(float(x.get("amount") or 0) for x in data["coach"])
        cls_sum = sum(float(x.get("amount") or 0) for x in data["cls"])
        travel_sum = sum(float(x.get("amount") or 0) for x in data["travel"])
        gross = coach_sum + cls_sum + travel_sum
        tax = round(gross * rates["taxPct"] / 100)
        net = gross - tax
        summary_by_staff[staff_id] = {
            "coachCount": len(data["coach"]),
            "coachAmount": coach_sum,
            "classCount": len(data["cls"]),
            "classAmount": cls_sum,
            "travelCount": len(data["travel"]),
            "travelAmount": travel_sum,
            "gross": gross,
            "tax": tax,
            "net": net,
        }
        executed["coach"] += coach_sum
        executed["cls"] += cls_sum
        executed["travel"] += travel_sum

    executed["total"] = executed["coach"] + executed["cls"] + executed["travel"]
    budget = _budget(state)
    remaining = {
        "total": max(0.0, budget["total"] - executed["total"]),
        "coach": max(0.0, budget["coach"] - executed["coach"]),
        "cls": max(0.0, budget["cls"] - executed["cls"]),
        "travel": max(0.0, budget["travel"] - executed["travel"]),
    }

    return {
        "engine": "python",
        "ym": ym,
        "rates": rates,
        "budget": budget,
        "executed": executed,
        "remaining": remaining,
        "byStaff": by_staff,
        "summaryByStaff": summary_by_staff,
    }
