import re
import zipfile

from hwpx_uat_pack import generate_pack
from services.hwpx_orientation_patch import A4_HEIGHT, A4_WIDTH, ORIENTATION_BY_KEY


EXPECTED = {
    "pay_slip": "portrait",
    "execution_report": "landscape",
    "manager_book": "landscape",
    "staff_appoint": "portrait",
    "appoint_confirm": "portrait",
    "career_confirm": "portrait",
    "resign": "portrait",
    "plan_doc": "portrait",
    "timetable": "landscape",
}


def _page_pr(path):
    with zipfile.ZipFile(path, "r") as zin:
        section = zin.read("Contents/section0.xml").decode("utf-8")
    match = re.search(
        r'<hp:pagePr[^>]*landscape="([^"]+)"[^>]*width="(\d+)"[^>]*height="(\d+)"',
        section,
    )
    assert match, path.name
    return match.group(1), int(match.group(2)), int(match.group(3))


def test_stage21_orientation_policy_covers_all_nine_documents():
    assert ORIENTATION_BY_KEY == EXPECTED


def test_stage21_generated_uat_pack_uses_hancom_page_orientation_semantics(tmp_path):
    manifest = generate_pack(tmp_path)
    assert len(manifest["documents"]) == 9

    for doc in manifest["documents"]:
        key = doc["key"]
        expected = EXPECTED[key]
        landscape, width, height = _page_pr(tmp_path / doc["file"])

        assert width == A4_WIDTH
        assert height == A4_HEIGHT
        assert landscape == ("WIDELY" if expected == "landscape" else "NARROWLY")
        assert doc["printDiagnostics"]["orientation"] == expected

        if expected == "landscape":
            assert doc["printDiagnostics"]["printableWidth"] > doc["printDiagnostics"]["printableHeight"]
        else:
            assert doc["printDiagnostics"]["printableWidth"] < doc["printDiagnostics"]["printableHeight"]
