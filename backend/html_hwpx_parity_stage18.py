from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path
from typing import Any

from domain.settlement import build_settlement
from services.document_model import (
    appointment_confirmation_model,
    career_confirmation_model,
    learning_plan_model,
    resignation_model,
    staff_appointment_model,
    timetable_model,
)
from services.format_contract import get_format_contract
from services.hwpx_native_service import create_native_hwpx, render_diagnostics, validate_native_hwpx
from services.print_contract import get_print_contract
from services.print_document_model import (
    execution_report_print_model,
    manager_book_print_model,
    pay_slip_print_model,
)


EXPECTED_KEYS = [
    "pay_slip", "execution_report", "manager_book", "staff_appoint", "appoint_confirm",
    "career_confirm", "resign", "plan_doc", "timetable",
]

SOURCE_MARKERS = {
    "pay_slip": ["buildPaySlipHtml", "활동비 지급 명세서", "학생/제목", "실지급액"],
    "execution_report": ["buildExecReportHtml", "월별 활동비 집행내역서", "총액(세전)"],
    "manager_book": ["buildMgrBookHtml", "학습지원단 관리부", "학습코칭", "수업협력", "총 실시 회기"],
    "staff_appoint": ["staff-appoint", "위 촉 장", "위촉 분야"],
    "appoint_confirm": ["appoint-confirm", "위촉 확인서", "확인자"],
    "career_confirm": ["career-confirm", "경력 확인서", "위촉 이력"],
    "resign": ["type==='resign'", "해촉 신청서", "해촉 사유"],
    "plan_doc": ["plan-doc", "학습지도 계획서", "학습목표", "평가방법"],
    "timetable": ["buildTTGrid", "시간표", "월", "화", "수", "목", "금"],
}


def _normalize(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def _state() -> dict[str, Any]:
    return {
        "cfg": {
            "org": "제천교육지원청", "admin": "담당 장학사", "confirmer": "담당 장학사",
            "maskMode": "partial", "rateCoach": 40000, "rateClass": 30000,
            "rateTravelLong": 20000, "rateTravelShort": 10000, "taxPct": 3.3,
            "budget": {"total": 1000000, "coach": 600000, "cls": 300000, "travel": 100000},
        },
        "stf": [{
            "id": "sf001", "nm": "김지원", "bd": "1985-04-03", "ph": "010-0000-0000",
            "st": "active", "appointArea": "학습코칭", "appointStart": "2026-03-01",
            "appointEnd": "2027-02-28", "careerHistory": [{"start": "2025-03-01", "end": "2026-02-28", "area": "학습코칭"}],
        }],
        "stu": [{"id": "st001", "nm": "홍길동", "alias": "별하", "sc": "의림초", "gr": 4, "cls": 2}],
        "mat": [
            {
                "id": "m1", "stfId": "sf001", "stuId": "st001", "kind": "coach", "st": "active",
                "slots": [{"d": "월", "s": "15:00", "e": "15:50"}],
                "logs": [{"date": "2026-10-05", "time": "15:00~15:50", "topic": "수학 지도", "status": "paid", "kind": "coach", "minutes": 50}],
            },
            {
                "id": "m2", "stfId": "sf001", "kind": "class", "st": "active",
                "classInfo": {"sc": "의림초", "scType": "초", "gr": 3, "cls": 1},
                "slots": [{"d": "화", "s": "09:00", "e": "09:40"}],
                "logs": [{"date": "2026-10-06", "time": "09:00~09:40", "topic": "수업협력", "status": "verified", "kind": "class", "minutes": 40}],
            },
        ],
        "trn": [],
    }


def _models(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    settlement = build_settlement({"state": state, "ym": "2026-10"})
    staff = state["stf"][0]
    staff_map = {staff["id"]: staff}
    return {
        "pay_slip": pay_slip_print_model(settlement, staff, "sf001", "2026-10", state["cfg"]["org"], state["cfg"]["confirmer"]),
        "execution_report": execution_report_print_model(settlement, staff_map, "2026-10", state["cfg"]["org"], state["cfg"]["confirmer"]),
        "manager_book": manager_book_print_model(state, "sf001", "2026-10", kind="coach"),
        "staff_appoint": staff_appointment_model(state, "sf001"),
        "appoint_confirm": appointment_confirmation_model(state, "sf001"),
        "career_confirm": career_confirmation_model(state, "sf001"),
        "resign": resignation_model(state, "sf001", resign_date="2026. 12. 31.", resign_reason="개인 사정"),
        "plan_doc": learning_plan_model(state, "sf001"),
        "timetable": timetable_model(state, "staff", "sf001"),
    }


def _table_col_counts(section_xml: str) -> list[int]:
    return [int(x) for x in re.findall(r'<hp:tbl\b[^>]*\bcolCnt="(\d+)"', section_xml)]


def _expected_table_columns(model: dict[str, Any]) -> list[int]:
    if model.get("tables"):
        return [len((table or {}).get("columns") or []) for table in model["tables"]]
    return [len(model.get("columns") or [])]


def run_parity(output_dir: str | Path) -> dict[str, Any]:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    repo_root = Path(__file__).resolve().parents[1]
    app_source = (repo_root / "assets" / "js" / "app.js").read_text(encoding="utf-8")
    state = _state()
    models = _models(state)

    report: dict[str, Any] = {"stage": 18, "ok": True, "documents": {}, "errors": [], "warnings": []}

    for key in EXPECTED_KEYS:
        model = models[key]
        checks: list[dict[str, Any]] = []
        errors: list[str] = []

        for marker in SOURCE_MARKERS[key]:
            ok = _normalize(marker) in _normalize(app_source)
            checks.append({"layer": "html", "check": f"source marker: {marker}", "ok": ok})
            if not ok:
                errors.append(f"HTML/JS 원본에서 '{marker}'를 찾지 못했습니다.")

        if key in {"pay_slip", "execution_report", "manager_book"}:
            print_contract = get_print_contract(key, kind=str(model.get("kind") or "coach"))
            expected_columns = list(print_contract["columns"])
            contract_type = "print"
        else:
            expected_columns = list(get_format_contract(key).get("columns") or [])
            contract_type = "shared"

        actual_columns = list(model.get("columns") or [])
        columns_ok = actual_columns == expected_columns
        checks.append({"layer": "model", "check": "column order", "ok": columns_ok, "expected": expected_columns, "actual": actual_columns})
        if not columns_ok:
            errors.append("문서모델 열 구조가 해당 인쇄 계약과 다릅니다.")

        diag = render_diagnostics(model)
        path = create_native_hwpx(output / f"{key}.hwpx", model)
        validation = validate_native_hwpx(path)
        checks.append({"layer": "hwpx", "check": "package validation", "ok": bool(validation.get("ok"))})
        if not validation.get("ok"):
            errors.append("HWPX 패키지 검증에 실패했습니다.")

        with zipfile.ZipFile(path, "r") as zin:
            section = zin.read("Contents/section0.xml").decode("utf-8")
            preview = zin.read("Preview/PrvText.txt").decode("utf-8")
        actual_col_counts = _table_col_counts(section)
        expected_col_counts = _expected_table_columns(model)
        table_ok = actual_col_counts[:len(expected_col_counts)] == expected_col_counts
        checks.append({"layer": "hwpx", "check": "table column counts", "ok": table_ok, "expected": expected_col_counts, "actual": actual_col_counts})
        if not table_ok:
            errors.append("HWPX 표 열 수가 문서모델과 다릅니다.")

        title_ok = _normalize(model.get("title")) in _normalize(preview)
        checks.append({"layer": "hwpx", "check": "title visible", "ok": title_ok})
        if not title_ok:
            errors.append("HWPX 미리보기에서 제목을 찾지 못했습니다.")

        if key == "manager_book":
            meta = dict(model.get("meta") or [])
            kind_ok = meta.get("구분") == "학습코칭" and model["columns"][5] == "학생" and len(model["columns"]) == 12
            checks.append({"layer": "model", "check": "coach kind split", "ok": kind_ok})
            if not kind_ok:
                errors.append("관리부 학습코칭 구분/학생 열 구조가 HTML과 다릅니다.")
            class_model = manager_book_print_model(state, "sf001", "2026-10", kind="class")
            class_ok = dict(class_model["meta"])["구분"] == "수업협력" and class_model["columns"][5] == "학급" and len(class_model["columns"]) == 12
            checks.append({"layer": "model", "check": "class kind split", "ok": class_ok})
            if not class_ok:
                errors.append("관리부 수업협력 구분/학급 열 구조가 HTML과 다릅니다.")

        report["documents"][key] = {
            "ok": not errors,
            "contractType": contract_type,
            "checks": checks,
            "errors": errors,
            "diagnostics": diag,
            "hwpx": path.name,
        }
        if errors:
            report["errors"].append({"document": key, "errors": errors})

    report["ok"] = not report["errors"]
    json_path = output / "stage18_html_hwpx_parity.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    lines = [
        "# V13 Stage 18 HTML ↔ HWPX 인쇄계약 일치 보고서", "",
        f"- 전체 결과: {'PASS' if report['ok'] else 'FAIL'}",
        f"- 대상 서식: {len(EXPECTED_KEYS)}종",
        f"- 오류: {len(report['errors'])}건",
        f"- 경고: {len(report['warnings'])}건", "",
        "| 서식 | 계약 | 결과 | 방향 | HWPX 표 열 수 |",
        "|---|---|---|---|---|",
    ]
    for key in EXPECTED_KEYS:
        item = report["documents"][key]
        cols = next((x for x in item["checks"] if x["check"] == "table column counts"), {})
        lines.append(f"| {key} | {item['contractType']} | {'PASS' if item['ok'] else 'FAIL'} | {item['diagnostics']['orientation']} | {cols.get('actual', [])} |")
    (output / "stage18_html_hwpx_parity.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="../.build/stage18-parity")
    args = parser.parse_args()
    report = run_parity(args.output_dir)
    print(json.dumps({"ok": report["ok"], "errors": len(report["errors"]), "warnings": len(report["warnings"])}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
