from domain.settlement import build_settlement


def test_settlement_matches_v12_rules():
    state = {
        "cfg": {
            "rateCoach": 40000,
            "rateClass": 30000,
            "rateTravelLong": 20000,
            "rateTravelShort": 10000,
            "taxPct": 3.3,
            "budget": {"total": 500000, "coach": 300000, "cls": 100000, "travel": 100000},
        },
        "stu": [{"id": "stu1", "nm": "학생1", "sc": "테스트초"}],
        "mat": [
            {
                "id": "m1", "stfId": "s1", "stuId": "stu1", "kind": "coach",
                "logs": [
                    {"date": "2026-10-02", "status": "verified", "kind": "coach", "topic": "기초학습"},
                    {"date": "2026-10-09", "status": "conducted", "kind": "coach"},
                ],
            },
            {
                "id": "m2", "stfId": "s1", "kind": "class",
                "classInfo": {"sc": "테스트초", "gr": 3, "cls": 1},
                "logs": [{"date": "2026-10-03", "status": "paid", "kind": "class"}],
            },
        ],
        "trn": [
            {"dt": "2026-10-10T09:00", "nm": "연수", "hr": 4, "verified": True, "attendees": ["s1"]}
        ],
    }
    result = build_settlement({"state": state, "ym": "2026-10"})
    s1 = result["summaryByStaff"]["s1"]
    assert s1["coachCount"] == 1
    assert s1["coachAmount"] == 40000
    assert s1["classCount"] == 1
    assert s1["classAmount"] == 30000
    assert s1["travelCount"] == 1
    assert s1["travelAmount"] == 20000
    assert s1["gross"] == 90000
    assert s1["tax"] == round(90000 * 3.3 / 100)
    assert s1["net"] == 90000 - s1["tax"]
    assert result["executed"]["total"] == 90000
    assert result["remaining"]["total"] == 410000
