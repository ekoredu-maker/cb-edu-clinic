from __future__ import annotations

"""Stage20 visual polish for native HWPX output.

This module changes only presentation. Business values, rows and print-contract
column structures remain owned by the existing document models.  The Stage19
Hancom-compatible package wrapper remains the outer file envelope.
"""

from typing import Any

from services import hwpx_native_service as legacy
from services.print_contract import get_print_contract


_BASE_PROFILE = legacy._profile


def _profile(model: dict[str, Any]) -> dict[str, Any]:
    profile = dict(_BASE_PROFILE(model))
    key = str(model.get("key") or "")
    kind = str(model.get("kind") or "coach")
    try:
        polish = dict(get_print_contract(key, kind=kind).get("print") or {})
    except Exception:
        polish = {}

    for name in (
        "titlePt", "bodyPt", "headerPt", "smallPt", "issuerPt",
        "defaultRowMm", "titleGapMm", "tableGapMm",
    ):
        if name in polish:
            profile[name] = float(polish[name])

    if "cellMarginMm" in polish:
        cm = polish.get("cellMarginMm") or {}
        profile["cellMargin"] = {
            "left": legacy._mm(cm.get("left", 1.0)),
            "right": legacy._mm(cm.get("right", 1.0)),
            "top": legacy._mm(cm.get("top", 0.6)),
            "bottom": legacy._mm(cm.get("bottom", 0.6)),
        }

    profile["headerFill"] = str(polish.get("headerFill") or "#E8F0F7")
    profile["labelFill"] = str(polish.get("labelFill") or "#F4F6F8")
    profile["zebraFill"] = str(polish.get("zebraFill") or "#FAFBFC")
    profile["accentFill"] = str(polish.get("accentFill") or "#FFF4CC")
    profile["borderColor"] = str(polish.get("borderColor") or "#7D8892")
    profile["centerColumns"] = {int(x) for x in (polish.get("centerColumns") or [])}
    profile["rightColumns"] = {int(x) for x in (polish.get("rightColumns") or [])}
    profile["summaryRightColumn"] = int(polish.get("summaryRightColumn", 1))
    profile["highlightSummaryLast"] = bool(polish.get("highlightSummaryLast", True))
    profile["highlightLastRow"] = bool(polish.get("highlightLastRow", False))
    profile["summaryWidthRatio"] = float(polish.get("summaryWidthRatio", 0.66))
    return profile


def _char_pr(
    cid: int,
    pt: float,
    bold: bool = False,
    *,
    font_id: int = 0,
    text_color: str = "#000000",
) -> str:
    height = max(600, int(round(pt * 100)))
    bold_xml = "<hh:bold/>" if bold else ""
    return (
        f'<hh:charPr id="{cid}" height="{height}" textColor="{text_color}" shadeColor="none" '
        'useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">'
        f'<hh:fontRef hangul="{font_id}" latin="{font_id}" hanja="{font_id}" japanese="{font_id}" '
        f'other="{font_id}" symbol="{font_id}" user="{font_id}"/>'
        '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
        '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
        '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
        '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
        f'{bold_xml}<hh:underline type="NONE" shape="SOLID" color="#000000"/>'
        '<hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/>'
        '<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>'
        '</hh:charPr>'
    )


def _border_fill(fid: int, color: str, fill: str | None = None) -> str:
    brush = ""
    if fill:
        brush = f'<hc:fillBrush><hc:winBrush faceColor="{fill}" hatchColor="#000000" alpha="0"/></hc:fillBrush>'
    return (
        f'<hh:borderFill id="{fid}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        f'<hh:leftBorder type="SOLID" width="0.12 mm" color="{color}"/>'
        f'<hh:rightBorder type="SOLID" width="0.12 mm" color="{color}"/>'
        f'<hh:topBorder type="SOLID" width="0.12 mm" color="{color}"/>'
        f'<hh:bottomBorder type="SOLID" width="0.12 mm" color="{color}"/>'
        '<hh:diagonal type="NONE" width="0.12 mm" color="#000000"/>'
        f'{brush}</hh:borderFill>'
    )


def _header_xml(model: dict[str, Any]) -> str:
    profile = _profile(model)
    langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
    fontfaces = "".join(
        f'<hh:fontface lang="{lang}" fontCnt="2">'
        '<hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/>'
        '<hh:font id="1" face="함초롬돋움" type="TTF" isEmbedded="0"/>'
        '</hh:fontface>'
        for lang in langs
    )
    char_prs = "".join([
        _char_pr(0, profile["bodyPt"], False, font_id=0),
        _char_pr(1, profile["titlePt"], True, font_id=1, text_color="#243746"),
        _char_pr(2, profile["headerPt"], True, font_id=1, text_color="#243746"),
        _char_pr(3, profile["smallPt"], False, font_id=1, text_color="#53616D"),
        _char_pr(4, profile["issuerPt"], True, font_id=1),
        _char_pr(5, profile["bodyPt"], True, font_id=1, text_color="#243746"),
        _char_pr(6, profile["bodyPt"], True, font_id=1, text_color="#1E5631"),
    ])
    para = "".join([
        legacy._para_pr(0, "LEFT", line_spacing=145),
        legacy._para_pr(1, "CENTER", line_spacing=145),
        legacy._para_pr(2, "CENTER", line_spacing=125),
        legacy._para_pr(3, "RIGHT", line_spacing=145),
    ])
    border_color = profile["borderColor"]
    border_fills = (
        '<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>'
        '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>'
        '<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>'
        + _border_fill(2, border_color, "#FFFFFF")
        + _border_fill(3, border_color, profile["headerFill"])
        + _border_fill(4, border_color, profile["labelFill"])
        + _border_fill(5, border_color, profile["zebraFill"])
        + _border_fill(6, border_color, profile["accentFill"])
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
        'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.5" secCnt="1">'
        '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
        '<hh:refList>'
        f'<hh:fontfaces itemCnt="7">{fontfaces}</hh:fontfaces>'
        f'<hh:borderFills itemCnt="6">{border_fills}</hh:borderFills>'
        f'<hh:charProperties itemCnt="7">{char_prs}</hh:charProperties>'
        '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
        f'<hh:paraProperties itemCnt="4">{para}</hh:paraProperties>'
        '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" '
        'paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>'
        '<hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/>'
        '</hh:refList></hh:head>'
    )


def _cell(
    text: Any,
    row: int,
    col: int,
    width: int,
    height: int,
    pid: int,
    *,
    header: bool = False,
    col_span: int = 1,
    row_span: int = 1,
    margin: dict[str, int] | None = None,
    align: str = "left",
    style: str = "body",
) -> tuple[str, int]:
    if header:
        char_pr, para_pr, fill_id = 2, 2, 3
    elif style == "accent":
        char_pr, fill_id = 6, 6
        para_pr = 3 if align == "right" else (2 if align == "center" else 0)
    elif style == "label":
        char_pr, fill_id = 5, 4
        para_pr = 3 if align == "right" else (2 if align == "center" else 0)
    elif style == "zebra":
        char_pr, fill_id = 0, 5
        para_pr = 3 if align == "right" else (2 if align == "center" else 0)
    else:
        char_pr, fill_id = 0, 2
        para_pr = 3 if align == "right" else (2 if align == "center" else 0)

    cell_text, pid = legacy._cell_text(text, pid, char_pr=char_pr, para_pr=para_pr)
    m = margin or {"left": 180, "right": 180, "top": 100, "bottom": 100}
    xml = (
        f'<hp:tc name="" header="{1 if header else 0}" hasMargin="0" protect="0" '
        f'editable="0" dirty="0" borderFillIDRef="{fill_id}">'
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" '
        'linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
        f'{cell_text}</hp:subList>'
        f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>'
        f'<hp:cellSpan colSpan="{col_span}" rowSpan="{row_span}"/>'
        f'<hp:cellSz width="{width}" height="{height}"/>'
        f'<hp:cellMargin left="{m["left"]}" right="{m["right"]}" top="{m["top"]}" bottom="{m["bottom"]}"/>'
        '</hp:tc>'
    )
    return xml, pid


def _row_cells(
    row: list[Any],
    *,
    row_index: int,
    col_count: int,
    cell_widths: list[int],
    height: int,
    pid: int,
    is_header_row: bool,
    label_cols: set[int],
    merge_empty_tail: bool,
    merge_blank_rows: bool,
    margin: dict[str, int],
    profile: dict[str, Any],
    data_row_count: int,
    role: str,
) -> tuple[str, int]:
    padded = row[:col_count] + [""] * max(0, col_count - len(row))
    cells: list[str] = []

    if not is_header_row and merge_blank_rows and all(str(v or "").strip() == "" for v in padded):
        return _cell(
            "", row_index, 0, sum(cell_widths), height, pid,
            col_span=col_count, margin=margin, style="body",
        )

    merge_tail = (
        not is_header_row and merge_empty_tail and col_count >= 4
        and str(padded[1] or "").strip() != ""
        and all(str(padded[i] or "").strip() == "" for i in range(2, col_count))
    )
    data_idx = row_index - 1 if is_header_row is False else -1
    is_last_data = (not is_header_row and data_idx == data_row_count - 1)

    c_idx = 0
    while c_idx < col_count:
        if merge_tail and c_idx == 1:
            span = col_count - 1
            xml, pid = _cell(
                padded[c_idx], row_index, c_idx,
                sum(cell_widths[c_idx:c_idx + span]), height, pid,
                col_span=span, margin=margin, align="left", style="body",
            )
            cells.append(xml)
            c_idx += span
            continue

        value = padded[c_idx]
        is_label = c_idx in label_cols and bool(str(value or "").strip())
        if is_header_row:
            style = "header"
        elif role == "summary" and is_last_data and profile.get("highlightSummaryLast"):
            style = "accent"
        elif role == "main" and is_last_data and profile.get("highlightLastRow"):
            style = "accent"
        elif is_label:
            style = "label"
        elif row_index % 2 == 0:
            style = "zebra"
        else:
            style = "body"

        if is_header_row:
            align = "center"
        elif role == "summary" and c_idx == int(profile.get("summaryRightColumn", 1)):
            align = "right"
        elif c_idx in profile.get("rightColumns", set()):
            align = "right"
        elif c_idx in profile.get("centerColumns", set()):
            align = "center"
        else:
            align = "left"

        xml, pid = _cell(
            value, row_index, c_idx, cell_widths[c_idx], height, pid,
            header=is_header_row, margin=margin, align=align, style=style,
        )
        cells.append(xml)
        c_idx += 1
    return "".join(cells), pid


def _table(
    columns: list[Any],
    rows: list[list[Any]],
    widths: list[int | float],
    table_id: int,
    pid_start: int,
    page_width: int,
    profile: dict[str, Any],
    *,
    show_header: bool = True,
    label_cols: set[int] | None = None,
    row_heights: list[int] | None = None,
    merge_empty_tail: bool | None = None,
    merge_blank_rows: bool | None = None,
) -> tuple[str, int]:
    col_count = max(1, len(columns))
    if len(widths) != col_count:
        widths = [1] * col_count
    total_weight = float(sum(float(x or 0) for x in widths) or col_count)
    cell_widths = [max(700, int(page_width * float(w or 0) / total_weight)) for w in widths]
    cell_widths[-1] += page_width - sum(cell_widths)

    label_cols = label_cols or set()
    default_height = legacy._mm(profile["defaultRowMm"], 7.5)
    all_rows = ([list(columns)] if show_header else []) + [list(r) for r in rows]
    pid = pid_start
    row_xml: list[str] = []
    total_height = 0
    merge_empty_tail = profile["mergeEmptyTail"] if merge_empty_tail is None else merge_empty_tail
    merge_blank_rows = profile["mergeBlankRows"] if merge_blank_rows is None else merge_blank_rows
    role = "summary" if table_id == 1000002000 else "main"

    for r_idx, row in enumerate(all_rows):
        data_idx = r_idx - 1 if show_header else r_idx
        if show_header and r_idx == 0:
            height = max(legacy._mm(profile["defaultRowMm"], 7.5), legacy._mm(6.2))
        elif row_heights and 0 <= data_idx < len(row_heights):
            height = max(legacy._mm(4.2), int(row_heights[data_idx] or default_height))
        else:
            height = default_height
        total_height += height
        cells, pid = _row_cells(
            row,
            row_index=r_idx,
            col_count=col_count,
            cell_widths=cell_widths,
            height=height,
            pid=pid,
            is_header_row=bool(show_header and r_idx == 0),
            label_cols=label_cols,
            merge_empty_tail=bool(merge_empty_tail),
            merge_blank_rows=bool(merge_blank_rows),
            margin=profile["cellMargin"],
            profile=profile,
            data_row_count=len(rows),
            role=role,
        )
        row_xml.append("<hp:tr>" + cells + "</hp:tr>")

    xml = (
        f'<hp:tbl id="{table_id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" '
        f'textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" '
        f'repeatHeader="{1 if show_header and profile["repeatHeader"] else 0}" '
        f'rowCnt="{len(all_rows)}" colCnt="{col_count}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">'
        f'<hp:sz width="{page_width}" widthRelTo="ABSOLUTE" height="{total_height}" heightRelTo="ABSOLUTE" protect="0"/>'
        '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" '
        'vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
        '<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
        '<hp:inMargin left="0" right="0" top="0" bottom="0"/>'
        + "".join(row_xml) +
        '</hp:tbl>'
    )
    return xml, pid


def install() -> None:
    legacy._profile = _profile
    legacy._header_xml = _header_xml
    legacy._cell = _cell
    legacy._row_cells = _row_cells
    legacy._table = _table


install()
