import xml.etree.ElementTree as ET
import zipfile

from services.document_model import (
    appointment_confirmation_model,
    career_confirmation_model,
    learning_plan_model,
    manager_book_model,
    resignation_model,
    staff_appointment_model,
    timetable_model,
)
from services.hwpx_native_service import create_native_hwpx, validate_native_hwpx


HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def _state(mask_mode="partial"):
    return {
        "cfg": {
            "org": "제천교육지원청",
            "admin": "홍길동 장학사",
            "confirmer": "담당 장학사",
            "maskMode": mask_mode,
        },
        "stf": [
            {
                "id": "sf001",
                "nm": "김지원",
                "bd": "1985-04-03",
                "ph": "010-1111-2222",
                "st": "active",
                "appointArea": "학습코칭",
                "appointStart": "2026-03-01",
                "appointEnd": "2027-02-28",
                "careerHistory": [
                    {"start": "2025-03-01", "end": "2026-02-28", "area": "학습코칭"},
                ],
            }
        ],
        "stu": [
            {
                "id": "st0001",
                "nm": "홍길동",
                "alias": "별하",
                "sc": "의림초",
                "scType": "초",
                "gr": 4,
                "cls": 2,
                "supportTypes": ["방과후학습코칭"],
            }
        ],
        "mat": [
            {
                "id": "m001",
                "stfId": "sf001",
                "stuId": "st0001",
                "kind": "coach",
                "st": "active",
                "slots": [{"d": "월", "s": "15:00", "e": "15:50"}],
                "logs": [
                    {
                        "id": "l2025",
                        "date": "2025-10-06",
                        "time": "15:00~15:50",
                        "topic": "읽기 지도",
                        "status": "verified",
                        "minutes": 50,
                    },
                    {
                        "id": "l2026",
                        "date": "2026-10-05",
                        "time": "15:00~15:50",
                        "topic": "수학 지도",
                        "status": "paid",
                        "minutes": 50,
                    },
                    {
                        "id": "lpending",
                        "date": "2026-10-12",
                        "time": "15:00~15:50",
                        "topic": "미검증",
                        "status": "conducted",
                        "minutes": 50,
                    },
                ],
            }
        ],
        "trn": [],
    }


def _tables(path):
    assert validate_native_hwpx(path)["ok"] is True
    with zipfile.ZipFile(path, "r") as zin:
        section = zin.read("Contents/section0.xml")
        text = section.decode("utf-8")
    root = ET.fromstring(section)
    return root.findall(f".//{HP}tbl"), text


def test_html_masking_parity_for_manager_and_timetable():
    state = _state("partial")
    manager = manager_book_model(state, "sf001", "2026-10")
    assert "홍OO(의림초)" in dict(manager["meta"])["담당학생"]
    assert any("홍OO" in row for row in manager["rows"])
    assert manager["totals"]["count"] == 1

    timetable = timetable_model(state, "staff", "sf001")
    assert len(timetable["columns"]) == 8
    assert len(timetable["rows"]) == 28
    assert timetable["totals"]["slots"] == 1
    assert any("홍OO" in str(cell) for row in timetable["rows"] for cell in row)

    alias_state = _state("alias")
    alias_timetable = timetable_model(alias_state, "staff", "sf001")
    assert any("별하" in str(cell) for row in alias_timetable["rows"] for cell in row)


def test_administrative_form_models_follow_html_contract():
    state = _state()
    appoint = staff_appointment_model(state, "sf001")
    assert appoint["rows"][0] == ["성 명", "김지원", "생년월일", "1985-04-03"]
    assert "제천교육지원청교육장" in appoint["paragraphsAfter"]

    confirm = appointment_confirmation_model(state, "sf001")
    assert any("위촉되어 활동 중임을 확인합니다" in x for x in confirm["paragraphsAfter"])
    assert any("홍길동 장학사" in x for x in confirm["paragraphsAfter"])

    career = career_confirmation_model(state, "sf001")
    assert career["totals"]["historyCount"] == 2
    assert len(career["tables"]) == 2
    assert career["rows"][0][4] == "1회"
    assert career["rows"][1][4] == "1회"

    resign = resignation_model(
        state,
        "sf001",
        resign_date="2026. 12. 31.",
        resign_reason="개인 사정",
        detail_reason="학업 병행",
    )
    assert resign["rows"][3] == ["해촉 예정일", "2026. 12. 31.", "해촉 사유", "개인 사정"]
    assert resign["rows"][4][1] == "학업 병행"

    plan = learning_plan_model(state, "sf001")
    assert plan["rows"][0][1] == "김지원"
    assert len(plan["rows"]) == 9
    assert plan["rowHeights"][6] == 12000


def test_native_hwpx_for_all_new_html_forms(tmp_path):
    state = _state()
    models = {
        "appoint": staff_appointment_model(state, "sf001"),
        "confirm": appointment_confirmation_model(state, "sf001"),
        "career": career_confirmation_model(state, "sf001"),
        "resign": resignation_model(state, "sf001", resign_reason="개인 사정"),
        "plan": learning_plan_model(state, "sf001"),
        "timetable": timetable_model(state, "staff", "sf001"),
    }
    expected = {
        "appoint": (1, "4"),
        "confirm": (1, "4"),
        "career": (2, "4"),
        "resign": (1, "4"),
        "plan": (1, "4"),
        "timetable": (1, "8"),
    }
    for name, model in models.items():
        path = create_native_hwpx(tmp_path / f"{name}.hwpx", model)
        tables, text = _tables(path)
        count, first_cols = expected[name]
        assert len(tables) == count
        assert tables[0].attrib["colCnt"] == first_cols
        assert model["title"] in text

    timetable_path = tmp_path / "timetable.hwpx"
    timetable_tables, timetable_text = _tables(timetable_path)
    assert timetable_tables[0].attrib["rowCnt"] == "29"
    assert 'landscape="WIDELY"' in timetable_text
    assert "홍OO" in timetable_text
