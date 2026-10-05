from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APP_JS = ROOT / "assets" / "js" / "app.js"
DOC_EXPORT_JS = ROOT / "assets" / "js" / "hybrid" / "document-export.js"


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_embedded_html_forms_remain_document_source_of_truth():
    src = _source(APP_JS)

    # 활동비 지급명세서: HTML 인쇄 서식 + Excel 상세 열 정의
    assert "function buildPaySlipHtml(stfId, ym)" in src
    assert "활동비 지급 명세서 (${ym})" in src
    assert "<th>날짜</th><th>학생/제목</th><th>학교</th><th>시간</th><th>내용</th><th>금액</th>" in src
    assert "['날짜','구분','학생/제목','학교','시간/회차','내용','단가','지급액']" in src
    assert "공제액 (원천징수 ${r.taxPct}%)" in src
    assert "★ 실지급액" in src

    # 월별 집행내역서
    assert "function buildExecReportHtml(ym)" in src
    assert "월별 활동비 집행내역서 (${ym})" in src
    assert "학습코칭</th><th>금액" in src
    assert "수업협력</th><th>금액" in src
    assert "출장비</th><th>금액" in src
    assert "총액(세전)" in src
    assert "K-에듀파인 지출결의 첨부용" in src

    # 관리부는 HTML에서 학습코칭/수업협력을 반드시 분리한다.
    assert "window.collectStfLogs = function(stfId, ym, kindFilter)" in src
    assert "if(kindFilter && kind !== kindFilter) return;" in src
    assert "window.buildMgrBookHtml = function(stfId, ym, kindFilter)" in src
    assert "kindFilter==='class' ? '수업협력' : '학습코칭'" in src
    assert "kindFilter==='class'?'학급':'학생'" in src
    assert "총 실시 회기" in src
    assert "총 시수" in src

    # 개별 행정서식도 HTML 자체가 구조정보를 가진다.
    for marker in [
        "if(type==='staff-appoint')",
        "else if(type==='appoint-confirm')",
        "else if(type==='career-confirm')",
        "else if(type==='resign')",
        "else if(type==='plan-doc')",
    ]:
        assert marker in src


def test_python_manager_export_keeps_html_kind_selection():
    src = _source(DOC_EXPORT_JS)
    assert "function currentManagerKind()" in src
    assert "function managerStateForKind(kind)" in src
    assert "__v13ManagerKind: kind" in src
    assert "(log.kind || matchingKind || 'coach') === kind" in src
    assert "state: managerStateForKind(kind), staffId, ym, kind" in src
