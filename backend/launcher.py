from __future__ import annotations

import json
import socket
import sys
import threading
import time
from urllib.request import Request, urlopen

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


def _post_json(base_url: str, path: str, payload: dict) -> tuple[int, bytes, dict]:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        f"{base_url}{path}",
        data=raw,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    with urlopen(req, timeout=8.0) as response:
        body = response.read()
        ctype = response.headers.get("content-type", "")
        parsed = json.loads(body.decode("utf-8")) if "json" in ctype else {}
        return response.status, body, parsed


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

    state = {
        "cfg": {
            "org": "제천교육지원청",
            "confirmer": "담당자",
            "rateCoach": 40000,
            "rateClass": 30000,
            "taxPct": 3.3,
        },
        "stf": [{"id": "stf-self", "nm": "지원단A", "st": "active"}],
        "stu": [{"id": "stu-self", "nm": "학생A", "sc": "테스트학교"}],
        "mat": [{
            "id": "mat-self",
            "stfId": "stf-self",
            "stuId": "stu-self",
            "kind": "coach",
            "st": "active",
            "slots": [{"d": "화", "s": "14:00", "e": "14:50"}],
            "logs": [],
        }],
        "trn": [],
    }
    session = {
        "id": "sess-self",
        "legacy_matching_id": "mat-self",
        "work_date": "2026-10-06",
        "start_at": "2026-10-06T05:00:00+00:00",
        "end_at": "2026-10-06T05:50:00+00:00",
        "actual_minutes": 50,
        "kind": "coach",
        "topic": "포터블 연계 자가검사",
        "content": "V14 실적 투영 및 정산 검사",
        "place": "테스트실",
        "verification_state": "auto_verified",
        "settlement_state": "approved",
    }

    status, _, projected = _post_json(
        base_url, "/api/realtime/project", {"state": state, "sessions": [session]}
    )
    if status != 200 or not projected.get("ok") or projected.get("projected") != 1:
        raise RuntimeError(f"realtime projection self-test failed: {projected}")
    projected_state = projected.get("state") or {}
    logs = ((projected_state.get("mat") or [{}])[0].get("logs") or [])
    if len(logs) != 1 or logs[0].get("status") != "verified":
        raise RuntimeError(f"projected legacy log self-test failed: {logs}")

    status, _, settlement = _post_json(
        base_url,
        "/api/settlement",
        {"state": projected_state, "ym": "2026-10"},
    )
    summary = (settlement.get("summaryByStaff") or {}).get("stf-self") or {}
    if status != 200 or summary.get("coachCount") != 1 or summary.get("gross") != 40000:
        raise RuntimeError(f"settlement self-test failed: {settlement}")

    status, hwpx_body, _ = _post_json(
        base_url,
        "/api/export/execution_report.hwpx",
        {"state": projected_state, "ym": "2026-10"},
    )
    if status != 200 or len(hwpx_body) < 1000 or not hwpx_body.startswith(b"PK"):
        raise RuntimeError("HWPX export self-test failed")

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
