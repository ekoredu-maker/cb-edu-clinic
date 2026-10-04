from pathlib import Path

import database.db as db_module
import database.state_store as store_module


def _use_temp_db(tmp_path: Path):
    db_module.DATA_DIR = tmp_path
    db_module.DB_PATH = tmp_path / "test_clinic.db"
    store_module.connect = db_module.connect
    db_module.init_db()


def sample_state():
    return {
        "cfg": {"org": "제천교육지원청", "regions": ["제천", "단양"]},
        "stf": [{"id": "sf1", "nm": "지원단1", "st": "active"}],
        "stu": [{"id": "st1", "nm": "학생1", "sc": "가상초", "region": "제천"}],
        "mat": [{"id": "m1", "stfId": "sf1", "stuId": "st1", "logs": []}],
        "trn": [{"id": "t1", "nm": "연수", "verified": True}],
        "customFlag": {"kept": True},
    }


def test_import_export_round_trip(tmp_path):
    _use_temp_db(tmp_path)
    state = sample_state()
    result = store_module.import_state(state, source="test", replace=True)
    assert result["recordCount"] == 4
    exported = store_module.export_state()
    assert exported["cfg"] == state["cfg"]
    assert exported["stf"] == state["stf"]
    assert exported["stu"] == state["stu"]
    assert exported["mat"] == state["mat"]
    assert exported["trn"] == state["trn"]
    assert exported["customFlag"] == state["customFlag"]
    status = store_module.status()
    assert status["totalRecords"] == 4


def test_duplicate_id_is_rejected_before_write(tmp_path):
    _use_temp_db(tmp_path)
    bad = sample_state()
    bad["stu"].append({"id": "st1", "nm": "중복"})
    try:
        store_module.import_state(bad, source="test", replace=True)
        assert False, "중복 ID는 거부되어야 함"
    except store_module.StateMigrationError:
        pass
    assert store_module.status()["totalRecords"] == 0


def test_replace_is_atomic(tmp_path):
    _use_temp_db(tmp_path)
    original = sample_state()
    store_module.import_state(original, source="test", replace=True)
    bad = sample_state()
    bad["mat"] = [{"id": ""}]
    try:
        store_module.import_state(bad, source="bad", replace=True)
    except store_module.StateMigrationError:
        pass
    exported = store_module.export_state()
    assert exported["stf"] == original["stf"]
    assert exported["stu"] == original["stu"]


def test_incremental_upsert_delete_and_compare(tmp_path):
    _use_temp_db(tmp_path)
    state = sample_state()
    store_module.import_state(state, source="test", replace=True)

    updated_student = {"id": "st1", "nm": "학생1수정", "sc": "가상초", "region": "제천", "memo": "보존"}
    store_module.upsert_record("stu", updated_student)
    state["stu"] = [updated_student]
    assert store_module.compare_state(state)["ok"] is True

    store_module.delete_record("trn", "t1")
    state["trn"] = []
    assert store_module.compare_state(state)["ok"] is True

    store_module.save_singleton("cfg", {"org": "제천교육지원청", "regions": ["제천"]})
    state["cfg"] = {"org": "제천교육지원청", "regions": ["제천"]}
    assert store_module.compare_state(state)["ok"] is True


def test_compare_reports_changed_records(tmp_path):
    _use_temp_db(tmp_path)
    state = sample_state()
    store_module.import_state(state, source="test", replace=True)
    browser = sample_state()
    browser["stu"][0]["nm"] = "브라우저에서변경"
    result = store_module.compare_state(browser)
    assert result["ok"] is False
    stu_check = next(x for x in result["checks"] if x["key"] == "stu")
    assert stu_check["changed"] == ["st1"]
