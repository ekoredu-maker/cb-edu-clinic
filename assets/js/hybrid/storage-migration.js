import { getState } from '../core/store.js';
import { PythonBridge } from './python-bridge.js';

function saveBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toastSafe(message, type='success'){
  if (typeof window.toast === 'function') window.toast(message, type);
  else console.log(`[V13 Storage] ${message}`);
}

export async function migrateCurrentStateToSqlite(){
  if (!PythonBridge.isAvailable()) throw new Error('Windows 하이브리드 모드에서만 SQLite 이관을 사용할 수 있습니다.');
  const state = getState();
  const counts = {
    stf: (state.stf || []).length,
    stu: (state.stu || []).length,
    mat: (state.mat || []).length,
    trn: (state.trn || []).length,
  };
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const ok = window.confirm(`현재 브라우저 데이터를 SQLite로 안전 이관합니다.\n\n지원단 ${counts.stf}명\n학생 ${counts.stu}명\n매칭 ${counts.mat}건\n연수 ${counts.trn}건\n총 ${total}건\n\n기존 SQLite 데이터는 교체됩니다. 계속하시겠습니까?`);
  if (!ok) return null;
  const result = await PythonBridge.storageImport(state, { source:'v12-browser', replace:true });
  window.__V13_STORAGE_STATUS__ = result.storage;
  if (window.ClinicDualWrite?.install) window.ClinicDualWrite.install();
  const parity = window.ClinicDualWrite?.compare ? await window.ClinicDualWrite.compare() : await PythonBridge.storageCompare(state);
  if (parity?.ok && window.ClinicReadSource?.select) await window.ClinicReadSource.select();
  toastSafe(parity?.ok ? `SQLite 이관 완료 · ${result.recordCount}건 · 동기화 PASS` : `SQLite 이관 완료 · ${result.recordCount}건 · 동기화 확인 필요`, parity?.ok ? 'success' : 'warning');
  return { ...result, parity };
}

export async function compareSqliteState(){
  if (!PythonBridge.isAvailable()) throw new Error('Python 엔진이 연결되지 않았습니다.');
  const result = window.ClinicDualWrite?.compare ? await window.ClinicDualWrite.compare() : await PythonBridge.storageCompare(getState());
  if (result.ok) {
    toastSafe('브라우저 데이터와 SQLite가 일치합니다.', 'success');
  } else {
    const diffs = (result.checks || []).filter(x=>!x.ok).map(x=>x.key).join(', ');
    toastSafe(`SQLite 동기화 차이 발견: ${diffs || '상세 확인 필요'}`, 'warning');
    console.warn('[V13 Storage Compare]', result);
  }
  return result;
}

export async function restoreSqliteFromBrowser(){
  if (!PythonBridge.isAvailable()) throw new Error('Python 엔진이 연결되지 않았습니다.');
  const ok = window.confirm('현재 브라우저 데이터를 기준으로 SQLite를 복구합니다.\n\nSQLite의 기존 내용은 교체되며, 브라우저 데이터는 변경하지 않습니다. 계속하시겠습니까?');
  if (!ok) return null;
  const result = window.ClinicReadSource?.restoreSqliteFromBrowser
    ? await window.ClinicReadSource.restoreSqliteFromBrowser()
    : { result: await PythonBridge.storageImport(getState(), { source:'manual-recovery', replace:true }) };
  const parity = result.parity || await PythonBridge.storageCompare(getState());
  toastSafe(parity.ok ? 'SQLite 복구 완료 · 동기화 PASS' : 'SQLite 복구 후에도 차이가 있습니다.', parity.ok ? 'success' : 'warning');
  return { ...result, parity };
}

export async function showSqliteStatus(){
  if (!PythonBridge.isAvailable()) throw new Error('Python 엔진이 연결되지 않았습니다.');
  const s = await PythonBridge.storageStatus();
  const c = s.counts || {};
  const readSource = window.ClinicReadSource?.status?.();
  alert(`V13 SQLite 저장 상태\n\n지원단 ${c.stf||0}\n학생 ${c.stu||0}\n매칭 ${c.mat||0}\n연수 ${c.trn||0}\n총 ${s.totalRecords||0}건\n\n최근 이관: ${s.lastMigration?.created_at || '없음'}\n데이터 원본: ${readSource?.source || 'browser'}`);
  return s;
}

export async function downloadSqliteBackup(){
  if (!PythonBridge.isAvailable()) throw new Error('Python 엔진이 연결되지 않았습니다.');
  const file = await PythonBridge.downloadStorageBackup();
  saveBlob(file.blob, file.filename);
  toastSafe('SQLite 백업 JSON 생성 완료', 'success');
}

export async function readSqliteState(){
  if (!PythonBridge.isAvailable()) throw new Error('Python 엔진이 연결되지 않았습니다.');
  return PythonBridge.storageExport();
}

function addButton(host, label, handler, className='btn btn-outline btn-sm'){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await handler(); }
    catch (e) { toastSafe(e?.message || String(e), 'error'); }
    finally { btn.disabled = false; }
  });
  host.appendChild(btn);
}

export function installStorageMigrationControls(){
  window.ClinicStorage = {
    migrate: migrateCurrentStateToSqlite,
    compare: compareSqliteState,
    recover: restoreSqliteFromBrowser,
    status: showSqliteStatus,
    backup: downloadSqliteBackup,
    read: readSqliteState,
  };
  if (!PythonBridge.isAvailable()) return;
  const settings = document.getElementById('t9');
  if (!settings || document.getElementById('v13-sqlite-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'v13-sqlite-panel';
  panel.className = 'panel';
  panel.style.marginTop = '16px';
  panel.innerHTML = `
    <div class="panel-title">🗄️ V13 로컬 데이터베이스 <span class="badge" style="background:#0f766e;color:#fff">Hybrid</span></div>
    <p style="color:var(--muted);font-size:12px;margin:8px 0 12px">
      동기화가 정상일 때 Windows 버전은 SQLite를 읽기 원본으로 사용합니다. 불일치나 오류가 있으면 브라우저 저장소로 자동 전환되며, 아래 복구 버튼으로 현재 브라우저 데이터를 SQLite에 다시 반영할 수 있습니다.
    </p>
    <div id="v13-sqlite-actions" style="display:flex;gap:8px;flex-wrap:wrap"></div>`;
  settings.appendChild(panel);
  const host = panel.querySelector('#v13-sqlite-actions');
  addButton(host, '💾 현재 데이터 → SQLite 이관', migrateCurrentStateToSqlite, 'btn btn-primary btn-sm');
  addButton(host, '✅ 동기화 비교', compareSqliteState);
  addButton(host, '🛠 Browser 기준 SQLite 복구', restoreSqliteFromBrowser);
  addButton(host, '🔎 SQLite 상태 확인', showSqliteStatus);
  addButton(host, '📦 SQLite 백업 JSON', downloadSqliteBackup);
}
