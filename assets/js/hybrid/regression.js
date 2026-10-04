import { getState, withFreshIndexes } from '../core/store.js';
import { pivotByGradeV12, pivotByRegionV12 } from '../domain/statistics.js';
import { getDatesForDayInMonthV12 } from '../domain/verification.js';
import { PythonBridge } from './python-bridge.js';

function stable(value){
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
function deepEqual(a, b){ return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function toMin(v){
  if (!v || !String(v).includes(':')) return null;
  const [h, m] = String(v).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function buildJsMonthlyVerification(state, ym){
  const IDX = withFreshIndexes(true);
  return (state.mat || []).filter(m => m.st === 'active').map(m => {
    const stf = (IDX.stfById || {})[m.stfId];
    const stu = (IDX.stuById || {})[m.stuId];
    if (!stf || !stu) return null;
    const slot = (m.slots || [])[0];
    const expected = slot ? getDatesForDayInMonthV12(ym, slot.d).length : 0;
    const logs = (m.logs || []).filter(l => l.d && l.d.startsWith(ym));
    const totalHours = logs.reduce((sum, l) => {
      const s = toMin(l.s), e = toMin(l.e);
      return sum + (s !== null && e !== null ? (e - s) / 60 : 1);
    }, 0);
    return {
      matchingId: m.id, staffId: m.stfId, staffName: stf.nm || '',
      studentId: m.stuId, studentName: stu.nm || '',
      expected, actual: logs.length,
      totalHours: Math.round(totalHours * 10000) / 10000,
      ok: logs.length >= expected * 0.8,
    };
  }).filter(Boolean);
}

function buildJsSettlementSummary(ym){
  if (typeof window.buildSettleData !== 'function') return null;
  const data = window.buildSettleData(ym);
  const taxPct = Number(window.getRates?.().taxPct || 3.3);
  const out = {};
  Object.entries(data).forEach(([id, d]) => {
    const coachAmount = (d.coach || []).reduce((a,b)=>a+Number(b.amount||0),0);
    const classAmount = (d.cls || []).reduce((a,b)=>a+Number(b.amount||0),0);
    const travelAmount = (d.travel || []).reduce((a,b)=>a+Number(b.amount||0),0);
    const gross = coachAmount + classAmount + travelAmount;
    const tax = Math.round(gross * taxPct / 100);
    out[id] = {
      coachCount:(d.coach||[]).length, coachAmount,
      classCount:(d.cls||[]).length, classAmount,
      travelCount:(d.travel||[]).length, travelAmount,
      gross, tax, net:gross-tax,
    };
  });
  return out;
}

function summarize(label, jsValue, pyValue){
  const ok = deepEqual(jsValue, pyValue);
  return { label, ok, js: jsValue, python: pyValue };
}

export async function runHybridRegression({ ym = '' } = {}){
  if (!PythonBridge.isAvailable()) return { available:false, ok:null, checks:[] };
  const state = getState();
  withFreshIndexes(true);
  const pyStats = await PythonBridge.statistics({ state });
  const checks = [
    summarize('통계-학교급 피벗', pivotByGradeV12(), pyStats.pivotByGrade),
    summarize('통계-지역 피벗', pivotByRegionV12(), pyStats.pivotByRegion),
  ];
  if (ym) {
    const pyVerify = await PythonBridge.verification({ state, ym });
    checks.push(summarize('월별 검증', buildJsMonthlyVerification(state, ym), pyVerify.monthly || []));
    const jsSettlement = buildJsSettlementSummary(ym);
    if (jsSettlement) {
      const pySettlement = await PythonBridge.settlement({ state, ym });
      checks.push(summarize('월별 정산', jsSettlement, pySettlement.summaryByStaff || {}));
    }
  }
  const result = { available:true, ok:checks.every(x=>x.ok), checkedAt:new Date().toISOString(), ym, checks };
  window.__V13_REGRESSION__ = result;
  console.group(`[V13 Regression] ${result.ok ? 'PASS' : 'DIFF'}`);
  for (const check of checks) console[check.ok ? 'log' : 'warn'](`${check.ok ? '✓' : '⚠'} ${check.label}`, check.ok ? '' : check);
  console.groupEnd();
  return result;
}

export function installRegressionTools(){ window.ClinicRegression = { run: runHybridRegression }; }
