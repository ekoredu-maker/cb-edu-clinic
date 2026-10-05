from __future__ import annotations

"""Stage18 document routing.

The legacy `document_model` functions are the detailed export models used by
Excel.  Windows HWPX native output should use the HTML print schema instead.
This module captures the original functions first, then installs print-model
functions as the defaults exposed by `services.document_model`.

`backend.app` imports `document_context` before importing `document_model`, so
`document_context` imports this module once at startup and establishes the
routing before app-level function aliases are bound.
"""

import services.document_model as document_model
from services.print_document_model import (
    execution_report_print_model,
    manager_book_print_model,
    pay_slip_print_model,
)


pay_slip_export_model = document_model.pay_slip_model
execution_report_export_model = document_model.execution_report_model
manager_book_export_model = document_model.manager_book_model


def install_print_defaults() -> None:
    document_model.pay_slip_model = pay_slip_print_model
    document_model.execution_report_model = execution_report_print_model
    document_model.manager_book_model = manager_book_print_model


install_print_defaults()
