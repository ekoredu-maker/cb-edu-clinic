from domain.statistics import build_statistics
from services.statistics_excel_service import _dyslex_border


def _accuracy_state():
    return {
        "cfg": {"regions": ["제천"]},
        "stf": [{"id": "T1", "nm": "지원단1", "st": "active"}],
        "stu": [
            {"id": "S1", "sc": "A초", "scType": "초", "gr": 3, "cls": 1, "region": "제천",
             "supportTypes": ["방과후학습코칭"]},
            {"id": "S2", "sc": "A초", "scType": "초", "gr": 4, "cls": 2, "region": "제천",
             "supportTypes": ["수업협력코칭"]},
            {"id": "S3", "sc": "A초", "scType": "초", "gr": 4, "cls": 2, "region": "제천",
             "supportTypes": ["수업협력코칭"]},
            {"id": "S4", "sc": "A초", "scType": "초", "gr": 4, "cls": 3, "region": "제천",
             "supportTypes": ["수업협력코칭"]},
        ],
        "mat": [
            {"id": "M1", "st": "active", "kind": "coach", "stfId": "T1", "stuId": "S1",
             "logs": [
                 {"id": "L1", "date": "2026-09-30", "status": "verified", "kind": "coach"},
                 {"id": "L2", "date": "2026-10-05", "status": "verified", "kind": "coach"},
             ]},
            {"id": "M2", "st": "active", "kind": "class", "stfId": "T1",
             "classInfo": {"sc": "A초", "scType": "초", "gr": 4, "cls": 2, "region": "제천"},
             "logs": [
                 {"id": "L3", "date": "2026-10-02", "status": "conducted", "kind": "class"},
                 {"id": "L4", "date": "2026-11-01", "status": "verified", "kind": "class"},
             ]},
            # 같은 학급을 중복 매칭해도 학급수/학생수는 중복 계산하지 않아야 한다.
            {"id": "M3", "st": "active", "kind": "class", "stfId": "T1",
             "classInfo": {"sc": "A초", "scType": "초", "gr": 4, "cls": 2, "region": "제천"},
             "logs": [{"id": "L5", "date": "2026-10-03", "status": "paid", "kind": "class"}]},
        ],
    }


def test_statistics_uses_real_class_student_ids_and_deduplicates_classes():
    result = build_statistics({
        "state": _accuracy_state(),
        "asOf": "2026-10-15",
        "reportType": "month",
    })

    grade = result["pivotByGrade"]["초4"]
    assert grade["apply_class_cnt"] == 1
    assert grade["apply_class_stu"] == 3
    assert grade["class_cnt"] == 1
    assert grade["class_stu"] == 2

    region = result["pivotByRegion"]["제천"]
    assert region["class_cnt"] == 1
    assert region["class_stu"] == 2

    assert result["counts"]["actualClassMatchings"] == 2
    assert result["counts"]["actualClassGroups"] == 1
    assert result["counts"]["actualClassStudents"] == 2


def test_statistics_respects_month_and_as_of_date():
    state = _accuracy_state()

    october = build_statistics({
        "state": state,
        "asOf": "2026-10-15",
        "reportType": "month",
    })
    assert october["period"]["start"] == "2026-10-01"
    assert october["period"]["end"] == "2026-10-15"
    assert october["pivotByGrade"]["초3"]["coach"] == 1
    assert october["pivotByGrade"]["초4"]["class_cnt"] == 1

    september = build_statistics({
        "state": state,
        "asOf": "2026-09-30",
        "reportType": "month",
    })
    assert september["pivotByGrade"]["초3"]["coach"] == 1
    assert september["pivotByGrade"]["초4"]["class_cnt"] == 0
    assert september["pivotByGrade"]["초4"]["class_stu"] == 0

    before_october_activity = build_statistics({
        "state": state,
        "asOf": "2026-10-01",
        "reportType": "month",
    })
    assert before_october_activity["pivotByGrade"]["초3"]["coach"] == 0
    assert before_october_activity["pivotByGrade"]["초4"]["class_cnt"] == 0


def test_diagnosis_not_done_is_not_counted_as_negative():
    state = {
        "stu": [
            {"id": "S1", "areas": ["DYSLEX"], "supportTypes": ["방과후학습코칭"],
             "diagTest": {"done": False, "dyslexia": False}},
            {"id": "S2", "areas": ["DYSLEX"], "supportTypes": ["방과후학습코칭"],
             "diagTest": {"done": True, "dyslexia": False}},
            {"id": "S3", "areas": ["BORDER"], "supportTypes": ["치료기관연계"],
             "diagTest": {"done": False, "borderline": False}},
        ]
    }
    result = _dyslex_border(state)

    assert result["dyslex"]["applied"] == 2
    assert result["dyslex"]["tested"] == 1
    assert result["dyslex"]["neg_coach"] == 1
    assert result["dyslex"]["pos_coach"] == 0

    assert result["border"]["applied"] == 1
    assert result["border"]["tested"] == 0
    assert result["border"]["neg_therapy"] == 0
    assert result["border"]["pos_therapy"] == 0
