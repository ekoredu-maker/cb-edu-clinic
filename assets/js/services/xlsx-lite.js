import { downloadBlob } from '../core/engine.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function colName(n) {
  let s = '';
  let x = n + 1;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ -1) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function writeU16(arr, n) { arr.push(n & 255, (n >>> 8) & 255); }
function writeU32(arr, n) { arr.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255); }

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => { out.set(part, offset); offset += part.length; });
  return out;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, day } = dosTimeDate();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const local = [];
    writeU32(local, 0x04034b50); writeU16(local, 20); writeU16(local, 0); writeU16(local, 0);
    writeU16(local, time); writeU16(local, day); writeU32(local, crc); writeU32(local, data.length); writeU32(local, data.length);
    writeU16(local, nameBytes.length); writeU16(local, 0);
    const localBytes = concatBytes([new Uint8Array(local), nameBytes, data]);
    locals.push(localBytes);

    const central = [];
    writeU32(central, 0x02014b50); writeU16(central, 20); writeU16(central, 20); writeU16(central, 0); writeU16(central, 0);
    writeU16(central, time); writeU16(central, day); writeU32(central, crc); writeU32(central, data.length); writeU32(central, data.length);
    writeU16(central, nameBytes.length); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0); writeU16(central, 0);
    writeU32(central, 0); writeU32(central, offset);
    centrals.push(concatBytes([new Uint8Array(central), nameBytes]));
    offset += localBytes.length;
  });

  const centralDir = concatBytes(centrals);
  const end = [];
  writeU32(end, 0x06054b50); writeU16(end, 0); writeU16(end, 0); writeU16(end, files.length); writeU16(end, files.length);
  writeU32(end, centralDir.length); writeU32(end, offset); writeU16(end, 0);
  return concatBytes([...locals, centralDir, new Uint8Array(end)]);
}

function normalizeCell(cell) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell)) return cell;
  return { v: cell };
}

function cellXml(cellValue, rIndex, cIndex) {
  const cell = normalizeCell(cellValue);
  const ref = `${colName(cIndex)}${rIndex + 1}`;
  const style = Number.isInteger(cell.s) ? ` s="${cell.s}"` : '';
  if (cell.f) {
    const cached = cell.v == null ? '' : `<v>${xmlEscape(cell.v)}</v>`;
    return `<c r="${ref}"${style}><f>${xmlEscape(cell.f)}</f>${cached}</c>`;
  }
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return `<c r="${ref}"${style}><v>${cell.v}</v></c>`;
  if (cell.v instanceof Date) return `<c r="${ref}"${style} t="inlineStr"><is><t>${xmlEscape(cell.v.toISOString().slice(0, 10))}</t></is></c>`;
  const str = xmlEscape(cell.v ?? '');
  return `<c r="${ref}"${style} t="inlineStr"><is><t>${str}</t></is></c>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const cols = (sheet.cols || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(width) || 12}" customWidth="1"/>`).join('');
  const sheetViews = sheet.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${Number(sheet.freeze.y || 0)}" xSplit="${Number(sheet.freeze.x || 0)}" topLeftCell="${sheet.freeze.topLeftCell || 'A1'}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '';
  const body = rows.map((row, rIndex) => {
    const cells = Array.isArray(row) ? row : (row.cells || []);
    const attrs = [];
    if (row && !Array.isArray(row) && row.height) attrs.push(`ht="${Number(row.height)}" customHeight="1"`);
    return `<row r="${rIndex + 1}" ${attrs.join(' ')}>${cells.map((value, cIndex) => cellXml(value, rIndex, cIndex)).join('')}</row>`;
  }).join('');
  const mergeCells = (sheet.merges || []).length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${xmlEscape(ref)}"/>`).join('')}</mergeCells>` : '';
  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${xmlEscape(sheet.autoFilter)}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${sheetViews}
  ${cols ? `<cols>${cols}</cols>` : ''}
  <sheetData>${body}</sheetData>
  ${mergeCells}
  ${autoFilter}
  <pageMargins left="0.3" right="0.3" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;[Red]-#,##0;-"/></numFmts>
  <fonts count="6">
    <font><sz val="10"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="18"/><color rgb="FF1F3A8A"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="12"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/></font>
    <font><sz val="10"/><color rgb="FF444444"/><name val="Malgun Gothic"/></font>
    <font><b/><sz val="10"/><color rgb="FFB91C1C"/><name val="Malgun Gothic"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F7E8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border>
    <border><top style="medium"><color rgb="FF000000"/></top><bottom style="medium"><color rgb="FF000000"/></bottom><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="2" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

export function buildXlsx(sheets) {
  const safeSheets = sheets.map((sheet, index) => ({
    ...sheet,
    name: String(sheet.name || `Sheet${index + 1}`).replace(/[\\/?*\[\]:]/g, '').slice(0, 31) || `Sheet${index + 1}`,
    rows: sheet.rows || []
  }));

  const sheetEntries = safeSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheetXml(sheet) }));
  const workbookSheets = safeSheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const workbookRels = safeSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('') + '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  const overrides = safeSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');

  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}</Relationships>` },
    { name: 'xl/styles.xml', content: stylesXml() },
    ...sheetEntries
  ];
  return zipStore(files);
}

export function exportXlsx({ sheets, filename }) {
  const bytes = buildXlsx(sheets);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, filename);
}

function readU16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
function readU32(bytes, offset) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }

async function inflateRaw(data) {
  if (!('DecompressionStream' in window)) throw new Error('이 브라우저는 압축된 XLSX 해제를 지원하지 않습니다. CSV로 저장 후 가져오거나 최신 Chrome/Edge를 사용해 주세요.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('XLSX 파일 구조를 읽을 수 없습니다.');
  const count = readU16(bytes, eocd + 10);
  const centralOffset = readU32(bytes, eocd + 16);
  const files = new Map();
  let ptr = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (readU32(bytes, ptr) !== 0x02014b50) break;
    const method = readU16(bytes, ptr + 10);
    const compSize = readU32(bytes, ptr + 20);
    const nameLen = readU16(bytes, ptr + 28);
    const extraLen = readU16(bytes, ptr + 30);
    const commentLen = readU16(bytes, ptr + 32);
    const localOffset = readU32(bytes, ptr + 42);
    const name = decoder.decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));
    const localNameLen = readU16(bytes, localOffset + 26);
    const localExtraLen = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);
    let content;
    if (method === 0) content = data;
    else if (method === 8) content = await inflateRaw(data);
    else throw new Error(`지원하지 않는 XLSX 압축 방식입니다: ${method}`);
    files.set(name, content);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function textOfXml(bytes) { return decoder.decode(bytes || new Uint8Array()); }
function parseXml(text) { return new DOMParser().parseFromString(text, 'application/xml'); }
function cellIndex(ref) {
  const letters = String(ref || '').match(/[A-Z]+/)?.[0] || 'A';
  return [...letters].reduce((sum, ch) => sum * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

function sharedStrings(files) {
  const raw = files.get('xl/sharedStrings.xml');
  if (!raw) return [];
  const xml = parseXml(textOfXml(raw));
  return [...xml.getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent || '').join(''));
}

function firstWorksheetPath(files) {
  const workbookText = textOfXml(files.get('xl/workbook.xml'));
  const relText = textOfXml(files.get('xl/_rels/workbook.xml.rels'));
  if (!workbookText || !relText) return 'xl/worksheets/sheet1.xml';
  const workbookXml = parseXml(workbookText);
  const firstSheet = workbookXml.getElementsByTagName('sheet')[0];
  const rid = firstSheet?.getAttribute('r:id');
  if (!rid) return 'xl/worksheets/sheet1.xml';
  const relXml = parseXml(relText);
  const rel = [...relXml.getElementsByTagName('Relationship')].find((item) => item.getAttribute('Id') === rid);
  const target = rel?.getAttribute('Target') || 'worksheets/sheet1.xml';
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`.replace('xl//', 'xl/');
}

export async function readFirstSheetObjects(file) {
  const files = await unzip(await file.arrayBuffer());
  const strings = sharedStrings(files);
  const sheetPath = firstWorksheetPath(files);
  const sheetText = textOfXml(files.get(sheetPath) || files.get('xl/worksheets/sheet1.xml'));
  const xml = parseXml(sheetText);
  const rows = [...xml.getElementsByTagName('row')].map((row) => {
    const cells = [];
    [...row.getElementsByTagName('c')].forEach((cell) => {
      const idx = cellIndex(cell.getAttribute('r'));
      const type = cell.getAttribute('t');
      let value = '';
      if (type === 's') {
        const index = Number(cell.getElementsByTagName('v')[0]?.textContent || 0);
        value = strings[index] || '';
      } else if (type === 'inlineStr') {
        value = [...cell.getElementsByTagName('t')].map((t) => t.textContent || '').join('');
      } else {
        value = cell.getElementsByTagName('v')[0]?.textContent || '';
      }
      cells[idx] = value;
    });
    return cells.map((v) => v ?? '');
  }).filter((row) => row.some((cell) => String(cell).trim()));
  const headers = (rows.shift() || []).map((h) => String(h).trim());
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()])));
}
