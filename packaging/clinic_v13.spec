# -*- mode: python ; coding: utf-8 -*-
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

REPO = Path(SPECPATH).resolve().parent
BACKEND = REPO / "backend"
FRONTEND = Path(os.environ.get("CB_CLINIC_FRONTEND_ROOT", str(REPO))).resolve()

if not (FRONTEND / "index.html").exists():
    raise RuntimeError(f"frontend index.html not found: {FRONTEND}")

datas = [
    (str(FRONTEND / "index.html"), "."),
    (str(FRONTEND / "assets"), "assets"),
    (str(FRONTEND / "icons"), "icons"),
]
for optional in ("manifest.webmanifest", "sw.js"):
    p = FRONTEND / optional
    if p.exists():
        datas.append((str(p), "."))

template_dir = BACKEND / "templates"
if template_dir.exists():
    datas.append((str(template_dir), "backend/templates"))

binaries = []
hiddenimports = []
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("fastapi")
hiddenimports += [
    "database.db",
    "database.state_store",
    "domain.statistics",
    "domain.verification",
    "domain.settlement",
    "services.document_context",
    "services.excel_service",
    "services.hwpx_service",
    "runtime_paths",
]

analysis = Analysis(
    [str(BACKEND / "launcher.py")],
    pathex=[str(BACKEND)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["webview", "pythonnet", "clr_loader", "clr"],
    noarchive=False,
)
pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="학습클리닉_V13",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
)

coll = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="학습클리닉_V13",
)
