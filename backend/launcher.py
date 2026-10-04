from __future__ import annotations

import socket
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


def main() -> None:
    port = find_free_port()
    threading.Thread(target=run_api, args=(port,), daemon=True, name="clinic-api").start()

    base_url = f"http://127.0.0.1:{port}"
    wait_until_ready(base_url)

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
