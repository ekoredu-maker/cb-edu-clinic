import { getState } from '../core/store.js';
import { PythonBridge } from './python-bridge.js';

function notify(message, type='success') {
  if (typeof window.toast === 'function') window.toast(message, type);
  else console.log(`[${type}] ${message}`);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'output';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function download(path, payload) {
  const { blob, filename } = await PythonBridge.exportFile(path, payload);
  saveBlob(blob, filename);
  return filename;
}

export async function exportPaySlipHwpx() {
  if (!PythonBridge.isAvailable()) return notify('HWPX 출력은 Windows 하이브리드 버전에서 사용할 수 있습니다.', 'warning');
  const staffId = document.getElementById('pay-stf-sel')?.value || '';
  const ym = document.getElementById('pay-ym')?.value || '';
  if (!staffId || !ym) return notify('지원단과 대상 월을 선택하세요.', 'warning');
  try {
    const filename = await download('/api/export/pay_slip.hwpx', { state: getState(), staffId, ym });
    notify(`HWPX 생성 완료: ${filename}`, 'success');
  } catch (e) {
    notify(e.message || 'HWPX 생성에 실패했습니다.', 'warning');
  }
}

export async function exportExecutionHwpx() {
  if (!PythonBridge.isAvailable()) return notify('HWPX 출력은 Windows 하이브리드 버전에서 사용할 수 있습니다.', 'warning');
  const ym = document.getElementById('exec-ym')?.value || '';
  if (!ym) return notify('대상 월을 선택하세요.', 'warning');
  try {
    const filename = await download('/api/export/execution_report.hwpx', { state: getState(), ym });
    notify(`HWPX 생성 완료: ${filename}`, 'success');
  } catch (e) {
    notify(e.message || 'HWPX 생성에 실패했습니다.', 'warning');
  }
}

export async function exportManagerBookHwpx() {
  if (!PythonBridge.isAvailable()) return notify('HWPX 출력은 Windows 하이브리드 버전에서 사용할 수 있습니다.', 'warning');
  const staffId = document.getElementById('mgr-stf-sel')?.value || '';
  const ym = document.getElementById('mgr-ym')?.value || '';
  if (!staffId || !ym) return notify('지원단과 대상 월을 선택하세요.', 'warning');
  try {
    const filename = await download('/api/export/manager_book.hwpx', { state: getState(), staffId, ym });
    notify(`관리부 HWPX 생성 완료: ${filename}`, 'success');
  } catch (e) {
    notify(e.message || '관리부 HWPX 생성에 실패했습니다.', 'warning');
  }
}

function addButton(afterSelector, text, handler) {
  const ref = document.querySelector(afterSelector);
  if (!ref || ref.parentElement?.querySelector(`[data-v13-doc="${text}"]`)) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-outline';
  btn.textContent = text;
  btn.dataset.v13Doc = text;
  btn.addEventListener('click', handler);
  ref.insertAdjacentElement('afterend', btn);
}

export function installDocumentExports() {
  window.exportPaySlipHwpx = exportPaySlipHwpx;
  window.exportExecutionHwpx = exportExecutionHwpx;
  window.exportManagerBookHwpx = exportManagerBookHwpx;

  if (!PythonBridge.isAvailable()) return;

  addButton('button[onclick="exportPaySlipXlsx()"]', '📄 HWPX 생성', exportPaySlipHwpx);
  addButton('button[onclick="exportExecReportXlsx()"]', '📄 HWPX 생성', exportExecutionHwpx);
  addButton('button[onclick="exportMgrBookXlsx()"]', '📄 HWPX 생성', exportManagerBookHwpx);

  const oldPayXlsx = window.exportPaySlipXlsx;
  window.exportPaySlipXlsx = async function() {
    const staffId = document.getElementById('pay-stf-sel')?.value || '';
    const ym = document.getElementById('pay-ym')?.value || '';
    if (!staffId || !ym) return oldPayXlsx?.();
    try {
      const filename = await download('/api/export/pay-slip.xlsx', { state: getState(), staffId, ym });
      notify(`Python Excel 생성 완료: ${filename}`, 'success');
    } catch (e) {
      console.warn('[V13] Python Excel fallback:', e);
      return oldPayXlsx?.();
    }
  };

  const oldExecXlsx = window.exportExecReportXlsx;
  window.exportExecReportXlsx = async function() {
    const ym = document.getElementById('exec-ym')?.value || '';
    if (!ym) return oldExecXlsx?.();
    try {
      const filename = await download('/api/export/execution.xlsx', { state: getState(), ym });
      notify(`Python Excel 생성 완료: ${filename}`, 'success');
    } catch (e) {
      console.warn('[V13] Python Excel fallback:', e);
      return oldExecXlsx?.();
    }
  };

  const oldMgrXlsx = window.exportMgrBookXlsx;
  window.exportMgrBookXlsx = async function() {
    const staffId = document.getElementById('mgr-stf-sel')?.value || '';
    const ym = document.getElementById('mgr-ym')?.value || '';
    if (!staffId || !ym) return oldMgrXlsx?.();
    try {
      const filename = await download('/api/export/manager-book.xlsx', { state: getState(), staffId, ym });
      notify(`Python 관리부 Excel 생성 완료: ${filename}`, 'success');
    } catch (e) {
      console.warn('[V13] Python manager-book Excel fallback:', e);
      return oldMgrXlsx?.();
    }
  };
}
