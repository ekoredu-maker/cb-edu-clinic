from __future__ import annotations

from copy import deepcopy
from typing import Any


PRINT_CONTRACTS: dict[str, dict[str, Any]] = {
    "pay_slip": {
        "sourceFunction": "buildPaySlipHtml",
        "columns": ["날짜", "학생/제목", "학교", "시간", "내용", "금액"],
        "columnWidths": [12, 18, 16, 14, 28, 12],
    },
    "execution_report": {
        "sourceFunction": "buildExecReportHtml",
        "columns": ["No", "지원단", "학습코칭", "금액", "수업협력", "금액", "출장비", "금액", "총액(세전)"],
        "columnWidths": [5, 14, 10, 14, 10, 14, 10, 14, 14],
    },
    "manager_book": {
        "sourceFunction": "buildMgrBookHtml",
        "coachColumns": ["일", "요", "학교", "시간", "지도내용", "학생", "일", "요", "학교", "시간", "지도내용", "학생"],
        "classColumns": ["일", "요", "학교", "시간", "지도내용", "학급", "일", "요", "학교", "시간", "지도내용", "학급"],
        "columnWidths": [4, 5, 12, 12, 24, 10, 4, 5, 12, 12, 24, 10],
    },
}


def get_print_contract(key: str, *, kind: str = "coach") -> dict[str, Any]:
    if key not in PRINT_CONTRACTS:
        raise KeyError(f"등록되지 않은 인쇄 계약입니다: {key}")
    contract = deepcopy(PRINT_CONTRACTS[key])
    if key == "manager_book":
        contract["columns"] = list(contract["classColumns"] if kind == "class" else contract["coachColumns"])
    return contract


def list_print_contracts() -> list[str]:
    return sorted(PRINT_CONTRACTS)
