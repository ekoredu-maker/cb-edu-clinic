import xml.etree.ElementTree as ET
import zipfile

from domain.settlement import build_settlement
from services.print_document_model import execution_report_print_model, manager_book_print_model, pay_slip_print_model
from services.hwpx_native_service import MIMETYPE, create_native_hwpx, validate_native_hwpx
from tests.load_fixture import build_large_state


HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"


def _inspect(path):
    assert zipfile.is_zipfile(path)
    result = validate_native_hwpx(path)
    assert result["ok"] is True
    with zipfile.ZipFile(path, "r") as zin:
        names = zin.namelist()
        assert names[0] == "mimetype"
        assert zin.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
        assert zin.read("mimetype").decode("utf-8") == MIMETYPE
        root = ET.fromstring(zin.read("Contents/section0.xml"))
        tables = root.findall(f".//{HP}tbl")
        text = zin.read("Contents/section0.xml").decode("utf-8")
    return tables, text


def test_native_hwpx_from_html_print_contract_models(tmp_path):
    state = build_large_state(ym="2026-10")
    settlement = build_settlement({"state": state, "ym": "2026-10"})
    staff_by_id = {str(x["id"]): x for x in state["stf"]}
    staff_id = "sf001"

    pay_model = pay_slip_print_model(settlement, staff_by_id[staff_id], staff_id, "2026-10", state["cfg"]["org"])
    pay_path = create_native_hwpx(tmp_path / "pay.hwpx", pay_model)
    pay_tables, pay_text = _inspect(pay_path)
    assert len(pay_tables) == 2
    assert pay_tables[0].attrib["colCnt"] == "6"
    assert "활동비 지급 명세서 (2026-10)" in pay_text
    assert "★ 실지급액" in pay_text

    execution_model = execution_report_print_model(settlement, staff_by_id, "2026-10", state["cfg"]["org"])
    execution_path = create_native_hwpx(tmp_path / "execution.hwpx", execution_model)
    execution_tables, execution_text = _inspect(execution_path)
    assert len(execution_tables) == 1
    assert execution_tables[0].attrib["colCnt"] == "9"
    assert execution_tables[0].attrib["rowCnt"] == str(1 + len(execution_model["rows"]) + 1)
    assert "월별 활동비 집행내역서 (2026-10)" in execution_text
    assert "합계" in execution_text

    manager_model = manager_book_print_model(state, staff_id, "2026-10", kind="coach")
    manager_path = create_native_hwpx(tmp_path / "manager.hwpx", manager_model)
    manager_tables, manager_text = _inspect(manager_path)
    assert len(manager_tables) == 1
    assert manager_tables[0].attrib["colCnt"] == "12"
    assert manager_tables[0].attrib["rowCnt"] == "17"
    assert "학습지원단 관리부 — 학습코칭 (2026년 10월)" in manager_text
    assert "총 실시 회기: 96회" in manager_text


def test_manager_print_model_uses_only_verified_paid_coach_logs():
    state = build_large_state(ym="2026-10")
    model = manager_book_print_model(state, "sf001", "2026-10", kind="coach")
    assert model["totals"]["count"] == 96
    assert model["contract"]["verifiedStatuses"] == ["verified", "paid"]
    assert dict(model["meta"])["구분"] == "학습코칭"
    assert model["columns"][5] == model["columns"][11] == "학생"
