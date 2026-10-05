from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any
import math
import zipfile


MIMETYPE = "application/hwp+zip"
A4_PORTRAIT = (59528, 84188)
A4_LANDSCAPE = (84188, 59528)


class NativeHwpxError(RuntimeError):
    pass


def _xml(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, int):
        value = f"{value:,}"
    return escape(str(value), quote=False)


def _mm(value: Any, fallback: float = 0.0) -> int:
    try:
        return int(round(float(value) * 7200 / 25.4))
    except (TypeError, ValueError):
        return int(round(fallback * 7200 / 25.4))


def _profile(model: dict[str, Any]) -> dict[str, Any]:
    contract = model.get("contract") or {}
    raw = dict(contract.get("print") or {})
    landscape = bool(model.get("landscape", contract.get("landscape", False)))
    orientation = str(raw.get("orientation") or ("landscape" if landscape else "portrait")).lower()
    landscape = orientation == "landscape"

    margin = dict(raw.get("marginMm") or {})
    default_lr = 15.0 if not landscape else 12.0
    default_tb = 15.0 if not landscape else 10.0
    profile = {
        "landscape": landscape,
        "orientation": "landscape" if landscape else "portrait",
        "marginLeftMm": float(margin.get("left", default_lr)),
        "marginRightMm": float(margin.get("right", default_lr)),
        "marginTopMm": float(margin.get("top", default_tb)),
        "marginBottomMm": float(margin.get("bottom", default_tb)),
        "headerMm": float(raw.get("headerMm", 8.0)),
        "footerMm": float(raw.get("footerMm", 8.0)),
        "bodyPt": float(raw.get("bodyPt", 9.0)),
        "titlePt": float(raw.get("titlePt", 16.0)),
        "headerPt": float(raw.get("headerPt", 9.0)),
        "smallPt": float(raw.get("smallPt", 8.0)),
        "issuerPt": float(raw.get("issuerPt", 18.0)),
        "defaultRowMm": float(raw.get("defaultRowMm", 7.5)),
        "titleGapMm": float(raw.get("titleGapMm", 3.0)),
        "tableGapMm": float(raw.get("tableGapMm", 2.5)),
        "singlePageTarget": bool(raw.get("singlePageTarget", False)),
        "mergeEmptyTail": bool(raw.get("mergeEmptyTail", False)),
        "mergeBlankRows": bool(raw.get("mergeBlankRows", False)),
        "repeatHeader": bool(raw.get("repeatHeader", True)),
    }
    cell_margin = dict(raw.get("cellMarginMm") or {})
    profile["cellMargin"] = {
        "left": _mm(cell_margin.get("left", 1.2)),
        "right": _mm(cell_margin.get("right", 1.2)),
        "top": _mm(cell_margin.get("top", 0.7)),
        "bottom": _mm(cell_margin.get("bottom", 0.7)),
    }
    return profile


def _page_geometry(profile: dict[str, Any]) -> dict[str, int]:
    page_width, page_height = A4_LANDSCAPE if profile["landscape"] else A4_PORTRAIT
    left = _mm(profile["marginLeftMm"])
    right = _mm(profile["marginRightMm"])
    top = _mm(profile["marginTopMm"])
    bottom = _mm(profile["marginBottomMm"])
    return {
        "pageWidth": page_width,
        "pageHeight": page_height,
        "left": left,
        "right": right,
        "top": top,
        "bottom": bottom,
        "printableWidth": max(12000, page_width - left - right),
        "printableHeight": max(12000, page_height - top - bottom),
    }


def _paragraph(
    text: Any,
    pid: int,
    *,
    char_pr: int = 0,
    para_pr: int = 0,
    page_break: int = 0,
) -> str:
    return (
        f'<hp:p id="{pid}" paraPrIDRef="{para_pr}" styleIDRef="0" '
        f'pageBreak="{page_break}" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="{char_pr}"><hp:t>{_xml(text)}</hp:t></hp:run>'
        '</hp:p>'
    )


def _cell_text(text: Any, pid: int, *, char_pr: int, para_pr: int) -> tuple[str, int]:
    parts = str(text if text is not None else "").splitlines() or [""]
    out: list[str] = []
    for part in parts:
        out.append(_paragraph(part, pid, char_pr=char_pr, para_pr=para_pr))
        pid += 1
    return "".join(out), pid


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
) -> tuple[str, int]:
    char_pr = 2 if header else 0
    para_pr = 2 if header else 0
    cell_text, pid = _cell_text(text, pid, char_pr=char_pr, para_pr=para_pr)
    m = margin or {"left": 180, "right": 180, "top": 100, "bottom": 100}
    xml = (
        f'<hp:tc name="" header="{1 if header else 0}" hasMargin="0" protect="0" '
        'editable="0" dirty="0" borderFillIDRef="2">'
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" '
        'linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
        f'{cell_text}'
        '</hp:subList>'
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
) -> tuple[str, int]:
    padded = row[:col_count] + [""] * max(0, col_count - len(row))
    cells: list[str] = []

    if not is_header_row and merge_blank_rows and all(str(v or "").strip() == "" for v in padded):
        xml, pid = _cell(
            "",
            row_index,
            0,
            sum(cell_widths),
            height,
            pid,
            header=False,
            col_span=col_count,
            margin=margin,
        )
        return xml, pid

    merge_tail = (
        not is_header_row
        and merge_empty_tail
        and col_count >= 4
        and str(padded[1] or "").strip() != ""
        and all(str(padded[i] or "").strip() == "" for i in range(2, col_count))
    )

    c_idx = 0
    while c_idx < col_count:
        if merge_tail and c_idx == 1:
            span = col_count - 1
            width = sum(cell_widths[c_idx:c_idx + span])
            xml, pid = _cell(
                padded[c_idx],
                row_index,
                c_idx,
                width,
                height,
                pid,
                header=False,
                col_span=span,
                margin=margin,
            )
            cells.append(xml)
            c_idx += span
            continue

        value = padded[c_idx]
        is_header = is_header_row or (c_idx in label_cols and bool(str(value or "").strip()))
        xml, pid = _cell(
            value,
            row_index,
            c_idx,
            cell_widths[c_idx],
            height,
            pid,
            header=is_header,
            margin=margin,
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
    default_height = _mm(profile["defaultRowMm"], 7.5)
    all_rows = ([list(columns)] if show_header else []) + [list(r) for r in rows]
    pid = pid_start
    row_xml: list[str] = []
    total_height = 0
    merge_empty_tail = profile["mergeEmptyTail"] if merge_empty_tail is None else merge_empty_tail
    merge_blank_rows = profile["mergeBlankRows"] if merge_blank_rows is None else merge_blank_rows

    for r_idx, row in enumerate(all_rows):
        data_idx = r_idx - 1 if show_header else r_idx
        if show_header and r_idx == 0:
            height = max(_mm(profile["defaultRowMm"], 7.5), _mm(6.0))
        elif row_heights and 0 <= data_idx < len(row_heights):
            height = max(_mm(4.2), int(row_heights[data_idx] or default_height))
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
        )
        row_xml.append('<hp:tr>' + cells + '</hp:tr>')

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
        + ''.join(row_xml) +
        '</hp:tbl>'
    )
    return xml, pid


def _secpr(profile: dict[str, Any], geometry: dict[str, int]) -> str:
    return (
        '<hp:p id="1000000000" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        '<hp:run charPrIDRef="0">'
        '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" '
        'tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">'
        '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>'
        '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>'
        '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" '
        'hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>'
        '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>'
        f'<hp:pagePr landscape="{"WIDELY" if profile["landscape"] else "NARROWLY"}" '
        f'width="{geometry["pageWidth"]}" height="{geometry["pageHeight"]}" gutterType="LEFT_ONLY">'
        f'<hp:margin header="{_mm(profile["headerMm"])}" footer="{_mm(profile["footerMm"])}" gutter="0" '
        f'left="{geometry["left"]}" right="{geometry["right"]}" top="{geometry["top"]}" bottom="{geometry["bottom"]}"/>'
        '</hp:pagePr>'
        '</hp:secPr>'
        '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>'
        '</hp:run></hp:p>'
    )


def _char_pr(cid: int, pt: float, bold: bool = False) -> str:
    height = max(600, int(round(pt * 100)))
    bold_xml = '<hh:bold/>' if bold else ''
    return (
        f'<hh:charPr id="{cid}" height="{height}" textColor="#000000" shadeColor="none" '
        'useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">'
        '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
        '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
        '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
        '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
        '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
        f'{bold_xml}<hh:underline type="NONE" shape="SOLID" color="#000000"/>'
        '<hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/>'
        '<hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>'
        '</hh:charPr>'
    )


def _para_pr(pid: int, horizontal: str, *, line_spacing: int = 150) -> str:
    return (
        f'<hh:paraPr id="{pid}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" '
        'suppressLineNumbers="0" checked="0">'
        f'<hh:align horizontal="{horizontal}" vertical="BASELINE"/>'
        '<hh:heading type="NONE" idRef="0" level="0"/>'
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" '
        'keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
        '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/>'
        '<hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/>'
        '<hc:next value="0" unit="HWPUNIT"/></hh:margin>'
        f'<hh:lineSpacing type="PERCENT" value="{line_spacing}" unit="HWPUNIT"/>'
        '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" '
        'connect="0" ignoreMargin="0"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/>'
        '</hh:paraPr>'
    )


def _header_xml(model: dict[str, Any]) -> str:
    profile = _profile(model)
    langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
    fontfaces = ''.join(
        f'<hh:fontface lang="{lang}" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>'
        for lang in langs
    )
    char_prs = ''.join([
        _char_pr(0, profile["bodyPt"], False),
        _char_pr(1, profile["titlePt"], True),
        _char_pr(2, profile["headerPt"], True),
        _char_pr(3, profile["smallPt"], False),
        _char_pr(4, profile["issuerPt"], True),
    ])
    para = ''.join([
        _para_pr(0, "LEFT", line_spacing=145),
        _para_pr(1, "CENTER", line_spacing=145),
        _para_pr(2, "CENTER", line_spacing=125),
        _para_pr(3, "RIGHT", line_spacing=145),
    ])
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
        'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.5" secCnt="1">'
        '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
        '<hh:refList>'
        f'<hh:fontfaces itemCnt="7">{fontfaces}</hh:fontfaces>'
        '<hh:borderFills itemCnt="2">'
        '<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>'
        '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>'
        '<hh:diagonal type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>'
        '<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        '<hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/>'
        '<hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/>'
        '<hh:diagonal type="NONE" width="0.12 mm" color="#000000"/></hh:borderFill>'
        '</hh:borderFills>'
        f'<hh:charProperties itemCnt="5">{char_prs}</hh:charProperties>'
        '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
        f'<hh:paraProperties itemCnt="4">{para}</hh:paraProperties>'
        '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" '
        'paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>'
        '<hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/>'
        '</hh:refList></hh:head>'
    )


def re_issuer_like(value: Any) -> bool:
    text = str(value or "")
    return text.endswith("교육지원청교육장") or text.endswith("교육장")


def _after_paragraph_style(text: Any) -> tuple[int, int]:
    value = str(text or "").strip()
    if value == "[직인]":
        return 3, 1
    if re_issuer_like(value):
        return 4, 1
    if value.endswith("일") and "년" in value and "월" in value:
        return 0, 1
    if value.startswith("신청인:") or value.startswith("담 당 자:") or value.startswith("확 인 자:"):
        return 0, 3
    if value.endswith("귀하"):
        return 2, 1
    return 0, 0


def _table_specs(model: dict[str, Any]) -> list[dict[str, Any]]:
    contract = model.get("contract") or {}
    tables = model.get("tables")
    if isinstance(tables, list) and tables:
        return [dict(x) for x in tables]
    return [{
        "columns": model.get("columns") or [],
        "rows": model.get("rows") or [],
        "widths": contract.get("columnWidths") or [],
        "showHeader": model.get("showHeader", contract.get("showHeader", True)),
        "labelColumns": model.get("labelColumns", contract.get("labelColumns", [])),
        "rowHeights": model.get("rowHeights") or [],
    }]


def _section_xml(model: dict[str, Any]) -> str:
    contract = model.get("contract") or {}
    profile = _profile(model)
    geometry = _page_geometry(profile)
    page_width = geometry["printableWidth"]
    pid = 1000000010
    body: list[str] = [_secpr(profile, geometry)]

    body.append(_paragraph(model.get("title") or "", pid, char_pr=1, para_pr=1))
    pid += 1
    if profile["titleGapMm"] > 0:
        body.append(_paragraph("", pid, char_pr=3, para_pr=1))
        pid += 1

    for pair in model.get("meta") or []:
        if isinstance(pair, (list, tuple)) and len(pair) >= 2:
            body.append(_paragraph(f"{pair[0]}: {pair[1]}", pid, char_pr=3))
            pid += 1
    for text in model.get("paragraphsBefore") or []:
        body.append(_paragraph(text, pid))
        pid += 1
    if model.get("meta") or model.get("paragraphsBefore"):
        body.append(_paragraph("", pid, char_pr=3))
        pid += 1

    tables = _table_specs(model)
    for index, table in enumerate(tables):
        if table.get("title"):
            body.append(_paragraph(table.get("title"), pid, char_pr=2))
            pid += 1
        columns = list(table.get("columns") or [])
        rows = [list(x) for x in (table.get("rows") or [])]
        if index == 0 and model.get("summaryRow") is not None and len(tables) == 1:
            rows.append(list(model.get("summaryRow") or []))
        if not columns:
            continue
        widths = list(table.get("widths") or contract.get("columnWidths") or [1] * len(columns))
        show_header = bool(table.get("showHeader", True))
        label_cols = {int(x) for x in (table.get("labelColumns") or [])}
        row_heights = [int(x) for x in (table.get("rowHeights") or [])]
        table_xml, pid = _table(
            columns,
            rows,
            widths,
            1000001000 + index,
            pid,
            page_width,
            profile,
            show_header=show_header,
            label_cols=label_cols,
            row_heights=row_heights,
            merge_empty_tail=table.get("mergeEmptyTail"),
            merge_blank_rows=table.get("mergeBlankRows"),
        )
        body.append(
            f'<hp:p id="{pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
            f'<hp:run charPrIDRef="0">{table_xml}</hp:run></hp:p>'
        )
        pid += 1
        body.append(_paragraph("", pid, char_pr=3))
        pid += 1

    summary = model.get("summary") or []
    if summary:
        sum_columns = ["항목", "금액"]
        sum_rows = [[x[0], x[1]] for x in summary if isinstance(x, (list, tuple)) and len(x) >= 2]
        sum_width = min(page_width, int(page_width * 0.66))
        sum_xml, pid = _table(
            sum_columns,
            sum_rows,
            [4, 2],
            1000002000,
            pid,
            sum_width,
            profile,
            show_header=True,
            merge_empty_tail=False,
            merge_blank_rows=False,
        )
        body.append(
            f'<hp:p id="{pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
            f'<hp:run charPrIDRef="0">{sum_xml}</hp:run></hp:p>'
        )
        pid += 1
        body.append(_paragraph("", pid, char_pr=3))
        pid += 1

    for text in model.get("paragraphsAfter") or []:
        char_pr, para_pr = _after_paragraph_style(text)
        body.append(_paragraph(text, pid, char_pr=char_pr, para_pr=para_pr))
        pid += 1

    if model.get("footer"):
        body.append(_paragraph(model["footer"], pid, char_pr=3))
        pid += 1

    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
        'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
        'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">'
        + ''.join(body) +
        '</hs:sec>'
    )


def _content_hpf(title: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="1.0">'
        '<opf:metadata>'
        f'<dc:title>{_xml(title)}</dc:title><dc:creator>CB Edu Clinic V13</dc:creator><dc:language>ko-KR</dc:language>'
        '</opf:metadata>'
        '<opf:manifest>'
        '<opf:item id="header" href="header.xml" media-type="application/xml"/>'
        '<opf:item id="section0" href="section0.xml" media-type="application/xml"/>'
        '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>'
        '</opf:manifest>'
        '<opf:spine><opf:itemref idref="section0"/></opf:spine>'
        '</opf:package>'
    )


def _preview_text(model: dict[str, Any]) -> str:
    lines: list[str] = [str(model.get("title") or "")]
    for pair in model.get("meta") or []:
        if isinstance(pair, (list, tuple)) and len(pair) >= 2:
            lines.append(f"{pair[0]}: {pair[1]}")
    for table in _table_specs(model):
        if table.get("title"):
            lines.append(str(table["title"]))
        columns = table.get("columns") or []
        if table.get("showHeader", True):
            lines.append(" | ".join(str(x or "") for x in columns))
        for row in table.get("rows") or []:
            lines.append(" | ".join(str(x or "") for x in row))
    for text in model.get("paragraphsBefore") or []:
        lines.append(str(text))
    for text in model.get("paragraphsAfter") or []:
        lines.append(str(text))
    if model.get("footer"):
        lines.append(str(model["footer"]))
    return "\n".join(x for x in lines if x is not None)


def render_diagnostics(model: dict[str, Any]) -> dict[str, Any]:
    profile = _profile(model)
    geometry = _page_geometry(profile)
    table_height = 0
    table_count = 0
    for table in _table_specs(model):
        columns = list(table.get("columns") or [])
        if not columns:
            continue
        table_count += 1
        show_header = bool(table.get("showHeader", True))
        row_heights = [int(x) for x in (table.get("rowHeights") or [])]
        rows = list(table.get("rows") or [])
        default_height = _mm(profile["defaultRowMm"], 7.5)
        if show_header:
            table_height += max(default_height, _mm(6.0))
        for idx, _ in enumerate(rows):
            if idx < len(row_heights):
                table_height += max(_mm(4.2), int(row_heights[idx] or default_height))
            else:
                table_height += default_height
        table_height += _mm(profile["tableGapMm"])

    paragraph_count = (
        1
        + len(model.get("meta") or [])
        + len(model.get("paragraphsBefore") or [])
        + len(model.get("paragraphsAfter") or [])
        + (1 if model.get("footer") else 0)
    )
    paragraph_height = paragraph_count * _mm(max(4.5, profile["bodyPt"] * 0.5))
    if model.get("summary"):
        paragraph_height += _mm(profile["defaultRowMm"]) * (len(model["summary"]) + 1)
    estimated = table_height + paragraph_height + _mm(profile["titleGapMm"])
    page_count = max(1, int(math.ceil(estimated / max(1, geometry["printableHeight"]))))
    return {
        "orientation": profile["orientation"],
        "pageWidth": geometry["pageWidth"],
        "pageHeight": geometry["pageHeight"],
        "printableWidth": geometry["printableWidth"],
        "printableHeight": geometry["printableHeight"],
        "tableCount": table_count,
        "estimatedContentHeight": estimated,
        "estimatedPageCount": page_count,
        "singlePageTarget": profile["singlePageTarget"],
        "fitSinglePage": estimated <= geometry["printableHeight"],
        "mergeEmptyTail": profile["mergeEmptyTail"],
        "mergeBlankRows": profile["mergeBlankRows"],
    }


def create_native_hwpx(output_path: str | Path, model: dict[str, Any]) -> Path:
    tables = model.get("tables")
    columns = model.get("columns")
    has_table = isinstance(tables, list) and bool(tables)
    if not has_table and (not isinstance(columns, list) or not columns):
        raise NativeHwpxError("문서모델에 columns/tables가 없습니다.")
    rows = model.get("rows")
    if not has_table and not isinstance(rows, list):
        raise NativeHwpxError("문서모델의 rows가 배열이 아닙니다.")

    dst = Path(output_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    container = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container">'
        '<ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles>'
        '</ocf:container>'
    )
    settings = '<?xml version="1.0" encoding="UTF-8"?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"/>'
    version = '<?xml version="1.0" encoding="UTF-8"?><ha:HCFVersion xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" targetApplication="WORDPROC" major="5" minor="1" micro="0" buildNumber="0" os="Windows"/>'

    with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("mimetype", MIMETYPE, compress_type=zipfile.ZIP_STORED)
        zout.writestr("META-INF/container.xml", container)
        zout.writestr("Contents/content.hpf", _content_hpf(str(model.get("title") or "")))
        zout.writestr("Contents/header.xml", _header_xml(model))
        zout.writestr("Contents/section0.xml", _section_xml(model))
        zout.writestr("Contents/settings.xml", settings)
        zout.writestr("version.xml", version)
        zout.writestr("Preview/PrvText.txt", _preview_text(model))

    validate_native_hwpx(dst)
    return dst


def validate_native_hwpx(path: str | Path) -> dict[str, Any]:
    src = Path(path)
    if not zipfile.is_zipfile(src):
        raise NativeHwpxError("생성된 파일이 ZIP/HWPX 패키지가 아닙니다.")
    required = {
        "mimetype", "META-INF/container.xml", "Contents/content.hpf", "Contents/header.xml",
        "Contents/section0.xml", "Contents/settings.xml", "version.xml",
    }
    with zipfile.ZipFile(src, "r") as zin:
        names = zin.namelist()
        missing = sorted(required - set(names))
        if missing:
            raise NativeHwpxError(f"HWPX 필수 파트 누락: {missing}")
        if not names or names[0] != "mimetype":
            raise NativeHwpxError("mimetype가 ZIP 첫 엔트리가 아닙니다.")
        info = zin.getinfo("mimetype")
        if info.compress_type != zipfile.ZIP_STORED:
            raise NativeHwpxError("mimetype는 무압축이어야 합니다.")
        if zin.read("mimetype").decode("utf-8") != MIMETYPE:
            raise NativeHwpxError("HWPX mimetype 값이 올바르지 않습니다.")
        section = zin.read("Contents/section0.xml").decode("utf-8")
        if "<hp:secPr" not in section or "<hp:tbl" not in section:
            raise NativeHwpxError("section0.xml의 구역설정 또는 표가 없습니다.")
        orientation = "landscape" if 'landscape="WIDELY"' in section else "portrait"
    return {
        "ok": True,
        "entries": len(names),
        "mimetypeFirst": True,
        "storedMimetype": True,
        "orientation": orientation,
    }
