from __future__ import annotations

import argparse
import json
from pathlib import Path

from domain.settlement import build_settlement
from services.document_model import (
    appointment_confirmation_model,
    career_confirmation_model,
    learning_plan_model,
    resignation_model,
    staff_appointment_model,
    timetable_model,
)
from services.print_document_model import (
    execution_report_print_model,
    manager_book_print_model,
    pay_slip_print_model,
)
from services.hwpx_native_service import create_native_hwpx, render_diagnostics, validate_native_hwpx
from tests.load_fixture import build_large_state


def build_sample_state() -> dict:
    state = build_large_state(
        staff_count=6,
        student_count=48,
        class_matching_count=8,
        sessions_per_matching=6,
        training_count=4,
        ym="2026-10",
    )
    state["cfg"].update({
        "org": "제천교육지원청",
        "admin": "테스트 장학사",
        "confirmer": "확인 장학사",
        "maskMode": "partial",
    })
    staff = state["stf"][0]
    staff.update({
        "nm": "김지원",
        "bd": "1985-04-03",
        "ph": "010-0000-0000",
        "appointArea": "학습코칭",
        "appointStart": "2026-03-01",
        "appointEnd": "2027-02-28",
        "careerHistory": [
            {"start": "2025-03-01", "end": "2026-02-28", "area": "학습코칭"},
        ],
    })
    state["stu"][0].update({"nm": "홍길동", "alias": "별하", "sc": "의림초", "gr": 4, "cls": 2})
    return state


def generate_pack(output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    state = build_sample_state()
    staff_id = str(state["stf"][0]["id"])
    staff_by_id = {str(x["id"]): x for x in state["stf"]}
    ym = "2026-10"
    settlement = build_settlement({"state": state, "ym": ym})

    models = [
        ("01_지급명세서.hwpx", pay_slip_print_model(settlement, staff_by_id[staff_id], staff_id, ym, state["cfg"]["org"], state["cfg"]["confirmer"])),
        ("02_월별집행내역.hwpx", execution_report_print_model(settlement, staff_by_id, ym, state["cfg"]["org"], state["cfg"]["confirmer"])),
        ("03_학습지원단관리부_학습코칭.hwpx", manager_book_print_model(state, staff_id, ym, kind="coach")),
        ("04_위촉장.hwpx", staff_appointment_model(state, staff_id)),
        ("05_위촉확인서.hwpx", appointment_confirmation_model(state, staff_id)),
        ("06_경력확인서.hwpx", career_confirmation_model(state, staff_id)),
        (
            "07_해촉신청서.hwpx",
            resignation_model(
                state,
                staff_id,
                resign_date="2026. 12. 31.",
                resign_reason="개인 사정",
                detail_reason="테스트용 샘플 문구",
            ),
        ),
        ("08_학습지도계획서.hwpx", learning_plan_model(state, staff_id)),
        ("09_주간시간표.hwpx", timetable_model(state, "staff", staff_id)),
    ]

    manifest = {
        "purpose": "한컴오피스 열기/편집/인쇄 UAT용 합성 데이터 HWPX 세트",
        "containsRealPersonalData": False,
        "engine": "CB Edu Clinic V13 native HWPX",
        "documentContract": "HTML print contract for monthly HWPX / shared contract for administrative forms",
        "documents": [],
        "manualChecks": [
            "한컴오피스에서 경고 없이 열리는지",
            "제목/본문/표의 한글이 깨지지 않는지",
            "지급명세서가 6열, 월별 집행내역서가 9열, 관리부가 12열인지",
            "관리부 제목과 구분이 학습코칭으로 표시되고 대상열이 학생인지",
            "셀 너비와 줄바꿈이 읽기 좋은지",
            "페이지 방향(세로/가로)이 manifest 예상값과 일치하는지",
            "singlePageTarget 문서가 한 쪽에 자연스럽게 들어가는지",
            "교육장 명의·직인 표기와 신청인/담당자 정렬이 자연스러운지",
            "쪽 나눔과 인쇄 미리보기가 업무서식으로 자연스러운지",
            "저장 후 다시 열어도 문서가 유지되는지",
        ],
    }

    for filename, model in models:
        path = create_native_hwpx(output_dir / filename, model)
        validation = validate_native_hwpx(path)
        diagnostics = render_diagnostics(model)
        manifest["documents"].append({
            "file": filename,
            "key": model.get("key"),
            "title": model.get("title"),
            "structuralValidation": validation,
            "printDiagnostics": diagnostics,
        })

    (output_dir / "UAT_MANIFEST.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    lines = [
        "# V13 HWPX 한컴오피스 UAT 샘플",
        "",
        "이 폴더의 문서는 모두 합성 데이터로 생성되며 실제 개인정보를 포함하지 않습니다.",
        "월별 HWPX 3종은 Stage18부터 Excel 상세계약과 분리된 HTML 인쇄계약을 사용합니다.",
        "",
        "## 확인 항목",
    ]
    lines.extend(f"- {item}" for item in manifest["manualChecks"])
    lines.extend(["", "## 문서 목록"])
    for doc in manifest["documents"]:
        diag = doc["printDiagnostics"]
        target = " · 한 쪽 목표" if diag.get("singlePageTarget") else ""
        lines.append(f"- {doc['file']} — {doc['title']} · {diag['orientation']}{target}")
    lines.extend([
        "",
        "## 자동 진단 주의",
        "- `fitSinglePage`는 HWPX 내부 치수 기반 사전 추정치이며 실제 한컴오피스 페이지 렌더링을 대체하지 않습니다.",
        "- 최종 판정은 한컴오피스의 인쇄 미리보기와 저장 후 재열기로 확인합니다.",
    ])
    (output_dir / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="../.build/hwpx-uat")
    args = parser.parse_args()
    manifest = generate_pack(Path(args.output_dir))
    print(json.dumps({"ok": True, "count": len(manifest["documents"]), "output": args.output_dir}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
