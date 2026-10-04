from __future__ import annotations

import socket
import threading
from pathlib import Path

import uvicorn
import webview

from app import app


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def run_api(port: int) -> None:
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


def main() -> None:
    port = find_free_port()
    threading.Thread(target=run_api, args=(port,), daemon=True).start()

    repo_root = Path(__file__).resolve().parents[1]
    index_file = repo_root / "index.html"
    api_base = f"http://127.0.0.1:{port}"
    url = f"{index_file.as_uri()}?api={api_base}"

    webview.create_window(
        "충북종합학습클리닉 업무관리 프로그램",
        url=url,
        width=1440,
        height=920,
        min_size=(1100, 700),
    )
    webview.start()


if __name__ == "__main__":
    main()
