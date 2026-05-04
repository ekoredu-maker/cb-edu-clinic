

const listeners = new Set();
const getApp = () => window.ClinicApp;

function getState(){
  return getApp().state;
}

function getIndexes(){
  return getApp().indexes;
}

function subscribe(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(event='change', payload={}){
  for (const fn of [...listeners]) {
    try { fn({ event, payload, state: getState(), indexes: getIndexes() }); } catch (e) { console.error(e); }
  }
}

async function patchState(mutator, options={ persist:false, forceReindex:false, event:'change' }){
  const state = getState();
  const result = mutator(state);
  if (options.persist) await getApp().saveAll();
  if (options.forceReindex) getApp().buildIndex(true);
  notify(options.event, { result });
  return state;
}

function withFreshIndexes(force=false){
  return getApp().buildIndex(force);
}

function bootStoreDevtools(){
  window.ClinicStore = { getState, getIndexes, patchState, subscribe, notify, withFreshIndexes };
}

const app = () => window.ClinicApp;

function collectActualExecutionMetrics(state, IDX){
  const metrics = {
    coachStuIds: new Set(),
    classMatIds: new Set(),
    classGroupKeys: new Set(),
    regionCoachStuIds: new Map(),
    regionClassMatIds: new Map(),
    regionClassGroupKeys: new Map(),
  };
  const verified = app().forEachVerifiedLog;
  if (typeof verified !== 'function') return metrics;
  verified((l, m) => {
    if ((l.kind || m.kind) === 'class') {
      metrics.classMatIds.add(m.id);
      const ci = m.classInfo || {};
      metrics.classGroupKeys.add(`${ci.sc||''}__${ci.gr||''}__${ci.cls||''}`);
      const region = ci.region || (typeof app().inferRegionFromClassInfo === 'function' ? app().inferRegionFromClassInfo(ci) : '');
      if (region) {
        if (!metrics.regionClassMatIds.has(region)) metrics.regionClassMatIds.set(region, new Set());
        if (!metrics.regionClassGroupKeys.has(region)) metrics.regionClassGroupKeys.set(region, new Set());
        metrics.regionClassMatIds.get(region).add(m.id);
        metrics.regionClassGroupKeys.get(region).add(`${ci.sc||''}__${ci.gr||''}__${ci.cls||''}`);
      }
    } else if (m.stuId) {
      metrics.coachStuIds.add(m.stuId);
      const stu = (IDX.stuById || {})[m.stuId];
      const region = stu?.region || '';
      if (region) {
        if (!metrics.regionCoachStuIds.has(region)) metrics.regionCoachStuIds.set(region, new Set());
        metrics.regionCoachStuIds.get(region).add(m.stuId);
      }
    }
  });
  return metrics;
}

function pivotByGradeV12(){
  const state = getState();
  const IDX = withFreshIndexes();
  const res = {};
  for (const lvl of ['초','중']) {
    const maxGr = lvl === '초' ? 6 : 3;
    for (let g = 1; g <= maxGr; g++) {
      res[`${lvl}${g}`] = { apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0 };
    }
  }
  (state.stu || []).forEach(s => {
    const key = `${s.scType}${s.gr}`;
    if (!res[key]) return;
    const sts = s.supportTypes || [];
    if (sts.includes('방과후학습코칭')) res[key].apply_coach++;
    if (sts.includes('수업협력코칭')) res[key].apply_class_stu++;
    if (sts.includes('심리진단')) res[key].diag++;
    if (sts.includes('치료기관연계')) res[key].therapy++;
  });
  (state.mat || []).filter(m => m.kind === 'class' && m.st === 'active').forEach(m => {
    const ci = m.classInfo || {};
    const key = `${ci.scType || ''}${ci.gr || ''}`;
    if (res[key]) res[key].apply_class_cnt++;
  });
  const metrics = collectActualExecutionMetrics(state, IDX);
  metrics.coachStuIds.forEach(stuId => {
    const stu = (IDX.stuById || {})[stuId];
    if (!stu) return;
    const key = `${stu.scType}${stu.gr}`;
    if (res[key]) res[key].coach++;
  });
  metrics.classMatIds.forEach(matId => {
    const m = (state.mat || []).find(x => x.id === matId);
    const ci = m?.classInfo || {};
    const key = `${ci.scType || ''}${ci.gr || ''}`;
    if (res[key]) res[key].class_cnt++;
  });
  metrics.classGroupKeys.forEach(groupKey => {
    const [sc, gr] = groupKey.split('__');
    let key = '';
    const stu = (state.stu || []).find(s => s.sc === sc && String(s.gr) === String(gr));
    if (stu) key = `${stu.scType}${stu.gr}`;
    if (key && res[key]) res[key].class_stu++;
  });
  return res;
}

function pivotByRegionV12(){
  const state = getState();
  const IDX = withFreshIndexes();
  const regions = (state.cfg?.regions && state.cfg.regions.length) ? state.cfg.regions : ['지역1','지역2'];
  const res = {};
  regions.forEach(r => { res[r] = { apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0 }; });
  (state.stu || []).forEach(s => {
    const row = res[s.region];
    if (!row) return;
    const sts = s.supportTypes || [];
    if (sts.includes('방과후학습코칭')) row.apply_coach++;
    if (sts.includes('수업협력코칭')) row.apply_class_stu++;
    if (sts.includes('심리진단')) row.diag++;
    if (sts.includes('치료기관연계')) row.therapy++;
  });
  (state.mat || []).filter(m => m.kind === 'class' && m.st === 'active').forEach(m => {
    const ci = m.classInfo || {};
    const region = ci.region || (typeof app().inferRegionFromClassInfo === 'function' ? app().inferRegionFromClassInfo(ci) : '');
    if (region && res[region]) res[region].apply_class_cnt++;
  });
  const metrics = collectActualExecutionMetrics(state, IDX);
  for (const [region, ids] of metrics.regionCoachStuIds.entries()) {
    if (res[region]) res[region].coach = ids.size;
  }
  for (const [region, ids] of metrics.regionClassMatIds.entries()) {
    if (res[region]) res[region].class_cnt = ids.size;
  }
  for (const [region, ids] of metrics.regionClassGroupKeys.entries()) {
    if (res[region]) res[region].class_stu = ids.size;
  }
  return res;
}

function installStatisticsOverrides(){
  app().pivotByGradeV12 = pivotByGradeV12;
  app().pivotByRegionV12 = pivotByRegionV12;
  if (typeof window.pivotByGrade === 'function') window.pivotByGrade = pivotByGradeV12;
  if (typeof window.pivotByRegion === 'function') window.pivotByRegion = pivotByRegionV12;
  const originalRenderPivots = window.renderPivots;
  if (typeof originalRenderPivots === 'function') {
    window.renderPivots = function(...args){
      withFreshIndexes(true);
      return originalRenderPivots.apply(this, args);
    };
  }
}

const app = () => window.ClinicApp;

function getDatesForDayInMonthV12(ym, dayLabel){
  const DAY_IDX = {일:0, 월:1, 화:2, 수:3, 목:4, 금:5, 토:6};
  const target = DAY_IDX[dayLabel];
  if (target === undefined) return [];
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(y, m - 1, d).getDay() === target) result.push(`${ym}-${String(d).padStart(2, '0')}`);
  }
  return result;
}

function installVerificationOverrides(){
  window.getDatesForDayInMonth = getDatesForDayInMonthV12;
  app().getDatesForDayInMonth = getDatesForDayInMonthV12;
  if (typeof window.loadVerify === 'function') {
    const originalLoadVerify = window.loadVerify;
    window.loadVerify = function(...args){
      withFreshIndexes(true);
      return originalLoadVerify.apply(this, args);
    };
  }
}

bootStoreDevtools();
installStatisticsOverrides();
installVerificationOverrides();
subscribe(({ event }) => {
  if (event && event.startsWith('persist:')) console.debug('[V12.3 store event]', event);
});
window.addEventListener('load', () => {
  try { withFreshIndexes(true); } catch (e) { console.error(e); }
  const badge = document.getElementById('hdr-sub');
  if (badge) {
    const text = badge.textContent || '';
    badge.textContent = text.replace(/V\d+(?:\.\d+)?[^•]*/,'V12.3 Refactor Edition');
  }
  document.title = (document.title || '학습클리닉 통합관리').replace(/V\d+(?:\.\d+)?/,'V12.3');
});
