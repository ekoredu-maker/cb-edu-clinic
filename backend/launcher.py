from __future__ import annotations

import json
import socket
import sys
import threading
import time
from urllib.request import urlopen

import uvicorn
import webview

from app import app


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def run_api(port: int) -> None:
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


def main() -> None:
    if "--self-test" in sys.argv:
        raise SystemExit(self_test())

    base_url = start_engine()
    webview.create_window(
        "충북종합학습클리닉 업무관리 프로그램",
        url=f"{base_url}/",
        width=1440,
        height=920,
        min_size=(1100, 700),
        resizable=True,
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
