from html_hwpx_parity_stage18 import EXPECTED_KEYS, run_parity


def test_stage18_html_to_hwpx_print_contract_parity(tmp_path):
    report = run_parity(tmp_path)
    assert report["stage"] == 18
    assert report["ok"] is True, report["errors"]
    assert set(report["documents"]) == set(EXPECTED_KEYS)
    assert all(item["ok"] for item in report["documents"].values())


def test_stage18_closes_stage17_layout_warnings(tmp_path):
    report = run_parity(tmp_path)
    assert report["warnings"] == []
    assert len(report["documents"]["pay_slip"]["checks"]) > 0
    assert len(report["documents"]["execution_report"]["checks"]) > 0
    manager_checks = report["documents"]["manager_book"]["checks"]
    assert any(item["check"] == "coach kind split" and item["ok"] for item in manager_checks)
    assert any(item["check"] == "class kind split" and item["ok"] for item in manager_checks)
