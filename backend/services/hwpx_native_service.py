from __future__ import annotations

from html import escape
from pathlib import Path
from typing import Any
import zipfile


MIMETYPE = "application/hwp+zip"


class NativeHwpxError(RuntimeError):
    pass


def _xml(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, int):
        value = f"{value:,}"
    return escape(str(value), quote=False)


def _paragraph(text: Any, pid: int, *, char_pr: int = 0, para_pr: int = 0, page_break: int = 0) -> str:
    return (
        f'<hp:p id="{pid}" paraPrIDRef="{para_pr}" styleIDRef="0" '
        f'pageBreak="{page_break}" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="{char_pr}"><hp:t>{_xml(text)}</hp:t></hp:run>'
        '</hp:p>'
    )


def _cell(text: Any, row: int, col: int, width: int, height: int, pid: int, *, header: bool = False) -> str:
    char_pr = 2 if header else 0
    para_pr = 2 if header else 0
    return (
        f'<hp:tc name="" header="{1 if header else 0}" hasMargin="0" protect="0" '
        'editable="0" dirty="0" borderFillIDRef="2">'
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" '
        'linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
        f'{_paragraph(text, pid, char_pr=char_pr, para_pr=para_pr)}'
        '</hp:subList>'
        f'<hp:cellAddr colAddr="{col}" rowAddr="{row}"/>'
        '<hp:cellSpan colSpan="1" rowSpan="1"/>'
        f'<hp:cellSz width="{width}" height="{height}"/>'
        '<hp:cellMargin left="180" right="180" top="100" bottom="100"/>'
        '</hp:tc>'
    )


def _table(columns: list[Any], rows: list[list[Any]], widths: list[int | float], table_id: int, pid_start: int, page_width: int) -> tuple[str, int]:
    col_count = max(1, len(columns))
    if len(widths) != col_count:
        widths = [1] * col_count
    total_weight = float(sum(float(x or 0) for x in widths) or col_count)
    cell_widths = [max(900, int(page_width * float(w or 0) / total_weight)) for w in widths]
    delta = page_width - sum(cell_widths)
    cell_widths[-1] += delta
    row_height = 2200
    all_rows = [list(columns)] + [list(r) for r in rows]
    pid = pid_start
    row_xml: list[str] = []
    for r_idx, row in enumerate(all_rows):
        cells: list[str] = []
        padded = row[:col_count] + [""] * max(0, col_count - len(row))
        for c_idx, value in enumerate(padded):
            cells.append(_cell(value, r_idx, c_idx, cell_widths[c_idx], row_height, pid, header=(r_idx == 0)))
            pid += 1
        row_xml.append('<hp:tr>' + ''.join(cells) + '</hp:tr>')
    table_height = row_height * len(all_rows)
    xml = (
        f'<hp:tbl id="{table_id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" '
        f'textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" '
        f'rowCnt="{len(all_rows)}" colCnt="{col_count}" cellSpacing="0" borderFillIDRef="2" noAdjust="0">'
        f'<hp:sz width="{page_width}" widthRelTo="ABSOLUTE" height="{table_height}" heightRelTo="ABSOLUTE" protect="0"/>'
        '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" '
        'vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
        '<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
        '<hp:inMargin left="0" right="0" top="0" bottom="0"/>'
        + ''.join(row_xml) +
        '</hp:tbl>'
    )
    return xml, pid


def _secpr(*, landscape: bool) -> str:
    width, height = (84188, 59528) if landscape else (59528, 84188)
    margin_lr = 4252 if landscape else 5669
    margin_tb = 4252
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
        f'<hp:pagePr landscape="{ "WIDELY" if landscape else "NARROWLY" }" width="{width}" height="{height}" gutterType="LEFT_ONLY">'
        f'<hp:margin header="2835" footer="2835" gutter="0" left="{margin_lr}" right="{margin_lr}" top="{margin_tb}" bottom="{margin_tb}"/>'
        '</hp:pagePr>'
        '</hp:secPr>'
        '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>'
        '</hp:run></hp:p>'
    )


def _header_xml() -> str:
    langs = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]
    fontfaces = ''.join(
        f'<hh:fontface lang="{lang}" fontCnt="1"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/></hh:fontface>'
        for lang in langs
    )
    char_prs = []
    for cid, height, bold in [(0, 900, False), (1, 1600, True), (2, 900, True)]:
        bold_xml = '<hh:bold/>' if bold else ''
        char_prs.append(
            f'<hh:charPr id="{cid}" height="{height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">'
            '<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
            '<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
            '<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
            '<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>'
            '<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>'
            f'{bold_xml}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/>'
            '<hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/>'
            '</hh:charPr>'
        )
    para = (
        '<hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
        '<hh:align horizontal="LEFT" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
        '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>'
        '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
        '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/></hh:paraPr>'
        '<hh:paraPr id="1" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
        '<hh:align horizontal="CENTER" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>'
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
        '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>'
        '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
        '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/></hh:paraPr>'
        '<hh:paraPr id="2" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">'
        '<hh:align horizontal="CENTER" vertical="CENTER"/><hh:heading type="NONE" idRef="0" level="0"/>'
        '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>'
        '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>'
        '<hh:lineSpacing type="PERCENT" value="130" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>'
        '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/></hh:paraPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.5" secCnt="1">'
        '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>'
        '<hh:refList>'
        f'<hh:fontfaces itemCnt="7">{fontfaces}</hh:fontfaces>'
        '<hh:borderFills itemCnt="2">'
        '<hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="NONE" width="0.1 mm" color="#000000"/>'
        '</hh:borderFill>'
        '<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">'
        '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>'
        '<hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:diagonal type="NONE" width="0.12 mm" color="#000000"/>'
        '</hh:borderFill></hh:borderFills>'
        f'<hh:charProperties itemCnt="3">{"".join(char_prs)}</hh:charProperties>'
        '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
        f'<hh:paraProperties itemCnt="3">{para}</hh:paraProperties>'
        '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>'
        '<hh:numberings itemCnt="0"/><hh:bullets itemCnt="0"/>'
        '</hh:refList></hh:head>'
    )


def _section_xml(model: dict[str, Any]) -> str:
    key = str(model.get("key") or "")
    landscape = key in {"execution_report", "manager_book"}
    page_width = 75684 if landscape else 48190
    pid = 1000000010
    body: list[str] = [_secpr(landscape=landscape)]
    body.append(_paragraph(model.get("title") or "", pid, char_pr=1, para_pr=1)); pid += 1
    for pair in model.get("meta") or []:
        if isinstance(pair, (list, tuple)) and len(pair) >= 2:
            body.append(_paragraph(f"{pair[0]}: {pair[1]}", pid)); pid += 1
    body.append(_paragraph("", pid)); pid += 1

    columns = list(model.get("columns") or [])
    rows = [list(x) for x in (model.get("rows") or [])]
    if model.get("summaryRow") is not None:
        rows.append(list(model.get("summaryRow") or []))
    widths = list((model.get("contract") or {}).get("columnWidths") or [1] * max(1, len(columns)))
    table_xml, pid = _table(columns, rows, widths, 1000001000, pid, page_width)
    body.append(
        f'<hp:p id="{pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
        f'<hp:run charPrIDRef="0">{table_xml}</hp:run></hp:p>'
    ); pid += 1

    summary = model.get("summary") or []
    if summary:
        sum_columns = ["항목", "금액"]
        sum_rows = [[x[0], x[1]] for x in summary if isinstance(x, (list, tuple)) and len(x) >= 2]
        sum_xml, pid = _table(sum_columns, sum_rows, [4, 2], 1000002000, pid, min(page_width, 32000))
        body.append(
            f'<hp:p id="{pid}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">'
            f'<hp:run charPrIDRef="0">{sum_xml}</hp:run></hp:p>'
        ); pid += 1

    if model.get("footer"):
        body.append(_paragraph(model["footer"], pid)); pid += 1

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


def create_native_hwpx(output_path: str | Path, model: dict[str, Any]) -> Path:
    columns = model.get("columns")
    if not isinstance(columns, list) or not columns:
        raise NativeHwpxError("문서모델에 columns가 없습니다.")
    rows = model.get("rows")
    if not isinstance(rows, list):
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
    preview = str(model.get("title") or "")

    with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("mimetype", MIMETYPE, compress_type=zipfile.ZIP_STORED)
        zout.writestr("META-INF/container.xml", container)
        zout.writestr("Contents/content.hpf", _content_hpf(str(model.get("title") or "")))
        zout.writestr("Contents/header.xml", _header_xml())
        zout.writestr("Contents/section0.xml", _section_xml(model))
        zout.writestr("Contents/settings.xml", settings)
        zout.writestr("version.xml", version)
        zout.writestr("Preview/PrvText.txt", preview)

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
    return {"ok": True, "entries": len(names), "mimetypeFirst": True, "storedMimetype": True}
