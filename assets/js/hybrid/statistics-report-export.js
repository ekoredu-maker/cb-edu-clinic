import { pivotByGradeV12, pivotByRegionV12 } from '../domain/statistics.js';

const AREA_SPECS = [
  ['HANGUL','한글미해득','한글미해득'],
  ['BASIC','기초학습지원','기초학습지원'],
  ['DYSLEX','난독증','난독증'],
  ['READING','읽기곤란','읽기곤란'],
  ['ADHD','ADHD','ADHD'],
  ['BORDER','경계선지능','경계선지능'],
  ['EMOTION','심리정서','심리정서'],
  ['LANG','언어발달지연','언어'],
  ['ETC','기타','기타'],
];
const AFTER_AREAS = AREA_SPECS.filter(x => x[0] !== 'LANG');
const THERAPY_IDS = ['DYSLEX','LANG','BORDER','ADHD','EMOTION','ETC'];
const AREA_MAP = Object.fromEntries(AREA_SPECS.map(([id,label,alt]) => [id,{label,alt}]));
const METRIC_KEYS = ['apply_coach','apply_class_cnt','apply_class_stu','diag','coach','class_cnt','class_stu','therapy'];

function state(){ return window.ClinicApp?.state || {}; }
function today(){ return new Date().toISOString().slice(0,10); }
function fmtDate(v){ return String(v || today()).replace(/-/g,'.'); }
function regions(s){ return (s.cfg?.regions?.length ? s.cfg.regions : ['지역1','지역2']); }
function gradeKeys(){ return [['초',1],['초',2],['초',3],['초',4],['초',5],['초',6],['중',1],['중',2],['중',3]]; }
function sumRow(row){ return METRIC_KEYS.reduce((a,k)=>a+Number(row?.[k]||0),0); }
function totals(pivot){
  const out = Object.fromEntries(METRIC_KEYS.map(k=>[k,0]));
  Object.values(pivot||{}).forEach(r => METRIC_KEYS.forEach(k => out[k] += Number(r?.[k]||0)));
  return out;
}

function afterSchoolPivot(s){
  const ids = AFTER_AREAS.map(x=>x[0]);
  const out = Object.fromEntries(gradeKeys().map(([lv,g])=>[`${lv}${g}`,Object.fromEntries(ids.map(a=>[a,0]))]));
  (s.stu||[]).forEach(stu=>{
    if(!(stu.supportTypes||[]).includes('방과후학습코칭')) return;
    const row = out[`${stu.scType}${stu.gr}`];
    if(!row) return;
    (stu.areas||[]).forEach(a=>{ if(a in row) row[a]++; });
  });
  return out;
}

function therapyData(s){
  const list = (s.stu||[]).filter(stu=>(stu.supportTypes||[]).includes('치료기관연계'));
  const pivot = Object.fromEntries(gradeKeys().map(([lv,g])=>[`${lv}${g}`,Object.fromEntries(THERAPY_IDS.map(a=>[a,0]))]));
  list.forEach(stu=>{
    const row = pivot[`${stu.scType}${stu.gr}`];
    if(!row) return;
    (stu.areas||[]).forEach(a=>{ if(a in row) row[a]++; });
  });
  return {list,pivot};
}

function dyslexBorder(s){
  const mk=()=>({applied:0,tested:0,pos_therapy:0,pos_coach:0,pos_class:0,neg_therapy:0,neg_coach:0,neg_class:0,unsup:0,reasons:[]});
  const out={dyslex:mk(),border:mk()};
  (s.stu||[]).forEach(stu=>{
    const areas=stu.areas||[], types=stu.supportTypes||[], diag=stu.diagTest||{}, unsup=stu.unsupported||{};
    [['dyslex','DYSLEX','dyslexia'],['border','BORDER','borderline']].forEach(([key,area,posKey])=>{
      if(!areas.includes(area)) return;
      const r=out[key]; r.applied++; if(diag.done) r.tested++;
      const prefix=diag[posKey]?'pos':'neg';
      if(types.includes('치료기관연계')) r[`${prefix}_therapy`]++;
      if(types.includes('방과후학습코칭')) r[`${prefix}_coach`]++;
      if(types.includes('수업협력코칭')) r[`${prefix}_class`]++;
      if(unsup.is){ r.unsup++; if(unsup.reason) r.reasons.push(unsup.reason); }
    });
  });
  return out;
}

function reportMetrics(s, gradePivot){
  const gt=totals(gradePivot);
  return [
    ['등록 학생',(s.stu||[]).length,'명'],
    ['활동 지원단',(s.stf||[]).filter(x=>x.st==='active').length,'명'],
    ['활성 매칭',(s.mat||[]).filter(x=>x.st==='active').length,'건'],
    ['실제 학습코칭',gt.coach,'명'],
    ['실제 수업협력',gt.class_cnt,'학급'],
  ];
}

function addGradeRows(aoa,pivot){
  let grand=Object.fromEntries(METRIC_KEYS.map(k=>[k,0]));
  for(const [lv,max] of [['초',6],['중',3]]){
    const sub=Object.fromEntries(METRIC_KEYS.map(k=>[k,0]));
    for(let g=1;g<=max;g++){
      const r=pivot[`${lv}${g}`]||{};
      aoa.push([g===1?lv:'',g,...METRIC_KEYS.map(k=>Number(r[k]||0))]);
      METRIC_KEYS.forEach(k=>{sub[k]+=Number(r[k]||0);grand[k]+=Number(r[k]||0);});
    }
    aoa.push([`${lv} 소계`,'',...METRIC_KEYS.map(k=>sub[k])]);
  }
  aoa.push(['합계','',...METRIC_KEYS.map(k=>grand[k])]);
}

function addRegionRows(aoa,pivot,s){
  const grand=Object.fromEntries(METRIC_KEYS.map(k=>[k,0]));
  regions(s).forEach(name=>{
    const r=pivot[name]||{};
    aoa.push([name,...METRIC_KEYS.map(k=>Number(r[k]||0))]);
    METRIC_KEYS.forEach(k=>grand[k]+=Number(r[k]||0));
  });
  aoa.push(['합계',...METRIC_KEYS.map(k=>grand[k])]);
}

function makeSummarySheet(XLSX,s,dateStr,type){
  const grade=pivotByGradeV12(), region=pivotByRegionV12();
  const org=s.cfg?.org||'충북학습종합클리닉센터', base=s.cfg?.base||'거점센터', admin=s.cfg?.admin||'-';
  const title=type==='quarter'?`${org} 지역거점 지원 실적`:`${org} ${base} 지원 실적`;
  const aoa=[
    [title],
    [`기준일: ${fmtDate(dateStr)}  |  작성: ${admin}`],
    [],
    ['Ⅰ. 핵심 현황'],
  ];
  const metrics=reportMetrics(s,grade);
  aoa.push(metrics.flatMap(([label])=>[label,'']));
  aoa.push(metrics.flatMap(([,value,unit])=>[`${Number(value).toLocaleString('ko-KR')}${unit}`,'']));
  aoa.push([]);
  aoa.push(['Ⅱ. 학교급별 지원 실적']);
  aoa.push(['학교급','학년','방과후 신청','수업협력 신청(학급)','수업협력 신청(학생)','심리진단','방과후 실적','수업협력 실적(학급)','수업협력 실적(학생)','치료기관연계']);
  addGradeRows(aoa,grade);
  aoa.push([]);
  aoa.push(['Ⅲ. 지역별 지원 현황']);
  aoa.push(['지역','방과후 신청','수업협력 신청(학급)','수업협력 신청(학생)','심리진단','방과후 실적','수업협력 실적(학급)','수업협력 실적(학생)','치료기관연계']);
  addRegionRows(aoa,region,s);
  aoa.push([]);
  aoa.push(['Ⅳ. 작성 기준']);
  aoa.push(['• 신청 현황은 학생 등록 및 수업협력 활성 매칭을 기준으로 집계합니다.']);
  aoa.push(['• 실제 실적은 실시·검증·지급 상태의 활동 로그를 기준으로 집계합니다.']);
  aoa.push(['• 치료기관연계 세부 시트는 개인정보 최소화를 위해 학생 성명을 포함하지 않습니다.']);
  aoa.push(['• 본 파일은 보고·회의·결재 보조용 통계자료이며 원자료 수정용 파일이 아닙니다.']);

  const ws=XLSX.utils.aoa_to_sheet(aoa);
  const last=aoa.length-1;
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:9}}, {s:{r:1,c:0},e:{r:1,c:9}},
    {s:{r:3,c:0},e:{r:3,c:9}},
    {s:{r:7,c:0},e:{r:7,c:9}},
  ];
  // Find remaining section rows robustly and merge them across the report width.
  aoa.forEach((r,idx)=>{ if(idx>7 && typeof r[0]==='string' && /^[ⅢⅣ]\./.test(r[0])) ws['!merges'].push({s:{r:idx,c:0},e:{r:idx,c:9}}); });
  for(let r=last-3;r<=last;r++) ws['!merges'].push({s:{r,c:0},e:{r,c:9}});
  ws['!cols']=[{wch:11},{wch:7},{wch:13},{wch:17},{wch:17},{wch:11},{wch:13},{wch:17},{wch:17},{wch:14}];
  ws['!rows']=[{hpt:28},{hpt:18},null,{hpt:22},{hpt:21},{hpt:28}];
  ws['!margins']={left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.15,footer:0.15};
  ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:0};
  return ws;
}

function makeAfterSchoolSheet(XLSX,s,dateStr){
  const p=afterSchoolPivot(s), ids=AFTER_AREAS.map(x=>x[0]), labels=AFTER_AREAS.map(x=>x[1]);
  const aoa=[[`방과후학습코칭 지원현황 (${fmtDate(dateStr)} 기준)`],[],['학교급','학년',...labels,'합계']];
  const grand=Object.fromEntries(ids.map(a=>[a,0]));
  for(const [lv,max] of [['초',6],['중',3]]){
    const sub=Object.fromEntries(ids.map(a=>[a,0]));
    for(let g=1;g<=max;g++){
      const r=p[`${lv}${g}`]||{}; const vals=ids.map(a=>Number(r[a]||0));
      aoa.push([g===1?lv:'',`${g}학년`,...vals,vals.reduce((a,b)=>a+b,0)]);
      ids.forEach(a=>{sub[a]+=Number(r[a]||0);grand[a]+=Number(r[a]||0);});
    }
    const vals=ids.map(a=>sub[a]); aoa.push([`${lv} 소계`,'',...vals,vals.reduce((a,b)=>a+b,0)]);
  }
  const vals=ids.map(a=>grand[a]); aoa.push(['합계','',...vals,vals.reduce((a,b)=>a+b,0)]);
  const ws=XLSX.utils.aoa_to_sheet(aoa), maxCol=2+ids.length;
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:maxCol}}];
  ws['!cols']=[{wch:9},{wch:9},...ids.map(()=>({wch:14})),{wch:10}];
  ws['!margins']={left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.15,footer:0.15};
  ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:0};
  return ws;
}

function makeTherapySheet(XLSX,s,dateStr){
  const {list,pivot}=therapyData(s);
  const aoa=[[`치료기관연계 지원 현황 (${fmtDate(dateStr)} 기준)`],['※ 개인정보 최소화: 학생 성명 미포함'],[],['번호','학교명','학년','성별','지원내용','연계기관','지원기간','비고']];
  list.forEach((stu,i)=>{
    const areas=(stu.areas||[]).map(a=>AREA_MAP[a]?.alt||a).join(', ');
    aoa.push([i+1,stu.sc||'',`${stu.scType||''}${stu.gr||''}`,stu.gen||'',areas,stu.therapy?.inst||'',`${stu.therapy?.start||''} ~ ${stu.therapy?.end||''}`,(stu.areas||[]).includes('ETC')?(stu.etcDetail||''):'']);
  });
  if(!list.length) aoa.push(['','치료기관연계 대상 학생 없음']);
  aoa.push([],['지원내용별 집계'],['학교급','학년','난독증','언어','경계선지능','ADHD','심리정서','기타']);
  const grand=Object.fromEntries(THERAPY_IDS.map(a=>[a,0]));
  for(const [lv,max] of [['초',6],['중',3]]){
    const sub=Object.fromEntries(THERAPY_IDS.map(a=>[a,0]));
    for(let g=1;g<=max;g++){
      const r=pivot[`${lv}${g}`]||{}; const vals=THERAPY_IDS.map(a=>Number(r[a]||0));
      aoa.push([g===1?lv:'',`${g}학년`,...vals]);
      THERAPY_IDS.forEach(a=>{sub[a]+=Number(r[a]||0);grand[a]+=Number(r[a]||0);});
    }
    aoa.push([`${lv} 소계`,'',...THERAPY_IDS.map(a=>sub[a])]);
  }
  aoa.push(['합계','',...THERAPY_IDS.map(a=>grand[a])]);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:7}}];
  const sectionIndex=aoa.findIndex(r=>r[0]==='지원내용별 집계'); if(sectionIndex>=0) ws['!merges'].push({s:{r:sectionIndex,c:0},e:{r:sectionIndex,c:7}});
  ws['!cols']=[{wch:7},{wch:18},{wch:9},{wch:8},{wch:26},{wch:20},{wch:23},{wch:22}];
  ws['!margins']={left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.15,footer:0.15};
  ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:0};
  return ws;
}

function makeDyslexSheet(XLSX,s,dateStr){
  const p=dyslexBorder(s);
  const row=(label,d)=>[label,d.applied,d.tested,d.pos_therapy,d.pos_coach,d.pos_class,d.neg_therapy,d.neg_coach,d.neg_class,`${d.unsup} (${[...new Set(d.reasons)].join(', ')||'-'})`];
  const aoa=[
    [`난독증 및 경계선지능 지원 현황 (${fmtDate(dateStr)} 기준)`],[],
    ['분류','지원신청','진단검사','난독증/경계선인 경우','','','난독증/경계선 아닌 경우','','','미지원 수 및 사유'],
    ['','','','치료지원','학습코칭','수업협력코칭','치료지원','학습코칭','수업협력코칭',''],
    row('난독증',p.dyslex),row('경계선지능',p.border),[],
    ['※ 학생명은 포함하지 않으며 프로그램의 등록·진단·지원유형 정보를 기준으로 집계합니다.'],
  ];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:2,c:3},e:{r:2,c:5}},{s:{r:2,c:6},e:{r:2,c:8}},{s:{r:7,c:0},e:{r:7,c:9}}];
  [0,1,2,9].forEach(c=>ws['!merges'].push({s:{r:2,c},e:{r:3,c}}));
  ws['!cols']=[{wch:13},{wch:10},{wch:10},{wch:11},{wch:11},{wch:14},{wch:11},{wch:11},{wch:14},{wch:26}];
  ws['!margins']={left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.15,footer:0.15};
  ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:0};
  return ws;
}

function buildWorkbook(){
  const XLSX=window.XLSX; if(!XLSX) throw new Error('엑셀 라이브러리가 준비되지 않았습니다.');
  const s=state();
  const dateStr=document.getElementById('stat-date')?.value || today();
  const type=document.getElementById('stat-type')?.value || 'base';
  const wb=XLSX.utils.book_new();
  wb.Props={Title:'충북종합학습클리닉 지원 실적 보고서',Subject:'지원 실적 통계',Author:s.cfg?.org||'충북학습종합클리닉센터',CreatedDate:new Date()};
  XLSX.utils.book_append_sheet(wb,makeSummarySheet(XLSX,s,dateStr,type),'종합보고서');
  XLSX.utils.book_append_sheet(wb,makeAfterSchoolSheet(XLSX,s,dateStr),'방과후학습코칭');
  XLSX.utils.book_append_sheet(wb,makeTherapySheet(XLSX,s,dateStr),'치료기관연계');
  XLSX.utils.book_append_sheet(wb,makeDyslexSheet(XLSX,s,dateStr),'난독경계선');
  return {wb,dateStr,s};
}

export function exportAdministrativeStatisticsExcel(){
  try{
    const XLSX=window.XLSX; const {wb,dateStr,s}=buildWorkbook();
    const base=(s.cfg?.base||'거점센터').replace(/[\\/:*?"<>|]/g,'_');
    XLSX.writeFile(wb,`${base}_지원실적_보고서_${dateStr}.xlsx`);
    window.ClinicApp?.toast?.('행정 보고형 통계 엑셀을 생성했습니다.','success');
  }catch(err){
    console.error('[V13 statistics report export]',err);
    window.ClinicApp?.toast?.(`통계 엑셀 생성 실패: ${err.message||err}`,'danger');
  }
}

export function installAdministrativeStatisticsExport(){
  window.exportStatExcel=exportAdministrativeStatisticsExcel;
  window.ClinicApp=window.ClinicApp||{};
  window.ClinicApp.exportStatExcel=exportAdministrativeStatisticsExcel;
  window.__V13_STATISTICS_EXCEL__='administrative-report';
}
