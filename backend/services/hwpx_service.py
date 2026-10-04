from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import re
import shutil
import tempfile
import zipfile


class HwpxTemplateError(RuntimeError):
    pass


def validate_hwpx_template(template_path: str | Path) -> Path:
    path = Path(template_path)
    if not path.exists():
        raise HwpxTemplateError(f"HWPX 템플릿을 찾을 수 없습니다: {path}")
    if path.suffix.lower() != ".hwpx":
        raise HwpxTemplateError("HWPX 템플릿만 사용할 수 있습니다.")
    if not zipfile.is_zipfile(path):
        raise HwpxTemplateError("유효한 HWPX 패키지가 아닙니다.")
    return path


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "예" if value else "아니오"
    if isinstance(value, (int, float)):
        return f"{value:,}" if isinstance(value, int) else str(value)
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _replace_placeholders(text: str, context: dict[str, Any]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return _stringify(context.get(key, match.group(0)))

    return re.sub(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}", repl, text)


def create_from_template(
    template_path: str | Path,
    output_path: str | Path,
    context: dict[str, Any],
) -> Path:
    """HWPX 템플릿의 XML/텍스트 파일에서 {{KEY}} 자리표시자를 치환한다.

    표 행 반복은 기관별 실제 HWPX 서식 구조가 확정된 뒤 별도 매퍼에서 처리한다.
    현재 구현은 서식 구조를 훼손하지 않고 제목, 기관명, 월, 합계, 금액 등
    고정 위치 텍스트를 안전하게 주입하는 공통 계층이다.
    """
    src = validate_hwpx_template(template_path)
    dst = Path(output_path)
    dst.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="clinic_hwpx_") as tmp_dir:
        tmp = Path(tmp_dir)
        with zipfile.ZipFile(src, "r") as zin:
            zin.extractall(tmp)

        for path in tmp.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".xml", ".txt", ".json", ".opf"}:
                continue
            try:
                raw = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            replaced = _replace_placeholders(raw, context)
            if replaced != raw:
                path.write_text(replaced, encoding="utf-8")

        with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            mimetype = tmp / "mimetype"
            if mimetype.exists():
                zout.write(mimetype, "mimetype", compress_type=zipfile.ZIP_STORED)
            for path in sorted(tmp.rglob("*")):
                if not path.is_file() or path == mimetype:
                    continue
                zout.write(path, path.relative_to(tmp).as_posix())

    if not zipfile.is_zipfile(dst):
        raise HwpxTemplateError("생성된 HWPX 패키지 검증에 실패했습니다.")
    return dst


def copy_template(template_path: str | Path, output_path: str | Path) -> Path:
    src = validate_hwpx_template(template_path)
    dst = Path(output_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return dst
