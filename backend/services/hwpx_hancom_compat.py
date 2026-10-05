from __future__ import annotations

"""Hancom-compatible package wrapper for the native HWPX renderer.

Stage18 proved that the generated XML/table structure matched the embedded HTML
contracts, but real Hancom Office rejected the minimal ZIP package as damaged.
This module keeps the existing section/table renderer and replaces only the
outer OWPML package/header envelope with the structure observed in a real
Hancom-saved HWPX file.

It intentionally does not claim Hancom validation until a human opens the UAT
samples in Hancom Office.  The goal here is to remove known package-level
incompatibilities before that UAT.
"""

from html import escape
from pathlib import Path
from typing import Any
import re
import zipfile

from services import hwpx_native_service as legacy


MIMETYPE = legacy.MIMETYPE
NativeHwpxError = legacy.NativeHwpxError

_FULL_NS = (
    'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
    'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" '
    'xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" '
    'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" '
    'xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" '
    'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" '
    'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" '
    'xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" '
    'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" '
    'xmlns:opf="http://www.idpf.org/2007/opf/" '
    'xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" '
    'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" '
    'xmlns:epub="http://www.idpf.org/2007/ops" '
    'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"'
)


def _compat_header(model: dict[str, Any]) -> str:
    header = legacy._header_xml(model)
    header = re.sub(
        r'<hh:head\s+xmlns:hh="[^"]+"\s+xmlns:hc="[^"]+"\s+version="[^"]+"\s+secCnt="[^"]+">',
        f'<hh:head {_FULL_NS} version="1.4" secCnt="1">',
        header,
        count=1,
    )
    tail = (
        '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>'
        '<hh:docOption><hh:linkinfo path="" pageInherit="1" footnoteInherit="0"/></hh:docOption>'
        '<hh:trackchageConfig flags="56"/>'
    )
    if '<hh:compatibleDocument' not in header:
        header = header.replace('</hh:head>', tail + '</hh:head>')
    return header.replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
        1,
    )


def _compat_section(model: dict[str, Any]) -> str:
    section = legacy._section_xml(model)
    section = re.sub(r'<hs:sec\s+[^>]*>', f'<hs:sec {_FULL_NS}>', section, count=1)
    section = section.replace('outlineShapeIDRef="1"', 'outlineShapeIDRef="2"')
    return section.replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
        1,
    )


def _content_hpf(title: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        f'<opf:package {_FULL_NS} version="" unique-identifier="" id="">'
        '<opf:metadata>'
        f'<opf:title>{escape(title or "")}</opf:title><opf:language>ko</opf:language>'
        '<opf:meta name="creator" content="text">CB Edu Clinic V13</opf:meta>'
        '<opf:meta name="subject" content="text"/><opf:meta name="description" content="text"/>'
        '<opf:meta name="lastsaveby" content="text">CB Edu Clinic V13</opf:meta>'
        '<opf:meta name="keyword" content="text"/>'
        '</opf:metadata>'
        '<opf:manifest>'
        '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
        '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
        '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>'
        '</opf:manifest>'
        '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>'
        '</opf:package>'
    )


def _container_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" '
        'xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">'
        '<ocf:rootfiles>'
        '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>'
        '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>'
        '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>'
        '</ocf:rootfiles></ocf:container>'
    )


def _container_rdf() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" '
        'rdf:resource="Contents/header.xml"/></rdf:Description>'
        '<rdf:Description rdf:about="Contents/header.xml"><rdf:type '
        'rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile"/></rdf:Description>'
        '<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" '
        'rdf:resource="Contents/section0.xml"/></rdf:Description>'
        '<rdf:Description rdf:about="Contents/section0.xml"><rdf:type '
        'rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile"/></rdf:Description>'
        '<rdf:Description rdf:about=""><rdf:type '
        'rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description>'
        '</rdf:RDF>'
    )


def _manifest_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'
    )


def _settings_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" '
        'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">'
        '<ha:CaretPosition listIDRef="0" paraIDRef="1000000000" pos="0"/>'
        '<config:config-item-set name="PrintInfo">'
        '<config:config-item name="PrintAutoFootNote" type="boolean">false</config:config-item>'
        '<config:config-item name="PrintAutoHeadNote" type="boolean">false</config:config-item>'
        '<config:config-item name="PrintMethod" type="short">0</config:config-item>'
        '<config:config-item name="OverlapSize" type="short">0</config:config-item>'
        '<config:config-item name="PrintCropMark" type="short">0</config:config-item>'
        '<config:config-item name="BinderHoleType" type="short">0</config:config-item>'
        '<config:config-item name="ZoomX" type="short">100</config:config-item>'
        '<config:config-item name="ZoomY" type="short">100</config:config-item>'
        '</config:config-item-set></ha:HWPApplicationSetting>'
    )


def _version_xml() -> str:
    # Mirrors the namespace/attribute shape emitted by Hancom Office Hangul.
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
        '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" '
        'tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" '
        'xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 8362 WIN32LEWindows_10"/>'
    )


def validate_native_hwpx(path: str | Path) -> dict[str, Any]:
    src = Path(path)
    if not zipfile.is_zipfile(src):
        raise NativeHwpxError("생성된 파일이 ZIP/HWPX 패키지가 아닙니다.")
    required = {
        'mimetype', 'version.xml', 'settings.xml',
        'META-INF/container.xml', 'META-INF/manifest.xml', 'META-INF/container.rdf',
        'Contents/content.hpf', 'Contents/header.xml', 'Contents/section0.xml',
        'Preview/PrvText.txt',
    }
    with zipfile.ZipFile(src, 'r') as zin:
        names = zin.namelist()
        missing = sorted(required - set(names))
        if missing:
            raise NativeHwpxError(f"HWPX 한컴 호환 필수 파트 누락: {missing}")
        if names[0] != 'mimetype' or zin.getinfo('mimetype').compress_type != zipfile.ZIP_STORED:
            raise NativeHwpxError('mimetype는 ZIP 첫 엔트리이며 무압축이어야 합니다.')
        if zin.read('mimetype').decode('utf-8') != MIMETYPE:
            raise NativeHwpxError('HWPX mimetype 값이 올바르지 않습니다.')
        version = zin.read('version.xml').decode('utf-8')
        header = zin.read('Contents/header.xml').decode('utf-8')
        section = zin.read('Contents/section0.xml').decode('utf-8')
        content = zin.read('Contents/content.hpf').decode('utf-8')
        if 'hwpml/2011/version' not in version or 'xmlVersion="1.4"' not in version:
            raise NativeHwpxError('version.xml이 한컴 저장형식과 맞지 않습니다.')
        if '<hh:compatibleDocument' not in header or '<hh:docOption>' not in header:
            raise NativeHwpxError('header.xml 한컴 호환요소가 없습니다.')
        if 'Contents/header.xml' not in content or 'Contents/section0.xml' not in content:
            raise NativeHwpxError('content.hpf의 패키지 참조가 올바르지 않습니다.')
        if '<hp:secPr' not in section or '<hp:tbl' not in section:
            raise NativeHwpxError('section0.xml의 구역설정 또는 표가 없습니다.')
        orientation = 'landscape' if 'landscape="WIDELY"' in section else 'portrait'
    return {
        'ok': True,
        'entries': len(names),
        'mimetypeFirst': True,
        'storedMimetype': True,
        'hancomPackageShape': True,
        'orientation': orientation,
    }


def create_native_hwpx(output_path: str | Path, model: dict[str, Any]) -> Path:
    tables = model.get('tables')
    columns = model.get('columns')
    has_table = isinstance(tables, list) and bool(tables)
    if not has_table and (not isinstance(columns, list) or not columns):
        raise NativeHwpxError('문서모델에 columns/tables가 없습니다.')
    rows = model.get('rows')
    if not has_table and not isinstance(rows, list):
        raise NativeHwpxError('문서모델의 rows가 배열이 아닙니다.')

    dst = Path(output_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dst, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        zout.writestr('mimetype', MIMETYPE, compress_type=zipfile.ZIP_STORED)
        # Hancom-saved files keep version/settings at package root.
        zout.writestr('version.xml', _version_xml(), compress_type=zipfile.ZIP_STORED)
        zout.writestr('Contents/header.xml', _compat_header(model))
        zout.writestr('Contents/section0.xml', _compat_section(model))
        zout.writestr('Preview/PrvText.txt', legacy._preview_text(model))
        zout.writestr('settings.xml', _settings_xml())
        zout.writestr('META-INF/container.rdf', _container_rdf())
        zout.writestr('Contents/content.hpf', _content_hpf(str(model.get('title') or '')))
        zout.writestr('META-INF/container.xml', _container_xml())
        zout.writestr('META-INF/manifest.xml', _manifest_xml())
    validate_native_hwpx(dst)
    return dst


def install() -> None:
    """Patch the legacy module so existing imports transparently use Stage19."""
    legacy.create_native_hwpx = create_native_hwpx
    legacy.validate_native_hwpx = validate_native_hwpx


install()
