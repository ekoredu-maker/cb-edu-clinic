import { getState, withFreshIndexes } from '../core/store.js';

const app = () => window.ClinicApp;

function isStatActualLog(l){
  const status = (l && l.status) || 'conducted';
  return status === 'conducted' || status === 'verified' || status === 'paid';
}

function parseDay(v){
  const raw=String(v||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d=new Date(raw+'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}
function reportFilterFromDom(){
  return {
    asOf: document.getElementById('stat-date')?.value || '',
    reportType: document.getElementById('stat-type')?.value || ''
  };
}
function periodBounds(asOf, reportType){
  const end=parseDay(asOf);
  if(!end) return {start:null,end:null};
  let start=null;
  if(reportType==='month') start=new Date(end.getFullYear(),end.getMonth(),1);
  else if(reportType==='quarter') start=new Date(end.getFullYear(),Math.floor(end.getMonth()/3)*3,1);
  return {start,end};
}
function logInPeriod(log, filter){
  const {start,end}=periodBounds(filter?.asOf||'',filter?.reportType||'');
  if(!start && !end) return true;
  const d=parseDay(log?.date||log?.d);
  if(!d) return false;
  if(start && d<start) return false;
  if(end && d>end) return false;
  return true;
}
function classGroupKey(ci){
  return [ci?.sc||'',ci?.scType||'',ci?.gr||'',ci?.cls||''].join('__');
}
function matchingClassStudentIds(ci,state){
  const ids=new Set();
  (state.stu||[]).forEach(s=>{
    if(!(s.supportTypes||[]).includes('수업협력코칭')) return;
    const sameSchool=(s.sc||'')===(ci.sc||'');
    const sameType=(s.scType||'')===(ci.scType||'');
    const sameGrade=String(s.gr||'')===String(ci.gr||'');
    const sameClass=(ci.cls==null||ci.cls===''||s.cls==null||s.cls==='') ? true : String(s.cls)===String(ci.cls);
    if(sameSchool&&sameType&&sameGrade&&sameClass&&s.id!=null) ids.add(String(s.id));
  });
  return ids;
}
function inferRegion(ci,state){
  if(ci?.region) return ci.region;
  for(const s of (state.stu||[])){
    const sameSchool=(s.sc||'')===(ci?.sc||'');
    const sameType=!ci?.scType||(s.scType||'')===ci.scType;
    const sameGrade=!ci?.gr||String(s.gr||'')===String(ci.gr||'');
    if(sameSchool&&sameType&&sameGrade) return s.region||'';
  }
  return '';
}
function activeClassGroups(state){
  const map=new Map();
  (state.mat||[]).filter(m=>m.kind==='class'&&m.st==='active').forEach(m=>{
    const ci=m.classInfo||{}, key=classGroupKey(ci);
    if(key.replace(/_/g,'')) map.set(key,ci);
  });
  return map;
}

function collectActualExecutionMetrics(state, IDX, filter=reportFilterFromDom()){
  const metrics={
    coachStuIds:new Set(), classMatIds:new Set(), classGroupKeys:new Set(), classStuIds:new Set(),
    regionCoachStuIds:new Map(), regionClassMatIds:new Map(), regionClassGroupKeys:new Map(), regionClassStuIds:new Map()
  };
  (state.mat||[]).forEach(m=>{
    (m.logs||[]).forEach(l=>{
      if(!isStatActualLog(l)||!logInPeriod(l,filter)) return;
      if((l.kind||m.kind)==='class'){
        metrics.classMatIds.add(String(m.id));
        const ci=m.classInfo||{}, group=classGroupKey(ci), stuIds=matchingClassStudentIds(ci,state);
        if(group.replace(/_/g,'')) metrics.classGroupKeys.add(group);
        stuIds.forEach(id=>metrics.classStuIds.add(id));
        const region=inferRegion(ci,state);
        if(region){
          if(!metrics.regionClassMatIds.has(region)) metrics.regionClassMatIds.set(region,new Set());
          if(!metrics.regionClassGroupKeys.has(region)) metrics.regionClassGroupKeys.set(region,new Set());
          if(!metrics.regionClassStuIds.has(region)) metrics.regionClassStuIds.set(region,new Set());
          metrics.regionClassMatIds.get(region).add(String(m.id));
          if(group.replace(/_/g,'')) metrics.regionClassGroupKeys.get(region).add(group);
          stuIds.forEach(id=>metrics.regionClassStuIds.get(region).add(id));
        }
      }else if(m.stuId){
        const id=String(m.stuId); metrics.coachStuIds.add(id);
        const stu=(IDX.stuById||{})[id], region=stu?.region||'';
        if(region){
          if(!metrics.regionCoachStuIds.has(region)) metrics.regionCoachStuIds.set(region,new Set());
          metrics.regionCoachStuIds.get(region).add(id);
        }
      }
    });
  });
  return metrics;
}

export function pivotByGradeV12(filter=reportFilterFromDom()){
  const state=getState(), IDX=withFreshIndexes(), res={};
  for(const lvl of ['초','중']) for(let g=1;g<=(lvl==='초'?6:3);g++) res[`${lvl}${g}`]={apply_coach:0,apply_class_cnt:0,apply_class_stu:0,diag:0,coach:0,class_cnt:0,class_stu:0,therapy:0};
  (state.stu||[]).forEach(s=>{
    const row=res[`${s.scType}${s.gr}`]; if(!row) return; const sts=s.supportTypes||[];
    if(sts.includes('방과후학습코칭')) row.apply_coach++;
    if(sts.includes('수업협력코칭')) row.apply_class_stu++;
    if(sts.includes('심리진단')) row.diag++;
    if(sts.includes('치료기관연계')) row.therapy++;
  });
  activeClassGroups(state).forEach(ci=>{const row=res[`${ci.scType||''}${ci.gr||''}`]; if(row) row.apply_class_cnt++;});
  const metrics=collectActualExecutionMetrics(state,IDX,filter);
  metrics.coachStuIds.forEach(id=>{const s=(IDX.stuById||{})[id],row=s&&res[`${s.scType}${s.gr}`]; if(row) row.coach++;});
  const seen=new Set();
  (state.mat||[]).forEach(m=>{
    if(!metrics.classMatIds.has(String(m.id))) return;
    const ci=m.classInfo||{}, key=classGroupKey(ci); if(seen.has(key)) return; seen.add(key);
    const row=res[`${ci.scType||''}${ci.gr||''}`]; if(row) row.class_cnt++;
  });
  metrics.classStuIds.forEach(id=>{const s=(IDX.stuById||{})[id],row=s&&res[`${s.scType}${s.gr}`]; if(row) row.class_stu++;});
  return res;
}

export function pivotByRegionV12(filter=reportFilterFromDom()){
  const state=getState(), IDX=withFreshIndexes(), regions=(state.cfg?.regions?.length?state.cfg.regions:['지역1','지역2']),res={};
  regions.forEach(r=>res[r]={apply_coach:0,apply_class_cnt:0,apply_class_stu:0,diag:0,coach:0,class_cnt:0,class_stu:0,therapy:0});
  (state.stu||[]).forEach(s=>{const row=res[s.region]; if(!row)return; const sts=s.supportTypes||[];
    if(sts.includes('방과후학습코칭')) row.apply_coach++;
    if(sts.includes('수업협력코칭')) row.apply_class_stu++;
    if(sts.includes('심리진단')) row.diag++;
    if(sts.includes('치료기관연계')) row.therapy++;
  });
  activeClassGroups(state).forEach(ci=>{const region=inferRegion(ci,state); if(region&&res[region]) res[region].apply_class_cnt++;});
  const metrics=collectActualExecutionMetrics(state,IDX,filter);
  for(const [r,ids] of metrics.regionCoachStuIds) if(res[r]) res[r].coach=ids.size;
  for(const [r,ids] of metrics.regionClassGroupKeys) if(res[r]) res[r].class_cnt=ids.size;
  for(const [r,ids] of metrics.regionClassStuIds) if(res[r]) res[r].class_stu=ids.size;
  return res;
}

export function pivotDyslexBorderV13(){
  const state=getState();
  const mk=()=>({applied:0,tested:0,pos_therapy:0,pos_coach:0,pos_class:0,neg_therapy:0,neg_coach:0,neg_class:0,unsup:0,unsupReasons:[]});
  const out={dyslex:mk(),border:mk()};
  (state.stu||[]).forEach(s=>{
    const areas=s.areas||[],types=s.supportTypes||[],diag=s.diagTest||{},unsupported=s.unsupported||{};
    [['dyslex','DYSLEX','dyslexia'],['border','BORDER','borderline']].forEach(([key,area,posKey])=>{
      if(!areas.includes(area)) return;
      const row=out[key]; row.applied++;
      if(diag.done){
        row.tested++;
        const prefix=diag[posKey]?'pos':'neg';
        if(types.includes('치료기관연계')) row[`${prefix}_therapy`]++;
        if(types.includes('방과후학습코칭')) row[`${prefix}_coach`]++;
        if(types.includes('수업협력코칭')) row[`${prefix}_class`]++;
      }
      if(unsupported.is){row.unsup++; if(unsupported.reason) row.unsupReasons.push(unsupported.reason);}
    });
  });
  return out;
}

export function installStatisticsOverrides(){
  app().pivotByGradeV12=pivotByGradeV12; app().pivotByRegionV12=pivotByRegionV12;
  window.pivotByGrade=pivotByGradeV12; window.pivotByRegion=pivotByRegionV12;
  window.pivotDyslexBorder=pivotDyslexBorderV13;
  const originalRenderPivots=window.renderPivots;
  if(typeof originalRenderPivots==='function'){
    window.renderPivots=function(...args){withFreshIndexes(true); return originalRenderPivots.apply(this,args);};
  }
}
