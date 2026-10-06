import { getState, subscribe, withFreshIndexes } from '../core/store.js';
import { pivotByGradeV12, pivotByRegionV12 } from '../domain/statistics.js';
import { PythonBridge } from './python-bridge.js';
import { EngineSource } from './engine-source.js';

let statsCache = null;
let installed = false;
const app = () => window.ClinicApp;

function escapeHtml(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function refreshStatistics(){
  if (!PythonBridge.isAvailable()) return null;
  const asOf = document.getElementById('stat-date')?.value || new Date().toISOString().slice(0,10);
  const reportType = document.getElementById('stat-type')?.value || '';
  statsCache = await EngineSource.statistics(true, { asOf, reportType });
  window.__V13_AUTHORITATIVE_STATS__ = statsCache;
  return statsCache;
}

function gradePivot(){ return statsCache?.pivotByGrade || pivotByGradeV12(); }
function regionPivot(){ return statsCache?.pivotByRegion || pivotByRegionV12(); }

function installStatistics(){
  const a = app();
  a.pivotByGradeV12 = gradePivot;
  a.pivotByRegionV12 = regionPivot;
  window.pivotByGrade = gradePivot;
  window.pivotByRegion = regionPivot;

  const original = window.renderPivots;
  if (typeof original === 'function' && !original.__v13Authoritative) {
    const wrapped = async function(...args){
      try { await refreshStatistics(); }
      catch (e) { console.warn('[V13] Python statistics fallback to JS:', e); }
      withFreshIndexes(true);
      return original.apply(this, args);
    };
    wrapped.__v13Authoritative = true;
    window.renderPivots = wrapped;
  }
}

function areasLabel(staff){
  const map = window.AREA_BY_ID || app()?.AREA_BY_ID || {};
  return (staff?.areas || []).map(x => map[x]?.label || x).join(',');
}

async function renderPythonVerification(){
  const ym = document.getElementById('ver-month')?.value || '';
  const host = document.getElementById('ver-area');
  if (!host || !ym) return false;
  const result = await EngineSource.verification(ym, true);
  if (!result) return false;
  const state = getState();
  const staff = Object.fromEntries((state.stf || []).map(x => [String(x.id), x]));
  let html = `<div style="display:flex;justify-content:flex-end;margin:4px 0 8px"><span class="badge" style="background:#0f766e;color:#fff">Python 기준값</span></div>`;
  html += `<table class="tbl" style="margin-top:4px"><thead><tr><th>지원단</th><th>학생</th><th>영역</th><th>예정</th><th>실적</th><th>시수합계</th><th>검증</th></tr></thead><tbody>`;
  for (const row of result.monthly || []) {
    const stf = staff[String(row.staffId)] || {};
    html += `<tr><td>${escapeHtml(row.staffName)}</td><td>${escapeHtml(row.studentName)}</td><td>${escapeHtml(areasLabel(stf))}</td><td class="center">${Number(row.expected||0)}회</td><td class="center">${Number(row.actual||0)}회</td><td class="center">${Number(row.totalHours||0).toFixed(1)}h</td><td class="center"><span class="badge ${row.ok?'bg-yes':'bg-no'}">${row.ok?'✓ 정상':'⚠️ 미달'}</span></td></tr>`;
  }
  html += '</tbody></table>';
  if ((result.errors || []).length) html += `<div style="margin-top:10px;padding:10px;background:#fff7ed;border-radius:8px">데이터 검증 오류 ${result.errors.length}건이 있습니다.</div>`;
  host.innerHTML = html;
  window.__V13_AUTHORITATIVE_VERIFICATION__ = result;
  return true;
}

function installVerification(){
  for (const name of ['loadVerify','loadValidation']) {
    const original = window[name];
    if (typeof original !== 'function' || original.__v13Authoritative) continue;
    const wrapped = async function(...args){
      if (PythonBridge.isAvailable()) {
        try { if (await renderPythonVerification()) return; }
        catch (e) { console.warn('[V13] Python verification fallback to JS:', e); }
      }
      return original.apply(this, args);
    };
    wrapped.__v13Authoritative = true;
    window[name] = wrapped;
  }
}

function settlementToLegacy(result){
  return result?.byStaff || {};
}

function installSettlement(){
  const original = window.buildSettleData;
  if (typeof original !== 'function' || original.__v13Authoritative) return;
  const cache = new Map();
  const wrapped = function(ym){
    if (cache.has(ym)) return cache.get(ym);
    if (PythonBridge.isAvailable()) {
      EngineSource.settlement(ym, true).then(result => {
        cache.set(ym, settlementToLegacy(result));
        window.__V13_AUTHORITATIVE_SETTLEMENT__ = result;
        window.dispatchEvent(new CustomEvent('v13:settlement-ready', { detail:{ ym, result } }));
      }).catch(e => console.warn('[V13] Python settlement fallback to JS:', e));
    }
    return original.call(this, ym);
  };
  wrapped.__v13Authoritative = true;
  window.buildSettleData = wrapped;
  window.addEventListener('v13:invalidate-engine', () => cache.clear());
}

export async function installAuthoritativeEngine(){
  if (installed) return;
  installed = true;
  if (!PythonBridge.isAvailable()) return;
  try { await refreshStatistics(); } catch (e) { console.warn('[V13] initial Python statistics preload failed:', e); }
  installStatistics();
  installVerification();
  installSettlement();
  subscribe(({event}) => {
    if (!event.startsWith('persist:')) return;
    EngineSource.invalidate();
    statsCache = null;
    window.dispatchEvent(new CustomEvent('v13:invalidate-engine'));
    refreshStatistics().catch(e => console.warn('[V13] statistics refresh failed:', e));
  });
  window.__V13_CALCULATION_SOURCE__ = 'python';
}
