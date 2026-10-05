from __future__ import annotations

from typing import Any

# Stage18: backend.app imports this module before services.document_model.
# Importing document_routing here preserves the existing app import surface
# while routing HWPX/native models to HTML print contracts. Excel explicitly
# uses the captured detailed export models.
from services import document_routing as _document_routing  # noqa: F401


def settlement_context(settlement: dict[str, Any], staff_id: str, ym: str, org: str = "", confirmer: str = "") -> dict[str, Any]:
    by_staff = settlement.get("byStaff") or {}
    summary = settlement.get("summaryByStaff") or {}
    data = by_staff.get(staff_id) or {"coach": [], "cls": [], "travel": []}
    sums = summary.get(staff_id) or {
        "coachCount": 0, "coachAmount": 0,
        "classCount": 0, "classAmount": 0,
        "travelCount": 0, "travelAmount": 0,
        "gross": 0, "tax": 0, "net": 0,
    }

    return {
        "YM": ym,
        "ORG": org,
        "CONFIRMER": confirmer,
        "STAFF_ID": staff_id,
        "COACH_COUNT": sums.get("coachCount", 0),
        "COACH_AMOUNT": sums.get("coachAmount", 0),
        "CLASS_COUNT": sums.get("classCount", 0),
        "CLASS_AMOUNT": sums.get("classAmount", 0),
        "TRAVEL_COUNT": sums.get("travelCount", 0),
        "TRAVEL_AMOUNT": sums.get("travelAmount", 0),
        "GROSS": sums.get("gross", 0),
        "TAX": sums.get("tax", 0),
        "NET": sums.get("net", 0),
        "COACH_ROWS": data.get("coach", []),
        "CLASS_ROWS": data.get("cls", []),
        "TRAVEL_ROWS": data.get("travel", []),
    }


def execution_context(settlement: dict[str, Any], ym: str, org: str = "") -> dict[str, Any]:
    executed = settlement.get("executed") or {}
    return {
        "YM": ym,
        "ORG": org,
        "COACH_AMOUNT": executed.get("coach", 0),
        "CLASS_AMOUNT": executed.get("cls", 0),
        "TRAVEL_AMOUNT": executed.get("travel", 0),
        "TOTAL_AMOUNT": executed.get("total", 0),
        "STAFF_ROWS": settlement.get("summaryByStaff") or {},
    }
