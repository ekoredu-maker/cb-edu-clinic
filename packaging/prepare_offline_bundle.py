from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = ROOT / ".build"
STAGE = BUILD_ROOT / "offline_frontend"
NODE_ROOT = BUILD_ROOT / "offline_node"

CHART_VERSION = "4.4.0"
XLSX_VERSION = "0.18.5"

REMOTE_CHART = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
REMOTE_XLSX = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
REMOTE_FONT = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"


def _copy_frontend() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True, exist_ok=True)

    for name in ("index.html", "manifest.webmanifest", "sw.js"):
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, STAGE / name)

    for name in ("assets", "icons"):
        src = ROOT / name
        if src.exists():
            shutil.copytree(src, STAGE / name)


def _npm_executable() -> str:
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm:
        raise RuntimeError(
            "완전 오프라인 배포 자산을 준비하려면 Node.js/npm이 필요합니다. "
            "GitHub Actions 빌드에는 자동으로 준비됩니다."
        )
    return npm


def _install_vendor_packages() -> None:
    if NODE_ROOT.exists():
        shutil.rmtree(NODE_ROOT)
    NODE_ROOT.mkdir(parents=True, exist_ok=True)

    cmd = [
        _npm_executable(),
        "install",
        "--prefix",
        str(NODE_ROOT),
        "--no-save",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        f"chart.js@{CHART_VERSION}",
        f"xlsx@{XLSX_VERSION}",
    ]
    subprocess.run(cmd, cwd=ROOT, check=True)


def _read_package_json(package: str) -> dict:
    path = NODE_ROOT / "node_modules" / package / "package.json"
    if not path.exists():
        raise RuntimeError(f"npm 패키지를 찾을 수 없습니다: {package}")
    return json.loads(path.read_text(encoding="utf-8"))


def _copy_vendor_assets() -> None:
    vendor = STAGE / "assets" / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)

    chart_pkg = _read_package_json("chart.js")
    xlsx_pkg = _read_package_json("xlsx")
    if chart_pkg.get("version") != CHART_VERSION:
        raise RuntimeError(f"Chart.js 버전 불일치: {chart_pkg.get('version')}")
    if xlsx_pkg.get("version") != XLSX_VERSION:
        raise RuntimeError(f"SheetJS 버전 불일치: {xlsx_pkg.get('version')}")

    chart_src = NODE_ROOT / "node_modules" / "chart.js" / "dist" / "chart.umd.js"
    xlsx_src = NODE_ROOT / "node_modules" / "xlsx" / "dist" / "xlsx.full.min.js"
    if not chart_src.exists():
        raise RuntimeError(f"Chart.js UMD 파일을 찾을 수 없습니다: {chart_src}")
    if not xlsx_src.exists():
        raise RuntimeError(f"SheetJS 파일을 찾을 수 없습니다: {xlsx_src}")

    shutil.copy2(chart_src, vendor / "chart.umd.js")
    shutil.copy2(xlsx_src, vendor / "xlsx.full.min.js")

    packages = [
        ("chart.js", chart_pkg, NODE_ROOT / "node_modules" / "chart.js"),
        ("xlsx", xlsx_pkg, NODE_ROOT / "node_modules" / "xlsx"),
    ]
    notices = ["Third-party libraries bundled for offline use", ""]
    versions = {}
    for package, meta, package_dir in packages:
        versions[package] = {
            "version": meta.get("version"),
            "license": meta.get("license"),
            "homepage": meta.get("homepage"),
        }
        notices.append(
            f"- {package} {meta.get('version')} | license: {meta.get('license') or 'see package license file'}"
        )
        for candidate in ("LICENSE", "LICENSE.md", "LICENSE.txt"):
            license_path = package_dir / candidate
            if license_path.exists():
                target = vendor / f"LICENSE-{package.replace('.', '_')}{license_path.suffix or '.txt'}"
                shutil.copy2(license_path, target)
                break

    (vendor / "versions.json").write_text(
        json.dumps(versions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (vendor / "THIRD_PARTY_NOTICES.txt").write_text(
        "\n".join(notices) + "\n", encoding="utf-8"
    )


def _rewrite_index() -> None:
    path = STAGE / "index.html"
    text = path.read_text(encoding="utf-8")

    required = (REMOTE_CHART, REMOTE_XLSX, REMOTE_FONT)
    missing = [item for item in required if item not in text]
    if missing:
        raise RuntimeError(f"index.html 외부 자산 참조를 찾지 못했습니다: {missing}")

    text = text.replace(REMOTE_CHART, "assets/vendor/chart.umd.js")
    text = text.replace(REMOTE_XLSX, "assets/vendor/xlsx.full.min.js")
    text = re.sub(
        r'\s*<link\s+rel="stylesheet"\s+href="' + re.escape(REMOTE_FONT) + r'"\s*>\s*',
        "\n",
        text,
        count=1,
    )

    marker = '<meta name="offline-bundle" content="true">'
    if marker not in text:
        text = text.replace(
            '<meta name="theme-color" content="#6366f1">',
            '<meta name="theme-color" content="#6366f1">\n' + marker,
            1,
        )
    path.write_text(text, encoding="utf-8")


def _generate_offline_service_worker() -> None:
    assets: list[str] = ["./"]
    for path in sorted(STAGE.rglob("*")):
        if not path.is_file() or path.name == "sw.js":
            continue
        rel = path.relative_to(STAGE).as_posix()
        assets.append(f"./{rel}")

    quoted = ",\n  ".join(json.dumps(item, ensure_ascii=False) for item in assets)
    sw = f'''const CACHE_NAME = "jc-edu-clinic-v13-offline-1";
const ASSETS = [
  {quoted}
];

self.addEventListener("install", event => {{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
}});

self.addEventListener("activate", event => {{
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
}});

self.addEventListener("fetch", event => {{
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {{
      if (cached) return cached;
      return fetch(event.request).then(response => {{
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {{}});
        return response;
      }}).catch(() => caches.match("./index.html"));
    }})
  );
}});

self.addEventListener("message", event => {{
  if (event.data === "SKIP_WAITING") self.skipWaiting();
}});
'''
    (STAGE / "sw.js").write_text(sw, encoding="utf-8")


def _assert_offline() -> None:
    index = (STAGE / "index.html").read_text(encoding="utf-8")
    external_tag = re.compile(
        r'<(?:script|link|img|source)\b[^>]*(?:src|href)\s*=\s*["\'](?:https?:)?//',
        re.IGNORECASE,
    )
    if external_tag.search(index):
        raise RuntimeError("오프라인 index.html에 외부 리소스 참조가 남아 있습니다.")

    for css in (STAGE / "assets" / "css").rglob("*.css"):
        text = css.read_text(encoding="utf-8", errors="ignore")
        if re.search(r'@import\s+[^;]*(?:https?:)?//', text, re.IGNORECASE):
            raise RuntimeError(f"CSS 외부 @import 발견: {css}")
        if re.search(r'url\(\s*["\']?(?:https?:)?//', text, re.IGNORECASE):
            raise RuntimeError(f"CSS 외부 url() 발견: {css}")

    own_js_root = STAGE / "assets" / "js"
    forbidden_hosts = (
        "cdn.jsdelivr.net",
        "cdnjs.cloudflare.com",
        "unpkg.com",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
    )
    for js in own_js_root.rglob("*.js"):
        text = js.read_text(encoding="utf-8", errors="ignore")
        for host in forbidden_hosts:
            if host in text:
                raise RuntimeError(f"자체 JS에 외부 CDN 참조가 남아 있습니다: {js} -> {host}")

    for required in (
        STAGE / "assets" / "vendor" / "chart.umd.js",
        STAGE / "assets" / "vendor" / "xlsx.full.min.js",
        STAGE / "assets" / "vendor" / "versions.json",
    ):
        if not required.exists() or required.stat().st_size == 0:
            raise RuntimeError(f"오프라인 필수 자산 누락: {required}")


def main() -> int:
    _copy_frontend()
    _install_vendor_packages()
    _copy_vendor_assets()
    _rewrite_index()
    _generate_offline_service_worker()
    _assert_offline()

    print(f"OFFLINE_FRONTEND={STAGE}")
    print(f"Chart.js={CHART_VERSION}")
    print(f"SheetJS={XLSX_VERSION}")
    print("External runtime resources=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
