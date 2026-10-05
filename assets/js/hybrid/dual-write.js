import { PythonBridge } from './python-bridge.js';

const COLLECTIONS = new Set(['stf','stu','mat','trn']);
let queue = Promise.resolve();
let installed = false;

const status = {
  enabled: false,
  healthy: true,
  pending: 0,
  failures: 0,
  lastError: '',
  lastAction: '',
  lastAt: '',
};

function snapshot(){ return { ...status }; }

function publish(){
  window.__V13_DUAL_WRITE__ = snapshot();
  window.dispatchEvent(new CustomEvent('v13:dual-write-status', { detail: snapshot() }));
}

function markStart(action){
  status.pending += 1;
  status.lastAction = action;
  status.lastAt = new Date().toISOString();
  publish();
}

function markSuccess(action){
  status.pending = Math.max(0, status.pending - 1);
  status.healthy = true;
  status.lastError = '';
  status.lastAction = action;
  status.lastAt = new Date().toISOString();
  publish();
}

function markFailure(action, error){
  status.pending = Math.max(0, status.pending - 1);
  status.healthy = false;
  status.failures += 1;
  status.lastError = error?.message || String(error || 'unknown error');
  status.lastAction = action;
  status.lastAt = new Date().toISOString();
  console.warn('[V13 Dual Write]', action, error);
  publish();
}

function enqueue(action, task){
  markStart(action);
  queue = queue.then(task).then(() => markSuccess(action)).catch(err => markFailure(action, err));
  return queue;
}

function currentState(){ return window.ClinicApp?.state || {}; }

function normalizeMeta(record){
  if (!record || record.id !== 'cfg') return null;
  const { id, ...cfg } = record;
  return cfg;
}

export function installDualWrite(){
  if (installed || !PythonBridge.isAvailable() || !window.ClinicApp) return false;
  const app = window.ClinicApp;
  if (typeof app.save !== 'function' || typeof app.removeItem !== 'function' || typeof app.saveAll !== 'function') return false;

  const originalSave = app.save.bind(app);
  const originalRemove = app.removeItem.bind(app);
  const originalSaveAll = app.saveAll.bind(app);

  const wrappedSave = async function(store, record, ...rest){
    const result = await originalSave(store, record, ...rest);
    if (COLLECTIONS.has(store) && record?.id != null) {
      enqueue(`upsert:${store}:${record.id}`, () => PythonBridge.storageUpsert(store, record));
    } else if (store === 'meta') {
      const cfg = normalizeMeta(record);
      if (cfg) enqueue('singleton:cfg', () => PythonBridge.storageSingleton('cfg', cfg));
    }
    return result;
  };

  const wrappedRemove = async function(store, id, ...rest){
    const result = await originalRemove(store, id, ...rest);
    if (COLLECTIONS.has(store)) enqueue(`delete:${store}:${id}`, () => PythonBridge.storageDelete(store, id));
    return result;
  };

  const wrappedSaveAll = async function(...args){
    const result = await originalSaveAll(...args);
    enqueue('full-sync', () => PythonBridge.storageImport(currentState(), { source:'dual-write-saveAll', replace:true }));
    return result;
  };

  app.save = wrappedSave;
  app.removeItem = wrappedRemove;
  app.saveAll = wrappedSaveAll;

  // V12의 전역 함수 직접 호출 경로도 동일 래퍼로 연결한다.
  if (typeof window.save === 'function') window.save = wrappedSave;
  if (typeof window.removeItem === 'function') window.removeItem = wrappedRemove;
  if (typeof window.saveAll === 'function') window.saveAll = wrappedSaveAll;

  installed = true;
  status.enabled = true;
  publish();
  return true;
}

export async function compareDualWrite(){
  if (!PythonBridge.isAvailable()) return { ok:null, available:false };
  await queue;
  try {
    const result = await PythonBridge.storageCompare(currentState());
    status.healthy = Boolean(result.ok);
    status.lastAction = 'compare';
    status.lastAt = new Date().toISOString();
    status.lastError = result.ok ? '' : '브라우저 데이터와 SQLite 데이터가 일치하지 않습니다.';
    publish();
    return { available:true, ...result };
  } catch (error) {
    markFailure('compare', error);
    return { available:true, ok:false, error:status.lastError };
  }
}

export function installDualWriteTools(){
  window.ClinicDualWrite = {
    install: installDualWrite,
    compare: compareDualWrite,
    status: () => snapshot(),
  };
}
