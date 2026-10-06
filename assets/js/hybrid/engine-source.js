import { getState } from '../core/store.js';
import { PythonBridge } from './python-bridge.js';

const cache = {
  statistics: null,
  verification: new Map(),
  settlement: new Map(),
  updatedAt: '',
};

function clone(v){ return v == null ? v : structuredClone(v); }
function state(){ return getState(); }

async function statistics(force=false, options={}){
  if (!PythonBridge.isAvailable()) return null;
  const key = JSON.stringify({asOf: options.asOf || '', reportType: options.reportType || ''});
  if (!force && cache.statistics?.key === key) return clone(cache.statistics.value);
  const result = await PythonBridge.statistics({
    state: state(),
    asOf: options.asOf || '',
    reportType: options.reportType || '',
  });
  cache.statistics = { key, value: result };
  cache.updatedAt = new Date().toISOString();
  return clone(result);
}

async function verification(ym, force=false){
  if (!PythonBridge.isAvailable()) return null;
  if (!force && cache.verification.has(ym)) return clone(cache.verification.get(ym));
  const result = await PythonBridge.verification({ state: state(), ym });
  cache.verification.set(ym, result);
  cache.updatedAt = new Date().toISOString();
  return clone(result);
}

async function settlement(ym, force=false){
  if (!PythonBridge.isAvailable()) return null;
  if (!force && cache.settlement.has(ym)) return clone(cache.settlement.get(ym));
  const result = await PythonBridge.settlement({ state: state(), ym });
  cache.settlement.set(ym, result);
  cache.updatedAt = new Date().toISOString();
  return clone(result);
}

function invalidate(){
  cache.statistics = null;
  cache.verification.clear();
  cache.settlement.clear();
  cache.updatedAt = '';
}

function snapshot(){
  return {
    available: PythonBridge.isAvailable(),
    authoritative: PythonBridge.isAvailable(),
    statisticsReady: Boolean(cache.statistics?.value),
    verificationMonths: [...cache.verification.keys()],
    settlementMonths: [...cache.settlement.keys()],
    updatedAt: cache.updatedAt,
  };
}

export const EngineSource = { statistics, verification, settlement, invalidate, snapshot };
window.ClinicEngine = EngineSource;
