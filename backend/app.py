from __future__ import annotations

from pathlib import Path
import json
import tempfile

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from database.db import init_db
from database.state_store import (
    StateMigrationError,
    compare_state,
    delete_record,
    export_state,
    import_state,
    save_singleton,
    status as storage_status,
    upsert_record,
)
from domain.statistics import build_statistics
from domain.verification import verify_records
from domain.settlement import build_settlement
from services.document_context import execution_context, settlement_context
from services.excel_service import create_execution_xlsx, create_pay_slip_xlsx
from services.hwpx_service import HwpxTemplateError, create_from_template

app = FastAPI(title="CB Edu Clinic V13 Hybrid Engine", version="13.0.0-alpha6")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1", "http://localhost", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / "templates"
GENERATED_DIR = Path(tempfile.gettempdir()) / "cb_edu_clinic_v13"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

HWPX_TEMPLATES = {
    "pay_slip": "pay_slip.hwpx",
    "execution_report": "execution_report.hwpx",
    "manager_book": "manager_book.hwpx",
    "operation_report": "operation_report.hwpx",
}


def _safe_name(value: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(value or ""))[:80]


def _state(payload: dict) -> dict:
    return payload.get("state") or payload


def _staff_by_id(state: dict) -> dict[str, dict]:
    return {str(s.get("id")): s for s in (state.get("stf") or []) if s.get("id") is not None}


def _migration_error(exc: StateMigrationError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    template_status = {
        key: (TEMPLATE_DIR / filename).exists()
        for key, filename in HWPX_TEMPLATES.items()
    }
    return {
        "ok": True,
        "engine": "python",
        "version": "13.0.0-alpha6",
        "templates": template_status,
        "storage": storage_status(),
    }


@app.get("/api/storage/status")
def get_storage_status() -> dict:
    return {"ok": True, **storage_status()}


@app.post("/api/storage/import")
def storage_import(payload: dict) -> dict:
    state = payload.get("state")
    if state is None:
        raise HTTPException(status_code=400, detail="state가 필요합니다.")
    try:
        result = import_state(
            state,
            source=str(payload.get("source") or "browser-state"),
            replace=bool(payload.get("replace", True)),
        )
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc
    return {**result, "storage": storage_status()}


@app.post("/api/storage/upsert")
def storage_upsert(payload: dict) -> dict:
    try:
        return upsert_record(
            str(payload.get("entityType") or ""),
            payload.get("record"),
            source=str(payload.get("source") or "dual-write"),
        )
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc


@app.post("/api/storage/delete")
def storage_delete(payload: dict) -> dict:
    try:
        return delete_record(
            str(payload.get("entityType") or ""),
            str(payload.get("id") or ""),
            source=str(payload.get("source") or "dual-write"),
        )
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc


@app.post("/api/storage/singleton")
def storage_singleton(payload: dict) -> dict:
    try:
        return save_singleton(
            str(payload.get("key") or ""),
            payload.get("value"),
            source=str(payload.get("source") or "dual-write"),
        )
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc


@app.post("/api/storage/compare")
def storage_compare(payload: dict) -> dict:
    state = payload.get("state")
    if state is None:
        raise HTTPException(status_code=400, detail="state가 필요합니다.")
    try:
        return compare_state(state)
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc


@app.get("/api/storage/export")
def storage_export() -> dict:
    return {"ok": True, "state": export_state(), "storage": storage_status()}


@app.get("/api/storage/backup.json")
def storage_backup_json():
    state = export_state()
    stamp = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"학습클리닉_V13_SQLite백업_{stamp}.json"
    out = GENERATED_DIR / filename
    out.write_text(json.dumps(state, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return FileResponse(out, filename=filename, media_type="application/json")


@app.post("/api/statistics")
def statistics(payload: dict) -> dict:
    return build_statistics(payload)


@app.post("/api/verification")
def verification(payload: dict) -> dict:
    return verify_records(payload)


@app.post("/api/settlement")
def settlement(payload: dict) -> dict:
    return build_settlement(payload)


@app.post("/api/export/pay-slip.xlsx")
def export_pay_slip_xlsx(payload: dict):
    state = _state(payload)
    ym = str(payload.get("ym") or "")
    staff_id = str(payload.get("staffId") or "")
    if not ym or not staff_id:
        raise HTTPException(status_code=400, detail="ym과 staffId가 필요합니다.")
    staff = _staff_by_id(state).get(staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="지원단 정보를 찾을 수 없습니다.")
    result = build_settlement({"state": state, "ym": ym})
    filename = f"지급명세서_{_safe_name(staff.get('nm',''))}_{ym}.xlsx"
    out = GENERATED_DIR / filename
    create_pay_slip_xlsx(out, result, staff, staff_id, ym, (state.get("cfg") or {}).get("org") or "")
    return FileResponse(out, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/api/export/execution.xlsx")
def export_execution_xlsx(payload: dict):
    state = _state(payload)
    ym = str(payload.get("ym") or "")
    if not ym:
        raise HTTPException(status_code=400, detail="ym이 필요합니다.")
    result = build_settlement({"state": state, "ym": ym})
    filename = f"월별집행내역_{ym}.xlsx"
    out = GENERATED_DIR / filename
    create_execution_xlsx(out, result, _staff_by_id(state), ym, (state.get("cfg") or {}).get("org") or "")
    return FileResponse(out, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/api/export/{template_key}.hwpx")
def export_hwpx(template_key: str, payload: dict):
    filename = HWPX_TEMPLATES.get(template_key)
    if not filename:
        raise HTTPException(status_code=404, detail="지원하지 않는 HWPX 서식입니다.")
    template = TEMPLATE_DIR / filename
    if not template.exists():
        raise HTTPException(status_code=409, detail=f"HWPX 원본 템플릿이 아직 등록되지 않았습니다: {filename}")

    state = _state(payload)
    ym = str(payload.get("ym") or "")
    cfg = state.get("cfg") or {}
    settlement_result = build_settlement({"state": state, "ym": ym})

    try:
        if template_key == "pay_slip":
            staff_id = str(payload.get("staffId") or "")
            staff = _staff_by_id(state).get(staff_id)
            if not staff:
                raise HTTPException(status_code=404, detail="지원단 정보를 찾을 수 없습니다.")
            context = settlement_context(settlement_result, staff_id, ym, cfg.get("org") or "", cfg.get("confirmer") or "")
            context["STAFF_NAME"] = staff.get("nm") or ""
            out_name = f"지급명세서_{_safe_name(staff.get('nm',''))}_{ym}.hwpx"
        elif template_key == "execution_report":
            context = execution_context(settlement_result, ym, cfg.get("org") or "")
            out_name = f"월별집행내역_{ym}.hwpx"
        else:
            context = {
                "YM": ym,
                "ORG": cfg.get("org") or "",
                "CONFIRMER": cfg.get("confirmer") or "",
            }
            out_name = f"{template_key}_{ym or 'output'}.hwpx"

        out = GENERATED_DIR / out_name
        create_from_template(template, out, context)
    except HwpxTemplateError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(out, filename=out_name, media_type="application/octet-stream")
