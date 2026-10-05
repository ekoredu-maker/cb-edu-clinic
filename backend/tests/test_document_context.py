from services.document_context import execution_context, settlement_context


def test_settlement_context():
    settlement = {
        "byStaff": {"s1": {"coach": [{"amount": 40000}], "cls": [], "travel": []}},
        "summaryByStaff": {"s1": {"coachCount": 1, "coachAmount": 40000, "classCount": 0, "classAmount": 0, "travelCount": 0, "travelAmount": 0, "gross": 40000, "tax": 1320, "net": 38680}},
    }
    ctx = settlement_context(settlement, "s1", "2026-10", "제천교육지원청", "담당 장학사")
    assert ctx["COACH_COUNT"] == 1
    assert ctx["GROSS"] == 40000
    assert ctx["NET"] == 38680


def test_execution_context():
    settlement = {"executed": {"coach": 40000, "cls": 30000, "travel": 20000, "total": 90000}, "summaryByStaff": {}}
    ctx = execution_context(settlement, "2026-10", "제천교육지원청")
    assert ctx["TOTAL_AMOUNT"] == 90000
