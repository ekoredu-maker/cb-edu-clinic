import zipfile

from domain.settlement import build_settlement
from services.print_document_model import pay_slip_print_model
from services.hwpx_native_service import create_native_hwpx, validate_native_hwpx
from tests.load_fixture import build_large_state


def test_stage19_hancom_package_shape(tmp_path):
    state = build_large_state(ym="2026-10")
    settlement = build_settlement({"state": state, "ym": "2026-10"})
    staff = {str(x["id"]): x for x in state["stf"]}
    model = pay_slip_print_model(settlement, staff["sf001"], "sf001", "2026-10", state["cfg"]["org"])

    path = create_native_hwpx(tmp_path / "pay.hwpx", model)
    result = validate_native_hwpx(path)
    assert result["ok"] is True
    assert result["hancomPackageShape"] is True

    with zipfile.ZipFile(path) as zin:
        names = zin.namelist()
        assert names[0] == "mimetype"
        assert "settings.xml" in names
        assert "Contents/settings.xml" not in names
        assert "META-INF/manifest.xml" in names
        assert "META-INF/container.rdf" in names

        version = zin.read("version.xml").decode("utf-8")
        assert "http://www.hancom.co.kr/hwpml/2011/version" in version
        assert 'xmlVersion="1.4"' in version

        header = zin.read("Contents/header.xml").decode("utf-8")
        assert "<hh:compatibleDocument" in header
        assert "<hh:docOption>" in header
        assert "<hh:trackchageConfig" in header

        content = zin.read("Contents/content.hpf").decode("utf-8")
        assert 'href="Contents/header.xml"' in content
        assert 'href="Contents/section0.xml"' in content
        assert 'href="settings.xml"' in content
