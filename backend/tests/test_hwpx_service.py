from pathlib import Path
import zipfile

from services.hwpx_service import create_from_template


def test_hwpx_placeholder_replacement(tmp_path: Path):
    template = tmp_path / "sample.hwpx"
    with zipfile.ZipFile(template, "w") as z:
        z.writestr("mimetype", "application/hwp+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("Contents/section0.xml", "<root><t>{{ORG}}</t><t>{{YM}}</t><t>{{GROSS}}</t></root>")
        z.writestr("BinData/image.png", b"PNGDATA")

    output = tmp_path / "out.hwpx"
    create_from_template(template, output, {"ORG": "제천교육지원청", "YM": "2026-10", "GROSS": 90000})

    assert zipfile.is_zipfile(output)
    with zipfile.ZipFile(output, "r") as z:
        section = z.read("Contents/section0.xml").decode("utf-8")
        assert "제천교육지원청" in section
        assert "2026-10" in section
        assert "90,000" in section
        assert z.read("BinData/image.png") == b"PNGDATA"
        assert z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
