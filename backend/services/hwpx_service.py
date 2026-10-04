from pathlib import Path
from typing import Any
import shutil
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


def create_from_template(
    template_path: str | Path,
    output_path: str | Path,
    context: dict[str, Any],
) -> Path:
    """1차 골격.

    현재 단계에서는 원본 HWPX 템플릿을 안전하게 복제한다.
    다음 단계에서 section*.xml의 표/문단 매핑 규칙을 추가해
    context 값을 실제 기관 서식에 주입한다.
    """
    src = validate_hwpx_template(template_path)
    dst = Path(output_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return dst
