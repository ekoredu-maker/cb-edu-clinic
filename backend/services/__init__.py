"""Service package bootstrap.

Stage19 installs the Hancom-compatible HWPX package wrapper before application
modules import create_native_hwpx from services.hwpx_native_service.
"""

from services import hwpx_hancom_compat as _hwpx_hancom_compat  # noqa: F401
