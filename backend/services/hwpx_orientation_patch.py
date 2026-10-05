from __future__ import annotations

"""Stage21 page-orientation compatibility patch.

HWPX stores the physical paper width/height independently from the page
orientation flag.  For A4, both portrait and landscape documents keep
width=59528 and height=84188; landscape is represented by
pagePr@landscape="WIDELY".  The renderer still needs the rotated effective
canvas when calculating table widths/heights, so this patch separates the
stored paper geometry from the effective layout geometry.
"""

from typing import Any

from services import hwpx_native_service as legacy


A4_WIDTH = legacy.A4_PORTRAIT[0]
A4_HEIGHT = legacy.A4_PORTRAIT[1]


def _page_geometry(profile: dict[str, Any]) -> dict[str, int]:
    left = legacy._mm(profile["marginLeftMm"])
    right = legacy._mm(profile["marginRightMm"])
    top = legacy._mm(profile["marginTopMm"])
    bottom = legacy._mm(profile["marginBottomMm"])

    # HWPX stores the paper dimensions unrotated.  The landscape flag controls
    # orientation, while layout calculations use the rotated effective canvas.
    stored_width = A4_WIDTH
    stored_height = A4_HEIGHT
    effective_width = stored_height if profile["landscape"] else stored_width
    effective_height = stored_width if profile["landscape"] else stored_height

    return {
        "pageWidth": stored_width,
        "pageHeight": stored_height,
        "effectiveWidth": effective_width,
        "effectiveHeight": effective_height,
        "left": left,
        "right": right,
        "top": top,
        "bottom": bottom,
        "printableWidth": max(12000, effective_width - left - right),
        "printableHeight": max(12000, effective_height - top - bottom),
    }


def install() -> None:
    legacy._page_geometry = _page_geometry


install()
