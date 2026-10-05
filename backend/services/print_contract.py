from __future__ import annotations

from copy import deepcopy
from typing import Any


# Stage20: HTML의 인쇄 구조는 그대로 유지하고, HWPX에만 적용할 시각 프로필을
# 함께 정의한다. 계산 규칙/열 구조와 스타일 규칙을 분리하여 회귀오류를 막는다.
PRINT_CONTRACTS: dict[str, dict[str, Any]] = {
    "pay_slip": {
        "sourceFunction": "buildPaySlipHtml",
        "columns": ["날짜", "학생/제목", "학교", "시간", "내용", "금액"],
        "columnWidths": [12, 18, 16, 14, 28, 12],
        "print": {
            "titlePt": 18,
            "bodyPt": 8.8,
            "headerPt": 8.8,
            "defaultRowMm": 7.2,
            "titleGapMm": 4.0,
            "tableGapMm": 3.0,
            "cellMarginMm": {"left": 1.2, "right": 1.2, "top": 0.7, "bottom": 0.7},
            "headerFill": "#E8F0F7",
            "labelFill": "#F4F6F8",
            "zebraFill": "#FAFBFC",
            "accentFill": "#FFF4CC",
            "borderColor": "#7D8892",
            "centerColumns": [0, 2, 3],
            "rightColumns": [5],
            "summaryRightColumn": 1,
            "summaryWidthRatio": 0.64,
            "highlightSummaryLast": True,
        },
    },
    "execution_report": {
        "sourceFunction": "buildExecReportHtml",
        "columns": ["No", "지원단", "학습코칭", "금액", "수업협력", "금액", "출장비", "금액", "총액(세전)"],
        "columnWidths": [5, 14, 10, 14, 10, 14, 10, 14, 14],
        "print": {
            "titlePt": 17,
            "bodyPt": 8.2,
            "headerPt": 8.2,
            "defaultRowMm": 6.7,
            "titleGapMm": 3.0,
            "tableGapMm": 2.5,
            "cellMarginMm": {"left": 0.9, "right": 0.9, "top": 0.5, "bottom": 0.5},
            "headerFill": "#E8F0F7",
            "labelFill": "#F4F6F8",
            "zebraFill": "#FAFBFC",
            "accentFill": "#E7F1EA",
            "borderColor": "#7D8892",
            "centerColumns": [0, 2, 4, 6],
            "rightColumns": [3, 5, 7, 8],
            "highlightLastRow": True,
        },
    },
    "manager_book": {
        "sourceFunction": "buildMgrBookHtml",
        "coachColumns": ["일", "요", "학교", "시간", "지도내용", "학생", "일", "요", "학교", "시간", "지도내용", "학생"],
        "classColumns": ["일", "요", "학교", "시간", "지도내용", "학급", "일", "요", "학교", "시간", "지도내용", "학급"],
        "columnWidths": [4, 5, 12, 12, 24, 10, 4, 5, 12, 12, 24, 10],
        "print": {
            "titlePt": 16,
            "bodyPt": 7.6,
            "headerPt": 7.6,
            "defaultRowMm": 6.2,
            "titleGapMm": 2.5,
            "tableGapMm": 1.8,
            "cellMarginMm": {"left": 0.7, "right": 0.7, "top": 0.4, "bottom": 0.4},
            "headerFill": "#E8F0F7",
            "labelFill": "#F4F6F8",
            "zebraFill": "#FCFCFD",
            "accentFill": "#E7F1EA",
            "borderColor": "#7D8892",
            "centerColumns": [0, 1, 3, 5, 6, 7, 9, 11],
            "rightColumns": [],
            "footerAccent": True,
        },
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
