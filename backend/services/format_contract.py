from __future__ import annotations

from copy import deepcopy
from typing import Any


# HTML V12/V13 화면에 이미 구현되어 있는 서식 구조를 Python 출력엔진의
# 기준 계약으로 명시한다. 계산 규칙은 이 파일에서 재계산하지 않는다.
FORMAT_CONTRACTS: dict[str, dict[str, Any]] = {
    "pay_slip": {
        "label": "활동비 지급 명세서",
        "source": {
            "file": "legacy-js/10-ext-v99.js",
            "function": "buildPaySlipHtml / exportPaySlipXlsx",
        },
        "title": "활동비 지급 명세서 ({ym})",
        "sheet": "지급명세서",
        "meta": ["수령인", "소속", "발행일"],
        "columns": ["날짜", "구분", "학생/제목", "학교", "시간/회차", "내용", "단가", "지급액"],
        "columnWidths": [12, 10, 16, 16, 14, 22, 12, 12],
        "summary": ["학습코칭 소계", "수업협력 소계", "출장비 소계", "세전 지급액", "공제액", "실지급액"],
        "htmlClass": "pay-doc",
    },
    "execution_report": {
        "label": "월별 활동비 집행내역서",
        "source": {
            "file": "legacy-js/10-ext-v99.js",
            "function": "buildExecReportHtml / exportExecReportXlsx",
        },
        "title": "월별 활동비 집행내역서 ({ym})",
        "sheet": "집행내역서",
        "meta": ["기관", "대상", "발행일"],
        "columns": [
            "No", "지원단", "코칭(회)", "코칭금액", "협력(회)", "협력금액",
            "출장(회)", "출장금액", "합계(세전)", "비고",
        ],
        "columnWidths": [5, 12, 10, 14, 10, 14, 10, 14, 14, 16],
        "summary": ["합계"],
        "htmlClass": "pay-doc",
    },
    "manager_book": {
        "label": "학습지원단 관리부",
        "source": {
            "file": "legacy-js/08-forms.js",
            "function": "buildMgrBookHtml / exportMgrBookXlsx",
        },
        "title": "학습지원단 관리부 ({year}년 {month}월)",
        "sheet": "관리부",
        "meta": ["소속", "성명", "연락처", "담당학생"],
        "layout": {
            "type": "two-half-month-columns",
            "leftDays": [1, 16],
            "rightDays": [17, 31],
            "rows": 16,
            "separatorColumn": 7,
        },
        "columns": [
            "일", "요일", "학교", "시간", "지도내용", "학생", "",
            "일", "요일", "학교", "시간", "지도내용", "학생",
        ],
        "columnWidths": [4, 5, 12, 12, 24, 10, 2, 4, 5, 12, 12, 24, 10],
        "summary": ["총 실시 회기", "총 시수", "확인자"],
        "htmlClass": "mgr-book",
        "verifiedStatuses": ["verified", "paid"],
    },
}


def get_format_contract(key: str) -> dict[str, Any]:
    if key not in FORMAT_CONTRACTS:
        raise KeyError(key)
    return deepcopy(FORMAT_CONTRACTS[key])


def list_format_contracts() -> dict[str, dict[str, Any]]:
    return deepcopy(FORMAT_CONTRACTS)
