from domain.statistics import build_statistics
from domain.verification import verify_records


def sample_state():
    return {
        "cfg": {"regions": ["제천", "단양"]},
        "stf": [{"id": "T1", "nm": "지원단1"}],
        "stu": [
            {"id": "S1", "nm": "학생1", "region": "제천", "sc": "A초", "scType": "초", "gr": 3, "cls": 1,
             "supportTypes": ["방과후학습코칭", "심리진단"]},
            {"id": "S2", "nm": "학생2", "region": "제천", "sc": "A초", "scType": "초", "gr": 4, "cls": 2,
             "supportTypes": ["수업협력코칭"]},
        ],
        "mat": [
            {"id": "M1", "st": "active", "kind": "coach", "stfId": "T1", "stuId": "S1",
             "slots": [{"d": "화"}], "logs": [{"id": "L1", "d": "2026-10-06", "s": "14:00", "e": "15:00", "status": "verified"}]},
            {"id": "M2", "st": "active", "kind": "class", "stfId": "T1",
             "classInfo": {"sc": "A초", "scType": "초", "gr": 4, "cls": 2, "region": "제천"},
             "logs": [{"id": "L2", "d": "2026-10-07", "status": "conducted", "kind": "class"}]},
        ],
    }


def test_statistics_contract():
    result = build_statistics({"state": sample_state()})
    assert result["pivotByGrade"]["초3"]["apply_coach"] == 1
    assert result["pivotByGrade"]["초3"]["coach"] == 1
    assert result["pivotByGrade"]["초4"]["apply_class_cnt"] == 1
    assert result["pivotByRegion"]["제천"]["class_cnt"] == 1


def test_monthly_verification_contract():
    result = verify_records({"state": sample_state(), "ym": "2026-10"})
    coach = next(x for x in result["monthly"] if x["matchingId"] == "M1")
    assert coach["actual"] == 1
    assert coach["expected"] == 4
    assert coach["totalHours"] == 1.0
    assert coach["ok"] is False
