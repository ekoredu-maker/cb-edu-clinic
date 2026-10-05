from html_hwpx_parity import EXPECTED_KEYS, run_parity


def test_stage17_html_to_hwpx_parity(tmp_path):
    report = run_parity(tmp_path)
    assert report["ok"] is True, report["errors"]
    assert set(report["documents"]) == set(EXPECTED_KEYS)
    assert all(item["ok"] for item in report["documents"].values())


def test_stage17_tracks_manager_kind_gap_as_warning(tmp_path):
    report = run_parity(tmp_path)
    warnings = report["documents"]["manager_book"]["warnings"]
    assert any("학습코칭/수업협력" in warning for warning in warnings)
