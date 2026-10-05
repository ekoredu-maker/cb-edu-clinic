from __future__ import annotations

"""Stage18 document routing.

The legacy `document_model` functions are the detailed export models used by
Excel. Windows HWPX native output should use the HTML print schema instead.
This module captures the original functions first, then installs print-model
functions as the defaults exposed by `services.document_model`.

`backend.app` imports `document_context` before importing `document_model`, so
`document_context` imports this module once at startup and establishes the
routing before app-level function aliases are bound.
"""

from typing import Any

import services.document_model as document_model
from services.print_document_model import (
    execution_report_print_model,
    manager_book_print_model,
    pay_slip_print_model,
)


pay_slip_export_model = document_model.pay_slip_model
execution_report_export_model = document_model.execution_report_model
manager_book_export_model = document_model.manager_book_model


def _manager_print_default(state: dict[str, Any], staff_id: str, ym: str) -> dict[str, Any]:
    cfg = state.get("cfg") or {}
    kind = "class" if str(cfg.get("__v13ManagerKind") or "") == "class" else "coach"
    return manager_book_print_model(state, staff_id, ym, kind=kind)


def install_print_defaults() -> None:
    document_model.pay_slip_model = pay_slip_print_model
    document_model.execution_report_model = execution_report_print_model
    document_model.manager_book_model = _manager_print_default


install_print_defaults()
