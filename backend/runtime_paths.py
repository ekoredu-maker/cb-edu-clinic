from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "CB-Edu-Clinic-V13"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def bundle_root() -> Path:
    """Read-only application resource root."""
    if is_frozen() and hasattr(sys, "_MEIPASS"):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parents[1]


def executable_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def portable_mode() -> bool:
    """Use app-local data when a portable marker exists or env explicitly requests it."""
    env = os.getenv("CB_CLINIC_PORTABLE", "").strip().lower()
    if env in {"1", "true", "yes", "on"}:
        return True
    if env in {"0", "false", "no", "off"}:
        return False
    return (executable_dir() / "portable.flag").exists()


def user_data_dir() -> Path:
    if portable_mode():
        root = executable_dir() / "data"
    else:
        local = os.getenv("LOCALAPPDATA")
        root = Path(local) / APP_NAME if local else Path.home() / f".{APP_NAME}"
    root.mkdir(parents=True, exist_ok=True)
    return root


def frontend_root() -> Path:
    return bundle_root()


def template_dir() -> Path:
    return bundle_root() / "backend" / "templates"


def generated_dir() -> Path:
    root = user_data_dir() / "generated"
    root.mkdir(parents=True, exist_ok=True)
    return root
