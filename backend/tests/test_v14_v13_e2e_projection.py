from __future__ import annotations

from domain.realtime_projection import project_realtime_sessions
from domain.settlement import build_settlement
from domain.verification import verify_records
from services.hwpx_native_service import create_native_hwpx, validate_native_hwpx
from services.print_document_model import (
    execution_report_print_model,
    manager_book_print_model,
    pay_slip_print_model,
)


def base_state():
    return {
        "cfg": {
            "org": "제천교육지원청",
            "confirmer": "담당자",
            "rateCoach": 40000,
            "rateClass": 30000,
            "taxPct": 3.3,
            "maskMode": "partial",
        },
        "stf": [{"id": "staff-v14", "nm": "지원단A", "st": "active"}],
        "stu": [{
            "id": "student-v14",
            "nm": "학생A",
            "alias": "학생",
            "sc": "V14 테스트학교",
            "scType": "초",
            "gr": 4,
            "cls": 1,
        }],
        "mat": [{
            "id": "TEST-MAT-01",
            "stfId": "staff-v14",
            "stuId": "student-v14",
            "kind": "coach",
            "st": "active",
            "slots": [{"d": "화", "s": "20:55", "e": "21:15"}],
            "logs": [],
        }],
        "trn": [],
    }


def projection_rows():
    return [
        {
            "id": "session-auto",
            "legacy_matching_id": "TEST-MAT-01",
            "work_date": "2026-10-06",
            "planned_start_at": "2026-10-06T11:55:00+00:00",
            "planned_end_at": "2026-10-06T12:15:00+00:00",
            "start_at": "2026-10-06T11:51:00+00:00",
            "end_at": "2026-10-06T12:02:00+00:00",
            "actual_minutes": 11,
            "kind": "coach",
            "topic": "E2E 자동검증 지도",
            "content": "분수 개념 확인 및 적용 문제 풀이",
            "place": "E2E 자동검증실",
            "verification_state": "auto_verified",
            "settlement_state": "approved",
        },
        {
            "id": "session-review",
            "legacy_matching_id": "TEST-MAT-01",
            "work_date": "2026-10-06",
            "planned_start_at": "2026-10-06T12:30:00+00:00",
            "planned_end_at": "2026-10-06T12:50:00+00:00",
            "start_at": "2026-10-06T12:01:00+00:00",
            "end_at": "2026-10-06T12:02:00+00:00",
            "actual_minutes": 1,
            "kind": "coach",
            "topic": "E2E 예외검토 지도",
            "content": "핵심어 찾기와 문단 요약 활동",
            "place": "E2E 예외검토실",
            "verification_state": "confirmed",
            "settlement_state": "approved",
        },
    ]


def test_v14_to_v13_settlement_and_hwpx(tmp_path):
    projected = project_realtime_sessions(base_state(), projection_rows())

    assert projected["ok"] is True
    assert projected["projected"] == 2
    assert projected["skipped"] == 0

    logs = projected["state"]["mat"][0]["logs"]
    assert [x["status"] for x in logs] == ["verified", "verified"]
    assert [x["minutes"] for x in logs] == [11, 1]

    verified = verify_records({"state": projected["state"], "ym": "2026-10"})
    assert verified["ok"] is True
    assert verified["monthly"][0]["actual"] == 2
    assert verified["monthly"][0]["totalHours"] == round(12 / 60, 4)

    settlement = build_settlement({"state": projected["state"], "ym": "2026-10"})
    summary = settlement["summaryByStaff"]["staff-v14"]
    assert summary["coachCount"] == 2
    assert summary["gross"] == 80000
    assert summary["tax"] == 2640
    assert summary["net"] == 77360

    staff = projected["state"]["stf"][0]
    pay = pay_slip_print_model(
        settlement, staff, "staff-v14", "2026-10", "제천교육지원청", "담당자"
    )
    execution = execution_report_print_model(
        settlement, {"staff-v14": staff}, "2026-10", "제천교육지원청", "담당자"
    )
    manager = manager_book_print_model(
        projected["state"], "staff-v14", "2026-10", kind="coach"
    )

    assert len(pay["rows"]) == 2
    assert execution["summaryRow"][-1] == 80000
    assert manager["totals"]["count"] == 2

    for name, model in {
        "pay-slip": pay,
        "execution-report": execution,
        "manager-book": manager,
    }.items():
        path = create_native_hwpx(tmp_path / f"{name}.hwpx", model)
        assert validate_native_hwpx(path)["ok"] is True
        assert path.stat().st_size > 0


def test_v14_projection_is_idempotent_after_import():
    first = project_realtime_sessions(base_state(), projection_rows())
    second = project_realtime_sessions(first["state"], projection_rows())

    assert first["projected"] == 2
    assert second["projected"] == 0
    assert second["updated"] == 2
    assert len(second["state"]["mat"][0]["logs"]) == 2

    settlement = build_settlement({"state": second["state"], "ym": "2026-10"})
    assert settlement["summaryByStaff"]["staff-v14"]["coachCount"] == 2
    assert settlement["summaryByStaff"]["staff-v14"]["gross"] == 80000
