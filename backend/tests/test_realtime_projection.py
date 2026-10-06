from __future__ import annotations

from domain.realtime_projection import project_realtime_sessions, to_legacy_log
from domain.settlement import build_settlement
from domain.verification import build_monthly_verification


def _state():
    return {
        "cfg": {"rateCoach": 40000, "taxPct": 3.3},
        "stf": [{"id": "stf-1", "nm": "지원단A"}],
        "stu": [{"id": "stu-1", "nm": "학생A", "sc": "테스트초"}],
        "mat": [{
            "id": "mat-1",
            "stfId": "stf-1",
            "stuId": "stu-1",
            "kind": "coach",
            "st": "active",
            "slots": [{"d": "화", "s": "14:00", "e": "14:50"}],
            "logs": [],
        }],
        "trn": [],
    }


def test_projection_builds_legacy_compatible_log():
    row = {
        "id": "sess-1",
        "legacy_matching_id": "mat-1",
        "work_date": "2026-10-06",
        "planned_start_at": "2026-10-06T05:00:00+00:00",
        "planned_end_at": "2026-10-06T05:50:00+00:00",
        "start_at": "2026-10-06T05:02:00+00:00",
        "end_at": "2026-10-06T05:52:00+00:00",
        "kind": "coach",
        "topic": "분수",
        "content": "통분 지도",
        "place": "테스트초",
        "verification_state": "auto_verified",
        "settlement_state": "pending",
    }
    log = to_legacy_log(row)
    assert log["date"] == "2026-10-06"
    assert log["d"] == "2026-10-06"
    assert log["s"] == "14:02"
    assert log["e"] == "14:52"
    assert log["plannedDate"] == "2026-10-06"
    assert log["plannedStart"] == "14:00"
    assert log["plannedEnd"] == "14:50"
    assert log["plannedTime"] == "14:00~14:50"
    assert log["minutes"] == 50
    assert log["status"] == "conducted"


def test_approved_and_paid_states_map_for_settlement():
    approved = to_legacy_log({
        "id": "a",
        "work_date": "2026-10-06",
        "settlement_state": "approved",
    })
    paid = to_legacy_log({
        "id": "b",
        "work_date": "2026-10-06",
        "settlement_state": "paid",
    })
    assert approved["status"] == "verified"
    assert paid["status"] == "paid"


def test_projection_is_idempotent_and_settlement_safe():
    state = _state()
    session = {
        "id": "sess-1",
        "legacy_matching_id": "mat-1",
        "work_date": "2026-10-06",
        "start_at": "2026-10-06T14:00:00+09:00",
        "end_at": "2026-10-06T14:50:00+09:00",
        "kind": "coach",
        "topic": "수학",
        "verification_state": "auto_verified",
        "settlement_state": "approved",
    }

    first = project_realtime_sessions(state, [session])
    assert first["projected"] == 1
    assert first["updated"] == 0
    assert len(first["state"]["mat"][0]["logs"]) == 1

    second = project_realtime_sessions(first["state"], [session])
    assert second["projected"] == 0
    assert second["updated"] == 1
    assert len(second["state"]["mat"][0]["logs"]) == 1

    settlement = build_settlement({"state": second["state"], "ym": "2026-10"})
    assert settlement["summaryByStaff"]["stf-1"]["coachCount"] == 1
    assert settlement["summaryByStaff"]["stf-1"]["coachAmount"] == 40000


def test_verification_accepts_date_and_explicit_minutes():
    state = _state()
    state["mat"][0]["logs"] = [{
        "id": "sess-1",
        "date": "2026-10-06",
        "minutes": 50,
        "status": "verified",
    }]
    rows = build_monthly_verification(state, "2026-10")
    assert rows[0]["actual"] == 1
    assert rows[0]["totalHours"] == round(50 / 60, 4)


def test_unmatched_session_is_skipped_without_mutating_matchings():
    state = _state()
    result = project_realtime_sessions(state, [{
        "id": "sess-x",
        "legacy_matching_id": "missing",
        "work_date": "2026-10-06",
    }])
    assert result["skipped"] == 1
    assert result["projected"] == 0
    assert result["state"]["mat"][0]["logs"] == []
