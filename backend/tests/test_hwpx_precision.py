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
from services.hwpx_native_service import create_native_hwpx, render_diagnostics, validate_native_hwpx


def _state():
    return {
        "cfg": {
            "org": "제천교육지원청",
            "admin": "홍길동 장학사",
            "confirmer": "담당 장학사",
            "maskMode": "partial",
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
                        "id": "l1",
                        "date": "2026-10-05",
                        "time": "15:00~15:50",
                        "topic": "수학 지도",
                        "status": "paid",
                        "minutes": 50,
                    }
                ],
            }
        ],
        "trn": [],
    }


def test_stage16_print_profiles_fit_single_page_targets():
    state = _state()
    models = [
        manager_book_model(state, "sf001", "2026-10"),
        staff_appointment_model(state, "sf001"),
        appointment_confirmation_model(state, "sf001"),
        career_confirmation_model(state, "sf001"),
        resignation_model(state, "sf001", resign_reason="개인 사정", detail_reason="학업 병행"),
        learning_plan_model(state, "sf001"),
        timetable_model(state, "staff", "sf001"),
    ]
    for model in models:
        diag = render_diagnostics(model)
        if diag["singlePageTarget"]:
            assert diag["fitSinglePage"] is True, (model["key"], diag)

    assert render_diagnostics(models[0])["orientation"] == "landscape"
    assert render_diagnostics(models[-1])["orientation"] == "landscape"
    assert render_diagnostics(models[1])["orientation"] == "portrait"


def test_stage16_forms_merge_wide_content_cells(tmp_path):
    state = _state()

    appoint = staff_appointment_model(state, "sf001")
    appoint_path = create_native_hwpx(tmp_path / "appoint.hwpx", appoint)
    with zipfile.ZipFile(appoint_path, "r") as zin:
        section = zin.read("Contents/section0.xml").decode("utf-8")
    assert 'colSpan="3"' in section

    plan = learning_plan_model(state, "sf001")
    plan_path = create_native_hwpx(tmp_path / "plan.hwpx", plan)
    with zipfile.ZipFile(plan_path, "r") as zin:
        section = zin.read("Contents/section0.xml").decode("utf-8")
    assert 'colSpan="3"' in section
    assert 'colSpan="4"' in section


def test_stage16_preview_contains_visible_document_content(tmp_path):
    state = _state()
    timetable = timetable_model(state, "staff", "sf001")
    path = create_native_hwpx(tmp_path / "timetable.hwpx", timetable)
    result = validate_native_hwpx(path)
    assert result["ok"] is True
    assert result["orientation"] == "landscape"

    with zipfile.ZipFile(path, "r") as zin:
        preview = zin.read("Preview/PrvText.txt").decode("utf-8")
        section = zin.read("Contents/section0.xml").decode("utf-8")
    assert "홍OO" in preview
    assert "15:00~15:50" in preview
    assert 'landscape="WIDELY"' in section
