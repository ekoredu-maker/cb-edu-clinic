import { downloadBlob } from '../core/engine.js';
import { exportXlsx, readFirstSheetObjects } from './xlsx-lite.js';

export function exportJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, filename);
}

export function parseDelimitedText(text) {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines.shift(), delimiter).map((s) => s.trim());
  return lines.map((line) => {
    const values = splitCsvLine(line, delimiter);
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
  });
}

function splitCsvLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t');
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i += 1;
    } else if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === delimiter && !inQuote) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function rowsFromFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseDelimitedText(await file.text());
  }
  if (name.endsWith('.xlsx')) return readFirstSheetObjects(file);
  if (name.endsWith('.xls')) {
    throw new Error('구형 .xls 바이너리 파일은 브라우저 오프라인 파서에서 직접 읽지 않습니다. 엑셀에서 .xlsx 또는 .csv로 다시 저장한 뒤 가져와 주세요.');
  }
  throw new Error('지원하지 않는 파일 형식입니다. .xlsx, .csv, .tsv를 사용해 주세요.');
}

export function exportRowsXlsx({ filename, sheetName, headers, rows }) {
  exportXlsx({ filename, sheets: [{ name: sheetName, rows: [headers, ...rows] }] });
}

export function exportWorkbookXlsx({ filename, sheets }) {
  exportXlsx({ filename, sheets });
}
