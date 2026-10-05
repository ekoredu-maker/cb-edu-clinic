from pathlib import Path

import database.db as db_module
import database.state_store as store_module
from domain.settlement import build_settlement
from domain.statistics import build_statistics
from domain.verification import verify_records
from tests.load_fixture import build_large_state


def _use_temp_db(tmp_path: Path):
    db_module.DATA_DIR = tmp_path
    db_module.DB_PATH = tmp_path / "large_regression.db"
    store_module.connect = db_module.connect
    db_module.init_db()


def test_operational_scale_regression(tmp_path):
    _use_temp_db(tmp_path)
    state = build_large_state()

    assert len(state["stf"]) == 50
    assert len(state["stu"]) == 1500
    assert len(state["mat"]) == 1500
    assert sum(len(m["logs"]) for m in state["mat"]) == 9000
    assert len(state["trn"]) == 24

    stats = build_statistics({"state": state})
    assert stats["counts"]["students"] == 1500
    assert stats["counts"]["staff"] == 50
    assert stats["counts"]["matchings"] == 1500
    assert stats["counts"]["actualCoachStudents"] == 1200
    assert stats["counts"]["actualClassMatchings"] == 300

    verification = verify_records({"state": state, "ym": "2026-10"})
    assert verification["ok"] is True
    assert verification["errorCount"] == 0
    assert len(verification["monthly"]) == 1500
    assert all(row["actual"] == 6 for row in verification["monthly"])

    settlement = build_settlement({"state": state, "ym": "2026-10"})
    assert settlement["executed"]["coach"] == 192_000_000
    assert settlement["executed"]["cls"] == 36_000_000
    assert settlement["executed"]["travel"] == 18_000_000
    assert settlement["executed"]["total"] == 246_000_000
    assert len(settlement["summaryByStaff"]) == 50

    imported = store_module.import_state(state, source="large-regression", replace=True)
    assert imported["recordCount"] == 3074
    assert store_module.status()["totalRecords"] == 3074

    parity = store_module.compare_state(state)
    assert parity["ok"] is True

    restored = store_module.export_state()
    assert len(restored["stf"]) == 50
    assert len(restored["stu"]) == 1500
    assert len(restored["mat"]) == 1500
    assert len(restored["trn"]) == 24
    assert restored["fixtureMeta"] == state["fixtureMeta"]


def test_large_incremental_dual_write_sequence(tmp_path):
    _use_temp_db(tmp_path)
    state = build_large_state()
    store_module.import_state(state, source="large-regression", replace=True)

    # 수정 100건
    for i in range(100):
        row = dict(state["stu"][i])
        row["memo"] = f"수정-{i}"
        state["stu"][i] = row
        store_module.upsert_record("stu", row)

    # 매칭 50건 수정
    for i in range(50):
        row = dict(state["mat"][i])
        row["dualWriteMarker"] = i
        state["mat"][i] = row
        store_module.upsert_record("mat", row)

    # 연수 4건 삭제
    deleted = [row["id"] for row in state["trn"][:4]]
    state["trn"] = state["trn"][4:]
    for record_id in deleted:
        store_module.delete_record("trn", record_id)

    cfg = dict(state["cfg"])
    cfg["confirmer"] = "대량검증 담당자"
    state["cfg"] = cfg
    store_module.save_singleton("cfg", cfg)

    parity = store_module.compare_state(state)
    assert parity["ok"] is True
    assert store_module.status()["totalRecords"] == 3070


def test_large_compare_detects_single_record_drift(tmp_path):
    _use_temp_db(tmp_path)
    state = build_large_state()
    store_module.import_state(state, source="large-regression", replace=True)

    browser = build_large_state()
    browser["stu"][777] = {**browser["stu"][777], "nm": "의도적불일치"}
    result = store_module.compare_state(browser)

    assert result["ok"] is False
    stu_check = next(x for x in result["checks"] if x["key"] == "stu")
    assert stu_check["changed"] == ["st0778"]
