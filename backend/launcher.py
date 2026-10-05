from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.request import urlopen

import uvicorn

from app import app
from runtime_paths import user_data_dir


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def run_api(port: int) -> None:
    # Keep the same proven startup path used by the Stage21 package. The API
    # runs on a daemon thread; the process owns its lifetime.
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning", access_log=False)


def wait_until_ready(base_url: str, timeout: float = 12.0) -> None:
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


def start_engine() -> str:
    port = find_free_port()
    threading.Thread(target=run_api, args=(port,), daemon=True, name="clinic-api").start()
    base_url = f"http://127.0.0.1:{port}"
    wait_until_ready(base_url)
    return base_url


def _candidate_browser_paths() -> list[Path]:
    candidates: list[Path] = []

    explicit = os.getenv("CB_CLINIC_BROWSER", "").strip()
    if explicit:
        candidates.append(Path(explicit))

    for command in ("msedge.exe", "msedge", "chrome.exe", "chrome"):
        found = shutil.which(command)
        if found:
            candidates.append(Path(found))

    env_roots = [
        os.getenv("PROGRAMFILES(X86)"),
        os.getenv("PROGRAMFILES"),
        os.getenv("LOCALAPPDATA"),
    ]
    suffixes = [
        Path("Microsoft/Edge/Application/msedge.exe"),
        Path("Google/Chrome/Application/chrome.exe"),
    ]
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

    # A dedicated user-data-dir gives the app its own browser process so the
    # Python/FastAPI engine can live exactly as long as the app window.
    process = subprocess.Popen(args, close_fds=True)
    return int(process.wait())


def self_test() -> int:
    base_url = start_engine()
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
            "/assets/vendor/versions.json",
        ):
            with urlopen(f"{base_url}{asset}", timeout=3.0) as response:
                body = response.read()
                if response.status != 200 or len(body) < 10:
                    raise RuntimeError(f"offline asset serving failed: {asset}")
        if "assets/vendor/chart.umd.js" not in html or "assets/vendor/xlsx.full.min.js" not in html:
            raise RuntimeError("packaged index is not using local vendor assets")
    return 0


def runtime_self_test() -> int:
    # Windowed PyInstaller builds can have sys.stdout/sys.stderr == None, so
    # this path must not print. A zero exit code is the runtime contract.
    browser = find_app_browser()
    if not browser.is_file():
        raise RuntimeError(f"app browser missing: {browser}")
    return 0


def _finish_cli_test(fn) -> None:
    code = 0
    try:
        code = int(fn() or 0)
    except Exception:
        code = 1
    # Frozen windowed applications can retain helper/runtime threads during
    # interpreter shutdown. Diagnostics are complete at this point, so return
    # the contract exit code directly to Windows.
    if getattr(sys, "frozen", False):
        os._exit(code)
    raise SystemExit(code)


def main() -> None:
    if "--self-test" in sys.argv:
        _finish_cli_test(self_test)
    if "--runtime-self-test" in sys.argv:
        _finish_cli_test(runtime_self_test)

    base_url = start_engine()
    raise SystemExit(launch_app_window(base_url))


if __name__ == "__main__":
    main()
