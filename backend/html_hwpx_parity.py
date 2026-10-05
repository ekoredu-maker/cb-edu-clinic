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
    execution_report_model,
    learning_plan_model,
    manager_book_model,
    pay_slip_model,
    resignation_model,
    staff_appointment_model,
    timetable_model,
)
from services.format_contract import get_format_contract, list_format_contracts
from services.hwpx_native_service import create_native_hwpx, render_diagnostics, validate_native_hwpx


EXPECTED_KEYS = [
    "pay_slip",
    "execution_report",
    "manager_book",
    "staff_appoint",
    "appoint_confirm",
    "career_confirm",
    "resign",
    "plan_doc",
    "timetable",
]

SOURCE_MARKERS: dict[str, list[str]] = {
    "pay_slip": ["buildPaySlipHtml", "활동비 지급 명세서", "학생/제목", "실지급액"],
    "execution_report": ["buildExecReportHtml", "월별 활동비 집행내역서", "총액(세전)", "집행내역서"],
    "manager_book": ["buildMgrBookHtml", "학습지원단 관리부", "학습코칭", "수업협력", "총 실시 회기"],
    "staff_appoint": ["staff-appoint", "위 촉 장", "위촉 분야", "위촉 기간"],
    "appoint_confirm": ["appoint-confirm", "위촉 확인서", "확인자"],
    "career_confirm": ["career-confirm", "경력 확인서", "위촉 이력"],
    "resign": ["type==='resign'", "해촉 신청서", "해촉 사유"],
    "plan_doc": ["plan-doc", "학습지도 계획서", "학습목표", "평가방법"],
    "timetable": ["buildTTGrid", "시간표", "월", "화", "수", "목", "금"],
}

VISIBLE_MARKERS: dict[str, list[str]] = {
    "pay_slip": ["활동비 지급 명세서", "실지급액"],
    "execution_report": ["월별 활동비 집행내역서", "합계"],
    "manager_book": ["학습지원단 관리부", "총 실시 회기", "확인자"],
    "staff_appoint": ["위 촉 장", "위촉 분야"],
    "appoint_confirm": ["위촉 확인서", "확인자"],
    "career_confirm": ["경력 확인서", "위촉 기간"],
    "resign": ["해촉 신청서", "해촉 사유"],
    "plan_doc": ["학습지도계획서", "학습목표", "평가방법"],
    "timetable": ["시간표", "홍OO"],
}


def _state() -> dict[str, Any]:
    return {
        "cfg": {
            "org": "제천교육지원청",
            "admin": "홍길동 장학사",
            "confirmer": "담당 장학사",
            "maskMode": "partial",
            "rates": {"coach": 40000, "cls": 30000, "travelLong": 20000, "travelShort": 10000, "taxPct": 3.3},
            "budget": 1000000,
        },
        "stf": [
            {
                "id": "sf001",
                "nm": "김지원",
                "bd": "1985-04-03",
                "ph": "010-1111-2222",
                "st": "active",
                "appointArea": "학습코칭",
                "appointStart": "2026-03-01",
                "appointEnd": "2027-02-28",
                "careerHistory": [{"start": "2025-03-01", "end": "2026-02-28", "area": "학습코칭"}],
                "scd": [{"d": "월", "s": "15:00", "e": "15:50"}],
            }
        ],
        "stu": [
            {
                "id": "st0001",
                "nm": "홍길동",
                "alias": "별하",
                "sc": "의림초",
                "scType": "초",
                "gr": 4,
                "cls": 2,
                "supportTypes": ["방과후학습코칭"],
                "scd": [{"d": "월", "s": "15:00", "e": "15:50"}],
            }
        ],
        "mat": [
            {
                "id": "m001",
                "stfId": "sf001",
                "stuId": "st0001",
                "kind": "coach",
                "st": "active",
                "slots": [{"d": "월", "s": "15:00", "e": "15:50"}],
                "logs": [
                    {
                        "id": "l1",
                        "date": "2026-10-05",
                        "time": "15:00~15:50",
                        "topic": "수학 지도",
                        "status": "paid",
                        "kind": "coach",
                        "minutes": 50,
                        "amount": 40000,
                    }
                ],
            }
        ],
        "trn": [],
    }


def _models(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    settlement = build_settlement({"state": state, "ym": "2026-10"})
    staff = state["stf"][0]
    staff_by_id = {staff["id"]: staff}
    return {
        "pay_slip": pay_slip_model(settlement, staff, "sf001", "2026-10", state["cfg"]["org"]),
        "execution_report": execution_report_model(settlement, staff_by_id, "2026-10", state["cfg"]["org"]),
        "manager_book": manager_book_model(state, "sf001", "2026-10"),
        "staff_appoint": staff_appointment_model(state, "sf001"),
        "appoint_confirm": appointment_confirmation_model(state, "sf001"),
        "career_confirm": career_confirmation_model(state, "sf001"),
        "resign": resignation_model(state, "sf001", resign_date="2026. 12. 31.", resign_reason="개인 사정"),
        "plan_doc": learning_plan_model(state, "sf001"),
        "timetable": timetable_model(state, "staff", "sf001"),
    }


def _source_texts(repo_root: Path, key: str, contract: dict[str, Any]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    source_file = str((contract.get("source") or {}).get("file") or "")
    if source_file:
        path = repo_root / source_file
        if path.exists():
            out.append((source_file, path.read_text(encoding="utf-8")))
    bundle = repo_root / "assets" / "js" / "app.js"
    if bundle.exists():
        out.append(("assets/js/app.js", bundle.read_text(encoding="utf-8")))
    return out


def _table_col_counts(section_xml: str) -> list[int]:
    return [int(x) for x in re.findall(r'<hp:tbl\b[^>]*\bcolCnt="(\d+)"', section_xml)]


def _expected_table_columns(model: dict[str, Any]) -> list[int]:
    if model.get("tables"):
        return [len((t or {}).get("columns") or []) for t in model["tables"]]
    return [len(model.get("columns") or [])]


def run_parity(output_dir: str | Path) -> dict[str, Any]:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    repo_root = Path(__file__).resolve().parents[1]
    state = _state()
    models = _models(state)
    registered = list_format_contracts()

    report: dict[str, Any] = {
        "stage": 17,
        "ok": True,
        "documents": {},
        "errors": [],
        "warnings": [],
    }

    if set(registered) != set(EXPECTED_KEYS):
        report["errors"].append({"scope": "registry", "expected": EXPECTED_KEYS, "actual": sorted(registered)})

    for key in EXPECTED_KEYS:
        contract = get_format_contract(key)
        model = models[key]
        checks: list[dict[str, Any]] = []
        errors: list[str] = []
        warnings: list[str] = []

        sources = _source_texts(repo_root, key, contract)
        combined = "\n".join(text for _, text in sources)
        for marker in SOURCE_MARKERS[key]:
            ok = marker in combined
            checks.append({"layer": "html", "check": f"source marker: {marker}", "ok": ok})
            if not ok:
                errors.append(f"HTML/JS 원본에서 '{marker}'를 찾지 못했습니다.")

        contract_columns = list(contract.get("columns") or [])
        model_columns = list(model.get("columns") or [])
        if contract_columns:
            ok = model_columns == contract_columns
            checks.append({"layer": "model", "check": "column order", "ok": ok, "expected": contract_columns, "actual": model_columns})
            if not ok:
                errors.append("문서모델 열 순서가 HTML 서식계약과 다릅니다.")

        expected_orientation = str((contract.get("print") or {}).get("orientation") or ("landscape" if contract.get("landscape") else "portrait"))
        diag = render_diagnostics(model)
        orientation_ok = diag["orientation"] == expected_orientation
        checks.append({"layer": "model", "check": "orientation", "ok": orientation_ok, "expected": expected_orientation, "actual": diag["orientation"]})
        if not orientation_ok:
            errors.append("문서 방향이 HTML 서식계약과 다릅니다.")

        hwpx_path = output / f"{key}.hwpx"
        create_native_hwpx(hwpx_path, model)
        validation = validate_native_hwpx(hwpx_path)
        checks.append({"layer": "hwpx", "check": "package validation", "ok": bool(validation.get("ok"))})
        if not validation.get("ok"):
            errors.append("생성 HWPX 패키지 검증에 실패했습니다.")

        with zipfile.ZipFile(hwpx_path, "r") as zin:
            section = zin.read("Contents/section0.xml").decode("utf-8")
            preview = zin.read("Preview/PrvText.txt").decode("utf-8")

        actual_cols = _table_col_counts(section)
        expected_cols = _expected_table_columns(model)
        table_ok = actual_cols[: len(expected_cols)] == expected_cols
        checks.append({"layer": "hwpx", "check": "table column counts", "ok": table_ok, "expected": expected_cols, "actual": actual_cols})
        if not table_ok:
            errors.append("HWPX 표 열 수가 문서모델과 다릅니다.")

        orientation_token = 'landscape="WIDELY"' if expected_orientation == "landscape" else 'landscape="NARROWLY"'
        xml_orientation_ok = orientation_token in section
        checks.append({"layer": "hwpx", "check": "section orientation", "ok": xml_orientation_ok, "expected": orientation_token})
        if not xml_orientation_ok:
            errors.append("HWPX section 방향 설정이 계약과 다릅니다.")

        title_ok = str(model.get("title") or "") in preview
        checks.append({"layer": "hwpx", "check": "title visible", "ok": title_ok, "expected": model.get("title")})
        if not title_ok:
            errors.append("HWPX 미리보기에서 문서 제목을 찾지 못했습니다.")

        for marker in VISIBLE_MARKERS[key]:
            ok = marker in preview or marker in section
            checks.append({"layer": "hwpx", "check": f"visible marker: {marker}", "ok": ok})
            if not ok:
                errors.append(f"HWPX에서 핵심 문구 '{marker}'를 찾지 못했습니다.")

        if key == "manager_book":
            # 최종 HTML은 kindFilter로 학습코칭/수업협력을 분리한다. 현재 Python
            # 모델은 기본 관리부 구조를 사용하므로 이 차이는 경고로 추적한다.
            kind_source_ok = "kindFilter==='class'?'학급':'학생'" in combined or "kindFilter === 'class'" in combined
            checks.append({"layer": "html", "check": "manager kind-specific label", "ok": kind_source_ok})
            if kind_source_ok and "구분" not in dict(model.get("meta") or []):
                warnings.append("HTML 관리부는 학습코칭/수업협력 분리형이지만 Python 모델 메타에 '구분'이 아직 없습니다.")

        doc_ok = not errors
        report["documents"][key] = {
            "ok": doc_ok,
            "label": contract.get("label") or key,
            "source": [name for name, _ in sources],
            "checks": checks,
            "errors": errors,
            "warnings": warnings,
            "diagnostics": diag,
            "hwpx": hwpx_path.name,
        }
        if errors:
            report["errors"].append({"document": key, "errors": errors})
        for warning in warnings:
            report["warnings"].append({"document": key, "warning": warning})

    report["ok"] = not report["errors"]
    (output / "stage17_html_hwpx_parity.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    lines = [
        "# V13 Stage 17 HTML ↔ HWPX 서식 일치 보고서",
        "",
        f"- 전체 결과: {'PASS' if report['ok'] else 'FAIL'}",
        f"- 대상 서식: {len(EXPECTED_KEYS)}종",
        f"- 오류: {len(report['errors'])}건",
        f"- 경고: {len(report['warnings'])}건",
        "",
        "| 서식 | 결과 | 방향 | 표 열 수 | 경고 |",
        "|---|---|---|---|---|",
    ]
    for key in EXPECTED_KEYS:
        item = report["documents"][key]
        cols = next((c for c in item["checks"] if c["check"] == "table column counts"), {})
        lines.append(
            f"| {item['label']} | {'PASS' if item['ok'] else 'FAIL'} | {item['diagnostics']['orientation']} | "
            f"{cols.get('actual', [])} | {' / '.join(item['warnings']) if item['warnings'] else '-'} |"
        )
    if report["errors"]:
        lines.extend(["", "## 오류", ""])
        for error in report["errors"]:
            lines.append(f"- {error}")
    if report["warnings"]:
        lines.extend(["", "## 추적 경고", ""])
        for warning in report["warnings"]:
            lines.append(f"- {warning['document']}: {warning['warning']}")
    (output / "stage17_html_hwpx_parity.md").write_text("\n".join(lines), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="V13 Stage17 HTML/HWPX parity diagnostics")
    parser.add_argument("--output-dir", default="../.build/stage17-parity")
    args = parser.parse_args()
    report = run_parity(args.output_dir)
    print(json.dumps({"ok": report["ok"], "documents": len(report["documents"]), "errors": len(report["errors"]), "warnings": len(report["warnings"])}, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
