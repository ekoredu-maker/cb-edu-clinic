
import { getState, withFreshIndexes } from '../core/store.js';

const app = () => window.ClinicApp;

function isStatActualLog(l){
  const status = (l && l.status) || 'conducted';
  return status === 'conducted' || status === 'verified' || status === 'paid';
}

function collectActualExecutionMetrics(state, IDX){
  const metrics = {
    coachStuIds: new Set(),
    classMatIds: new Set(),
    classGroupKeys: new Set(),
    regionCoachStuIds: new Map(),
    regionClassMatIds: new Map(),
    regionClassGroupKeys: new Map(),
  };
  (state.mat || []).forEach(m => {
    (m.logs || []).forEach(l => {
      if (!isStatActualLog(l)) return;
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
  });
  return metrics;
}

export function pivotByGradeV12(){
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

export function pivotByRegionV12(){
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

export function installStatisticsOverrides(){
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
