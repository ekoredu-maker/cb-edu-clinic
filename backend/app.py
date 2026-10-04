from __future__ import annotations

from pathlib import Path
import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
from runtime_paths import frontend_root, generated_dir, template_dir
from services.document_context import execution_context, settlement_context
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
from services.excel_service import create_execution_xlsx, create_manager_book_xlsx, create_pay_slip_xlsx
from services.format_contract import list_format_contracts
from services.hwpx_native_service import NativeHwpxError, create_native_hwpx
from services.hwpx_service import HwpxTemplateError, create_from_template

app = FastAPI(title="CB Edu Clinic V13 Hybrid Engine", version="13.0.0-alpha15")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1", "http://localhost", "null"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = frontend_root()
TEMPLATE_DIR = template_dir()
GENERATED_DIR = generated_dir()

HWPX_TEMPLATES = {
    "pay_slip": "pay_slip.hwpx",
    "execution_report": "execution_report.hwpx",
    "manager_book": "manager_book.hwpx",
    "operation_report": "operation_report.hwpx",
}
NATIVE_HWPX_KEYS = {
    "pay_slip",
    "execution_report",
    "manager_book",
    "staff_appoint",
    "appoint_confirm",
    "career_confirm",
    "resign",
    "plan_doc",
    "timetable",
}
MONTHLY_HWPX_KEYS = {"pay_slip", "execution_report", "manager_book"}

OFFLINE_ASSETS = {
    "chartjs": FRONTEND_DIR / "assets" / "vendor" / "chart.umd.js",
    "sheetjs": FRONTEND_DIR / "assets" / "vendor" / "xlsx.full.min.js",
    "versions": FRONTEND_DIR / "assets" / "vendor" / "versions.json",
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
    template_status = {key: (TEMPLATE_DIR / filename).exists() for key, filename in HWPX_TEMPLATES.items()}
    offline_status = {key: path.exists() for key, path in OFFLINE_ASSETS.items()}
    format_contracts = list_format_contracts()
    return {
        "ok": True,
        "engine": "python",
        "version": "13.0.0-alpha15",
        "templates": template_status,
        "formatContracts": {key: True for key in format_contracts},
        "nativeHwpx": {
            "available": sorted(NATIVE_HWPX_KEYS),
            "hancomValidated": False,
        },
        "offline": {"ready": all(offline_status.values()), "assets": offline_status},
        "storage": storage_status(),
    }


@app.get("/api/formats")
def formats() -> dict:
    return {"ok": True, "contracts": list_format_contracts()}


@app.get("/api/storage/status")
def get_storage_status() -> dict:
    return {"ok": True, **storage_status()}


@app.post("/api/storage/import")
def storage_import(payload: dict) -> dict:
    state = payload.get("state")
    if state is None:
        raise HTTPException(status_code=400, detail="state가 필요합니다.")
    try:
        result = import_state(state, source=str(payload.get("source") or "browser-state"), replace=bool(payload.get("replace", True)))
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc
    return {**result, "storage": storage_status()}


@app.post("/api/storage/upsert")
def storage_upsert(payload: dict) -> dict:
    try:
        return upsert_record(str(payload.get("entityType") or ""), payload.get("record"), source=str(payload.get("source") or "dual-write"))
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc


@app.post("/api/storage/delete")
def storage_delete(payload: dict) -> dict:
    try:
        return delete_record(str(payload.get("entityType") or ""), str(payload.get("id") or ""), source=str(payload.get("source") or "dual-write"))
    except StateMigrationError as exc:
        raise _migration_error(exc) from exc


@app.post("/api/storage/singleton")
def storage_singleton(payload: dict) -> dict:
    try:
        return save_singleton(str(payload.get("key") or ""), payload.get("value"), source=str(payload.get("source") or "dual-write"))
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
    filename = f"집행내역서_{ym}.xlsx"
    out = GENERATED_DIR / filename
    create_execution_xlsx(out, result, _staff_by_id(state), ym, (state.get("cfg") or {}).get("org") or "")
    return FileResponse(out, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.post("/api/export/manager-book.xlsx")
def export_manager_book_xlsx(payload: dict):
    state = _state(payload)
    ym = str(payload.get("ym") or "")
    staff_id = str(payload.get("staffId") or "")
    if not ym or not staff_id:
        raise HTTPException(status_code=400, detail="ym과 staffId가 필요합니다.")
    staff = _staff_by_id(state).get(staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="지원단 정보를 찾을 수 없습니다.")
    filename = f"관리부_{_safe_name(staff.get('nm',''))}_{ym}.xlsx"
    out = GENERATED_DIR / filename
    try:
        create_manager_book_xlsx(out, state, staff_id, ym)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return FileResponse(out, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _native_model(template_key: str, state: dict, payload: dict, settlement_result: dict | None):
    cfg = state.get("cfg") or {}
    staff_map = _staff_by_id(state)
    ym = str(payload.get("ym") or "")
    staff_id = str(payload.get("staffId") or "")

    if template_key == "pay_slip":
        staff = staff_map.get(staff_id)
        if not staff:
            raise HTTPException(status_code=404, detail="지원단 정보를 찾을 수 없습니다.")
        result = settlement_result or build_settlement({"state": state, "ym": ym})
        return pay_slip_model(result, staff, staff_id, ym, cfg.get("org") or ""), f"지급명세서_{_safe_name(staff.get('nm',''))}_{ym}.hwpx"
    if template_key == "execution_report":
        result = settlement_result or build_settlement({"state": state, "ym": ym})
        return execution_report_model(result, staff_map, ym, cfg.get("org") or ""), f"월별집행내역_{ym}.hwpx"
    if template_key == "manager_book":
        staff = staff_map.get(staff_id)
        if not staff:
            raise HTTPException(status_code=404, detail="지원단 정보를 찾을 수 없습니다.")
        try:
            model = manager_book_model(state, staff_id, ym)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return model, f"관리부_{_safe_name(staff.get('nm',''))}_{ym}.hwpx"

    try:
        if template_key == "staff_appoint":
            staff = staff_map.get(staff_id)
            if not staff:
                raise ValueError("지원단 정보를 찾을 수 없습니다.")
            return staff_appointment_model(state, staff_id), f"위촉장_{_safe_name(staff.get('nm',''))}.hwpx"
        if template_key == "appoint_confirm":
            staff = staff_map.get(staff_id)
            if not staff:
                raise ValueError("지원단 정보를 찾을 수 없습니다.")
            return appointment_confirmation_model(state, staff_id), f"위촉확인서_{_safe_name(staff.get('nm',''))}.hwpx"
        if template_key == "career_confirm":
            staff = staff_map.get(staff_id)
            if not staff:
                raise ValueError("지원단 정보를 찾을 수 없습니다.")
            return career_confirmation_model(state, staff_id), f"경력확인서_{_safe_name(staff.get('nm',''))}.hwpx"
        if template_key == "resign":
            staff = staff_map.get(staff_id)
            if not staff:
                raise ValueError("지원단 정보를 찾을 수 없습니다.")
            model = resignation_model(
                state,
                staff_id,
                resign_date=str(payload.get("resignDate") or ""),
                resign_reason=str(payload.get("resignReason") or ""),
                detail_reason=str(payload.get("detailReason") or ""),
            )
            return model, f"해촉신청서_{_safe_name(staff.get('nm',''))}.hwpx"
        if template_key == "plan_doc":
            staff = staff_map.get(staff_id) if staff_id else None
            suffix = _safe_name((staff or {}).get("nm") or "빈서식")
            return learning_plan_model(state, staff_id), f"학습지도계획서_{suffix}.hwpx"
        if template_key == "timetable":
            mode = str(payload.get("mode") or "staff")
            target_id = str(payload.get("targetId") or "")
            model = timetable_model(state, mode, target_id)
            return model, f"시간표_{_safe_name(model.get('title') or target_id)}.hwpx"
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    raise HTTPException(status_code=409, detail="이 서식은 실제 HWPX 템플릿이 필요합니다.")


@app.post("/api/export/{template_key}.hwpx")
def export_hwpx(template_key: str, payload: dict):
    template_filename = HWPX_TEMPLATES.get(template_key)
    if template_key not in NATIVE_HWPX_KEYS and not template_filename:
        raise HTTPException(status_code=404, detail="지원하지 않는 HWPX 서식입니다.")

    state = _state(payload)
    ym = str(payload.get("ym") or "")
    staff_id = str(payload.get("staffId") or "")
    if template_key in MONTHLY_HWPX_KEYS and not ym:
        raise HTTPException(status_code=400, detail="ym이 필요합니다.")

    cfg = state.get("cfg") or {}
    settlement_result = build_settlement({"state": state, "ym": ym}) if template_key in {"pay_slip", "execution_report"} else None
    template = (TEMPLATE_DIR / template_filename) if template_filename else None

    try:
        if template is not None and template.exists():
            if template_key == "pay_slip":
                staff = _staff_by_id(state).get(staff_id)
                if not staff:
                    raise HTTPException(status_code=404, detail="지원단 정보를 찾을 수 없습니다.")
                result = settlement_result or build_settlement({"state": state, "ym": ym})
                context = settlement_context(result, staff_id, ym, cfg.get("org") or "", cfg.get("confirmer") or "")
                context["STAFF_NAME"] = staff.get("nm") or ""
                out_name = f"지급명세서_{_safe_name(staff.get('nm',''))}_{ym}.hwpx"
            elif template_key == "execution_report":
                result = settlement_result or build_settlement({"state": state, "ym": ym})
                context = execution_context(result, ym, cfg.get("org") or "")
                out_name = f"월별집행내역_{ym}.hwpx"
            else:
                context = {"YM": ym, "ORG": cfg.get("org") or "", "CONFIRMER": cfg.get("confirmer") or ""}
                out_name = f"{template_key}_{ym or 'output'}.hwpx"
            out = GENERATED_DIR / out_name
            create_from_template(template, out, context)
        else:
            if template_key not in NATIVE_HWPX_KEYS:
                raise HTTPException(status_code=409, detail=f"HWPX 원본 템플릿이 필요합니다: {template_filename}")
            model, out_name = _native_model(template_key, state, payload, settlement_result)
            out = GENERATED_DIR / out_name
            create_native_hwpx(out, model)
    except (HwpxTemplateError, NativeHwpxError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(out, filename=out_name, media_type="application/octet-stream")


# Packaged desktop frontend. API routes are declared first so this mount only handles UI assets.
if (FRONTEND_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
if (FRONTEND_DIR / "icons").exists():
    app.mount("/icons", StaticFiles(directory=FRONTEND_DIR / "icons"), name="icons")


@app.get("/manifest.webmanifest", include_in_schema=False)
def manifest_file():
    path = FRONTEND_DIR / "manifest.webmanifest"
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="application/manifest+json")


@app.get("/sw.js", include_in_schema=False)
def service_worker_file():
    path = FRONTEND_DIR / "sw.js"
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="application/javascript")


@app.get("/", include_in_schema=False)
def frontend_index():
    path = FRONTEND_DIR / "index.html"
    if not path.exists():
        raise HTTPException(status_code=500, detail="index.html을 찾을 수 없습니다.")
    return FileResponse(path, media_type="text/html; charset=utf-8")
