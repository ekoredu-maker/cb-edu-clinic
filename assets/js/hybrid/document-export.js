import { getState } from '../core/store.js';
import { PythonBridge } from './python-bridge.js';

const FORM_KEY_BY_TYPE = {
  'staff-appoint': 'staff_appoint',
  'appoint-confirm': 'appoint_confirm',
  'career-confirm': 'career_confirm',
  'resign': 'resign',
  'plan-doc': 'plan_doc',
};

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

function currentManagerKind() {
  return document.getElementById('mgr-kind')?.value || 'coach';
}

function managerStateForKind(kind) {
  const source = getState();
  const state = (typeof structuredClone === 'function')
    ? structuredClone(source)
    : JSON.parse(JSON.stringify(source));
  // Export-only metadata. It is never written back to the Browser/SQLite state.
  // The Python HWPX print model uses it to reproduce the HTML manager-book title,
  // target header (학생/학급), and 구분 field while Excel keeps the detailed schema.
  state.cfg = { ...(state.cfg || {}), __v13ManagerKind: kind };
  state.mat = (state.mat || []).map(m => {
    const copy = { ...m };
    const matchingKind = copy.kind || 'coach';
    copy.logs = (copy.logs || []).filter(log => (log.kind || matchingKind || 'coach') === kind);
    if (matchingKind !== kind && copy.logs.length === 0) copy.st = '__v13_export_filtered__';
    return copy;
  });
  return state;
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
  const kind = currentManagerKind();
  if (!staffId || !ym) return notify('지원단과 대상 월을 선택하세요.', 'warning');
  try {
    const filename = await download('/api/export/manager_book.hwpx', { state: managerStateForKind(kind), staffId, ym, kind });
    notify(`관리부 HWPX 생성 완료: ${filename}`, 'success');
  } catch (e) {
    notify(e.message || '관리부 HWPX 생성에 실패했습니다.', 'warning');
  }
}

export async function exportCurrentFormHwpx() {
  if (!PythonBridge.isAvailable()) return notify('HWPX 출력은 Windows 하이브리드 버전에서 사용할 수 있습니다.', 'warning');
  const formType = window.__V13_LAST_FORM_TYPE__ || '';
  const key = FORM_KEY_BY_TYPE[formType];
  if (!key) return notify('먼저 위촉장·확인서·해촉신청서·학습지도계획서 중 하나를 화면에 생성하세요.', 'warning');
  const staffId = document.getElementById('form-stf-sel')?.value || '';
  if (formType !== 'plan-doc' && !staffId) return notify('지원단을 선택하세요.', 'warning');

  const payload = { state: getState(), staffId };
  if (formType === 'resign') {
    const inputs = Array.from(document.querySelectorAll('#form-preview input'));
    payload.resignDate = inputs[0]?.value || '';
    payload.resignReason = inputs[1]?.value || '';
  }
  try {
    const filename = await download(`/api/export/${key}.hwpx`, payload);
    notify(`행정서식 HWPX 생성 완료: ${filename}`, 'success');
  } catch (e) {
    notify(e.message || '행정서식 HWPX 생성에 실패했습니다.', 'warning');
  }
}

export async function exportTimetableHwpx() {
  if (!PythonBridge.isAvailable()) return notify('HWPX 출력은 Windows 하이브리드 버전에서 사용할 수 있습니다.', 'warning');
  const mode = window.TT_MODE || 'staff';
  const selectId = mode === 'staff' ? 'tt-sel-staff' : (mode === 'stu' ? 'tt-sel-stu' : 'tt-sel-sch');
  const targetId = document.getElementById(selectId)?.value || '';
  if (!targetId || targetId === 'all') return notify('HWPX 시간표는 개별 지원단·학생·학교를 선택한 뒤 생성하세요.', 'warning');
  try {
    const filename = await download('/api/export/timetable.hwpx', { state: getState(), mode, targetId });
    notify(`시간표 HWPX 생성 완료: ${filename}`, 'success');
  } catch (e) {
    notify(e.message || '시간표 HWPX 생성에 실패했습니다.', 'warning');
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

function wrapFormPreview() {
  const oldOpenForm = window.openForm;
  if (typeof oldOpenForm !== 'function' || oldOpenForm.__v13DocWrapped) return;
  const wrapped = function(type, ...args) {
    if (FORM_KEY_BY_TYPE[type]) window.__V13_LAST_FORM_TYPE__ = type;
    return oldOpenForm.call(this, type, ...args);
  };
  wrapped.__v13DocWrapped = true;
  window.openForm = wrapped;
}

export function installDocumentExports() {
  window.exportPaySlipHwpx = exportPaySlipHwpx;
  window.exportExecutionHwpx = exportExecutionHwpx;
  window.exportManagerBookHwpx = exportManagerBookHwpx;
  window.exportCurrentFormHwpx = exportCurrentFormHwpx;
  window.exportTimetableHwpx = exportTimetableHwpx;

  wrapFormPreview();
  if (!PythonBridge.isAvailable()) return;

  addButton('button[onclick="exportPaySlipXlsx()"]', '📄 HWPX 생성', exportPaySlipHwpx);
  addButton('button[onclick="exportExecReportXlsx()"]', '📄 HWPX 생성', exportExecutionHwpx);
  addButton('button[onclick="exportMgrBookXlsx()"]', '📄 HWPX 생성', exportManagerBookHwpx);
  addButton('button[onclick="exportTTXlsx()"]', '📄 HWPX 생성', exportTimetableHwpx);
  addButton('button[onclick="openForm(\'plan-doc\')"]', '📄 현재 서식 HWPX', exportCurrentFormHwpx);

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
    const kind = currentManagerKind();
    if (!staffId || !ym) return oldMgrXlsx?.();
    try {
      const filename = await download('/api/export/manager-book.xlsx', { state: managerStateForKind(kind), staffId, ym, kind });
      notify(`Python 관리부 Excel 생성 완료: ${filename}`, 'success');
    } catch (e) {
      console.warn('[V13] Python manager-book Excel fallback:', e);
      return oldMgrXlsx?.();
    }
  };
}
