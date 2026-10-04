from pathlib import Path

import database.db as db_module
import database.state_store as store_module
from domain.statistics import build_statistics
from domain.verification import verify_records
from domain.settlement import build_settlement
from tests.operational_fixture import build_operational_state


def _use_temp_db(tmp_path: Path):
    db_module.DATA_DIR = tmp_path
    db_module.DB_PATH = tmp_path / "operational_scale.db"
    store_module.connect = db_module.connect
    db_module.init_db()


def test_operational_scale_regression(tmp_path):
    _use_temp_db(tmp_path)
    state = build_operational_state()

    assert len(state["stf"]) == 50
    assert len(state["stu"]) == 1500
    assert len(state["mat"]) == 1500
    assert sum(len(m.get("logs") or []) for m in state["mat"]) == 9000
    assert len(state["trn"]) == 24

    stats = build_statistics({"state": state})
    assert stats["counts"]["students"] == 1500
    assert stats["counts"]["staff"] == 50
    assert stats["counts"]["matchings"] == 1500
    assert stats["counts"]["actualCoachStudents"] == 1200
    assert stats["counts"]["actualClassMatchings"] == 300

    verify = verify_records({"state": state, "ym": "2026-10"})
    assert verify["errorCount"] == 0
    assert len(verify["monthly"]) == 1500

    settlement = build_settlement({"state": state, "ym": "2026-10"})
    assert settlement["executed"]["coach"] == 192_000_000
    assert settlement["executed"]["cls"] == 36_000_000
    assert settlement["executed"]["travel"] == 18_000_000
    assert settlement["executed"]["total"] == 246_000_000

    imported = store_module.import_state(state, source="operational-test", replace=True)
    assert imported["recordCount"] == 3074
    assert store_module.status()["totalRecords"] == 3074
    assert store_module.compare_state(state)["ok"] is True

    exported = store_module.export_state()
    assert [x["id"] for x in exported["stf"]] == [x["id"] for x in state["stf"]]
    assert [x["id"] for x in exported["stu"]] == [x["id"] for x in state["stu"]]
    assert [x["id"] for x in exported["mat"]] == [x["id"] for x in state["mat"]]
    assert [x["id"] for x in exported["trn"]] == [x["id"] for x in state["trn"]]

    for i in range(100):
        state["stu"][i]["memo"] = f"수정-{i}"
        store_module.upsert_record("stu", state["stu"][i], source="operational-test")
    for i in range(50):
        state["mat"][i]["memo"] = f"매칭수정-{i}"
        store_module.upsert_record("mat", state["mat"][i], source="operational-test")
    for row in list(state["trn"][-4:]):
        store_module.delete_record("trn", row["id"], source="operational-test")
    state["trn"] = state["trn"][:-4]
    state["cfg"]["confirmer"] = "변경확인자"
    store_module.save_singleton("cfg", state["cfg"], source="operational-test")

    assert store_module.compare_state(state)["ok"] is True

    drift = store_module.export_state()
    drift["stu"][777]["nm"] = "의도적변경"
    diff = store_module.compare_state(drift)
    assert diff["ok"] is False
    stu_check = next(x for x in diff["checks"] if x["key"] == "stu")
    assert stu_check["changed"] == [drift["stu"][777]["id"]]
