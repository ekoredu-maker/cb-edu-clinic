"""Service package bootstrap.

Stage19 installs the Hancom-compatible HWPX package wrapper before application
modules import create_native_hwpx from services.hwpx_native_service.
Stage20 then applies presentation-only styles to the native renderer while
preserving the Stage19 package envelope and all business calculations.
"""

from services import hwpx_hancom_compat as _hwpx_hancom_compat  # noqa: F401
from services import hwpx_style_patch as _hwpx_style_patch  # noqa: F401
