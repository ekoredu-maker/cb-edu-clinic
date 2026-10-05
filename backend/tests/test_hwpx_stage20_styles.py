from __future__ import annotations

import zipfile

from domain.settlement import build_settlement
from services.hwpx_native_service import create_native_hwpx, validate_native_hwpx
from services.print_document_model import (
    execution_report_print_model,
    manager_book_print_model,
    pay_slip_print_model,
)
from services.print_contract import get_print_contract
from tests.load_fixture import build_large_state


def _xml(path):
    assert validate_native_hwpx(path)["ok"] is True
    with zipfile.ZipFile(path, "r") as zin:
        return (
            zin.read("Contents/header.xml").decode("utf-8"),
            zin.read("Contents/section0.xml").decode("utf-8"),
        )


def test_stage20_print_contract_keeps_business_columns_and_adds_visual_profile():
    pay = get_print_contract("pay_slip")
    execution = get_print_contract("execution_report")
    manager = get_print_contract("manager_book", kind="class")

    assert pay["columns"] == ["날짜", "학생/제목", "학교", "시간", "내용", "금액"]
    assert execution["columns"] == ["No", "지원단", "학습코칭", "금액", "수업협력", "금액", "출장비", "금액", "총액(세전)"]
    assert manager["columns"][5] == "학급"
    assert manager["columns"][11] == "학급"

    assert pay["print"]["rightColumns"] == [5]
    assert execution["print"]["rightColumns"] == [3, 5, 7, 8]
    assert manager["print"]["centerColumns"] == [0, 1, 3, 5, 6, 7, 9, 11]


def test_stage20_pay_slip_has_hancom_safe_polished_header_and_summary(tmp_path):
    state = build_large_state(ym="2026-10")
    settlement = build_settlement({"state": state, "ym": "2026-10"})
    staff = state["stf"][0]
    model = pay_slip_print_model(settlement, staff, staff["id"], "2026-10", state["cfg"]["org"])
    path = create_native_hwpx(tmp_path / "pay_stage20.hwpx", model)
    header, section = _xml(path)

    assert 'face="함초롬바탕"' in header
    assert 'face="함초롬돋움"' in header
    assert 'faceColor="#E8F0F7"' in header
    assert 'faceColor="#FFF4CC"' in header
    assert '<hh:borderFills itemCnt="6">' in header
    assert 'borderFillIDRef="3"' in section  # 표 머리글
    assert 'borderFillIDRef="6"' in section  # 실지급액 강조
    assert 'paraPrIDRef="3"' in section      # 금액 우측정렬


def test_stage20_execution_report_highlights_total_row(tmp_path):
    state = build_large_state(ym="2026-10")
    settlement = build_settlement({"state": state, "ym": "2026-10"})
    staff_by_id = {str(x["id"]): x for x in state["stf"]}
    model = execution_report_print_model(settlement, staff_by_id, "2026-10", state["cfg"]["org"])
    path = create_native_hwpx(tmp_path / "execution_stage20.hwpx", model)
    header, section = _xml(path)

    assert 'faceColor="#E7F1EA"' in header
    assert 'borderFillIDRef="3"' in section
    assert 'borderFillIDRef="6"' in section
    assert "총액(세전)" in section


def test_stage20_manager_book_preserves_class_kind_with_polished_grid(tmp_path):
    state = build_large_state(ym="2026-10")
    model = manager_book_print_model(state, "sf001", "2026-10", kind="class")
    assert model["kind"] == "class"
    assert model["columns"][5] == "학급"
    assert dict(model["meta"])["구분"] == "수업협력"

    path = create_native_hwpx(tmp_path / "manager_stage20.hwpx", model)
    header, section = _xml(path)
    assert 'faceColor="#E8F0F7"' in header
    assert 'borderFillIDRef="3"' in section
    assert "수업협력" in section
    assert "학급" in section
