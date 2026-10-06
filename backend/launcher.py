from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
from pathlib import Path
from typing import Callable
from urllib.request import urlopen

import uvicorn

from app import app
from runtime_paths import user_data_dir


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _diagnostic_path(name: str) -> Path:
    return user_data_dir() / name


def _write_diagnostic(name: str, text: str) -> None:
    try:
        path = _diagnostic_path(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(text or ""), encoding="utf-8")
    except Exception:
        pass


def wait_until_ready(base_url: str, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urlopen(f"{base_url}/api/health", timeout=1.0) as response:
                if response.status == 200:
                    return
        except Exception as exc:  # pragma: no cover - platform startup timing
            last_error = exc
            time.sleep(0.1)
    raise RuntimeError(f"내부 업무엔진 시작에 실패했습니다: {last_error}")


def _server(port: int) -> uvicorn.Server:
    # Keep the ASGI server on the main thread. Windowed PyInstaller executables
    # have sys.stdout/sys.stderr set to None; Uvicorn's default colour logging
    # probes stderr.isatty() and therefore crashes before the server starts.
    # Disable Uvicorn's console log configuration and rely on our file-based
    # startup diagnostics instead.
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        log_config=None,
        access_log=False,
        loop="asyncio",
        http="h11",
        ws="none",
        lifespan="on",
    )
    return uvicorn.Server(config)


def _run_server_session(client_fn: Callable[[str], int | None], *, label: str) -> int:
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    server = _server(port)
    outcome: dict[str, object] = {"code": 0, "error": None}

    def client_runner() -> None:
        try:
            wait_until_ready(base_url)
            outcome["code"] = int(client_fn(base_url) or 0)
        except BaseException:
            detail = traceback.format_exc()
            outcome["error"] = detail
            _write_diagnostic(f"{label}-client-error.log", detail)
        finally:
            server.should_exit = True

    client = threading.Thread(target=client_runner, daemon=True, name=f"clinic-{label}-client")
    client.start()
    try:
        # Uvicorn owns the main thread; the UI/test client runs beside it.
        server.run()
    except BaseException:
        detail = traceback.format_exc()
        outcome["error"] = detail
        _write_diagnostic(f"{label}-server-error.log", detail)
    finally:
        server.should_exit = True
        client.join(timeout=5.0)

    error = outcome.get("error")
    if error:
        raise RuntimeError(str(error))
    return int(outcome.get("code") or 0)


def _candidate_browser_paths() -> list[Path]:
    candidates: list[Path] = []
    explicit = os.getenv("CB_CLINIC_BROWSER", "").strip()
    if explicit:
        candidates.append(Path(explicit))
    for command in ("msedge.exe", "msedge", "chrome.exe", "chrome"):
        found = shutil.which(command)
        if found:
            candidates.append(Path(found))
    env_roots = [os.getenv("PROGRAMFILES(X86)"), os.getenv("PROGRAMFILES"), os.getenv("LOCALAPPDATA")]
    suffixes = [Path("Microsoft/Edge/Application/msedge.exe"), Path("Google/Chrome/Application/chrome.exe")]
    for root in env_roots:
        if not root:
            continue
        for suffix in suffixes:
            candidates.append(Path(root) / suffix)
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve()
        except OSError:
            resolved = candidate.expanduser()
        key = str(resolved).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(resolved)
    return unique


def find_app_browser() -> Path:
    for candidate in _candidate_browser_paths():
        if candidate.is_file():
            return candidate
    raise RuntimeError(
        "Microsoft Edge 또는 Google Chrome을 찾지 못했습니다. "
        "Windows 기본 Edge를 설치하거나 CB_CLINIC_BROWSER 환경변수로 브라우저 경로를 지정해 주세요."
    )


def launch_app_window(base_url: str) -> int:
    browser = find_app_browser()
    profile_dir = user_data_dir() / "browser-profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    args = [
        str(browser),
        f"--app={base_url}/",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1440,920",
        "--disable-session-crashed-bubble",
    ]
    process = subprocess.Popen(args, close_fds=True)
    return int(process.wait())


def _self_test_client(base_url: str) -> int:
    with urlopen(f"{base_url}/api/health", timeout=3.0) as response:
        health = json.loads(response.read().decode("utf-8"))
        if response.status != 200 or not health.get("ok"):
            raise RuntimeError("health check failed")

    with urlopen(f"{base_url}/", timeout=3.0) as response:
        html = response.read(8192).decode("utf-8", errors="ignore")
        if response.status != 200 or "학습클리닉" not in html:
            raise RuntimeError("packaged frontend check failed")

    if getattr(sys, "frozen", False):
        offline = health.get("offline") or {}
        if not offline.get("ready"):
            raise RuntimeError(f"offline bundle check failed: {offline}")
        for asset in (
            "/assets/vendor/chart.umd.js",
            "/assets/vendor/xlsx.full.min.js",
            "/assets/vendor/exceljs.min.js",
            "/assets/vendor/versions.json",
        ):
            with urlopen(f"{base_url}{asset}", timeout=3.0) as response:
                body = response.read()
                if response.status != 200 or len(body) < 10:
                    raise RuntimeError(f"offline asset serving failed: {asset}")
        if "assets/vendor/chart.umd.js" not in html or "assets/vendor/xlsx.full.min.js" not in html:
            raise RuntimeError("packaged index is not using local vendor assets")
    return 0


def self_test() -> int:
    return _run_server_session(_self_test_client, label="self-test")


def runtime_self_test() -> int:
    browser = find_app_browser()
    if not browser.is_file():
        raise RuntimeError(f"app browser missing: {browser}")
    return 0


def _finish_cli_test(fn, label: str) -> None:
    code = 0
    try:
        code = int(fn() or 0)
    except BaseException:
        detail = traceback.format_exc()
        _write_diagnostic(f"{label}-error.log", detail)
        if not getattr(sys, "frozen", False):
            print(detail, file=sys.stderr)
        code = 1
    if getattr(sys, "frozen", False):
        os._exit(code)
    raise SystemExit(code)


def main() -> None:
    if "--self-test" in sys.argv:
        _finish_cli_test(self_test, "self-test")
    if "--runtime-self-test" in sys.argv:
        _finish_cli_test(runtime_self_test, "runtime-self-test")

    try:
        code = _run_server_session(launch_app_window, label="app")
    except BaseException:
        detail = traceback.format_exc()
        _write_diagnostic("startup-error.log", detail)
        raise
    raise SystemExit(code)


if __name__ == "__main__":
    main()
