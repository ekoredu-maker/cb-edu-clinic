import { getState, withFreshIndexes } from '../core/store.js';
import { PythonBridge } from './python-bridge.js';

const runtime = {
  source: 'browser',
  healthy: true,
  recoveryNeeded: false,
  reason: '',
  checkedAt: '',
};

let originalLoadData = null;
let installed = false;

function publish(){
  const snap = { ...runtime };
  window.__V13_READ_SOURCE__ = snap;
  window.dispatchEvent(new CustomEvent('v13:read-source-status', { detail: snap }));
  return snap;
}

function applyStateInPlace(next){
  const target = getState();
  const keepRef = target;
  for (const key of Object.keys(keepRef)) delete keepRef[key];
  for (const [key, value] of Object.entries(next || {})) keepRef[key] = value;
  withFreshIndexes(true);
  return keepRef;
}

async function chooseReadSource(){
  runtime.checkedAt = new Date().toISOString();
  if (!PythonBridge.isAvailable()) {
    runtime.source = 'browser';
    runtime.healthy = true;
    runtime.recoveryNeeded = false;
    runtime.reason = 'Python engine offline';
    return publish();
  }

  try {
    const status = await PythonBridge.storageStatus();
    if (!status?.lastMigration || !(status.totalRecords > 0)) {
      runtime.source = 'browser';
      runtime.healthy = true;
      runtime.recoveryNeeded = false;
      runtime.reason = 'SQLite not initialized';
      return publish();
    }

    const browserState = getState();
    const parity = await PythonBridge.storageCompare(browserState);
    if (!parity?.ok) {
      runtime.source = 'browser-fallback';
      runtime.healthy = false;
      runtime.recoveryNeeded = true;
      runtime.reason = 'Browser/SQLite parity mismatch';
      return publish();
    }

    const exported = await PythonBridge.storageExport();
    if (!exported?.state) throw new Error('SQLite state is empty.');
    applyStateInPlace(exported.state);
    runtime.source = 'sqlite';
    runtime.healthy = true;
    runtime.recoveryNeeded = false;
    runtime.reason = '';
    return publish();
  } catch (error) {
    runtime.source = 'browser-fallback';
    runtime.healthy = false;
    runtime.recoveryNeeded = true;
    runtime.reason = error?.message || String(error);
    console.warn('[V13 Read Source] SQLite load failed; browser state retained.', error);
    return publish();
  }
}

function wrapLoadData(){
  if (installed || !window.ClinicApp || typeof window.ClinicApp.loadData !== 'function') return false;
  installed = true;
  originalLoadData = window.ClinicApp.loadData.bind(window.ClinicApp);
  window.ClinicApp.loadData = async function(...args){
    const result = await originalLoadData(...args);
    const selected = await chooseReadSource();
    if (selected.source === 'sqlite') withFreshIndexes(true);
    return result;
  };
  return true;
}

export function installReadSourceTools(){
  wrapLoadData();
  window.ClinicReadSource = {
    select: chooseReadSource,
    status: () => ({ ...runtime }),
    restoreSqliteFromBrowser: async () => {
      if (!PythonBridge.isAvailable()) throw new Error('Python 엔진이 연결되지 않았습니다.');
      const result = await PythonBridge.storageImport(getState(), { source:'read-source-recovery', replace:true });
      const parity = await PythonBridge.storageCompare(getState());
      runtime.source = parity.ok ? 'sqlite' : 'browser-fallback';
      runtime.healthy = Boolean(parity.ok);
      runtime.recoveryNeeded = !parity.ok;
      runtime.reason = parity.ok ? '' : 'Recovery parity mismatch';
      publish();
      return { result, parity };
    },
  };
}

export { chooseReadSource, applyStateInPlace };
