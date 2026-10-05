import { pivotByGradeV12, pivotByRegionV12 } from '../domain/statistics.js';

const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
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

const C = {
  navy: 'FF1F4E78', dark: 'FF243746', white: 'FFFFFFFF', header: 'FFD9EAF7',
  light: 'FFF4F7FA', zebra: 'FFFAFBFC', green: 'FFE2F0D9', yellow: 'FFFFF2CC',
  border: 'FF8A99A8', muted: 'FF5B6570',
};
const THIN = { style: 'thin', color: { argb: C.border } };
let excelJsPromise = null;

function state(){ return window.ClinicApp?.state || {}; }
function today(){ return new Date().toISOString().slice(0,10); }
function fmtDate(v){ return String(v || today()).replace(/-/g,'.'); }
function regions(s){ return (s.cfg?.regions?.length ? s.cfg.regions : ['지역1','지역2']); }
function gradeKeys(){ return [['초',1],['초',2],['초',3],['초',4],['초',5],['초',6],['중',1],['중',2],['중',3]]; }
function totals(pivot){
  const out = Object.fromEntries(METRIC_KEYS.map(k=>[k,0]));
  Object.values(pivot||{}).forEach(r => METRIC_KEYS.forEach(k => out[k] += Number(r?.[k]||0)));
  return out;
}

function ensureExcelJS(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if(excelJsPromise) return excelJsPromise;
  excelJsPromise = new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=EXCELJS_URL;
    script.async=true;
    script.onload=()=>window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS 로딩에 실패했습니다.'));
    script.onerror=()=>reject(new Error('행정 보고용 엑셀 엔진을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
  return excelJsPromise;
}

function border(){ return {top:THIN,left:THIN,bottom:THIN,right:THIN}; }
function font(size=9,bold=false,color=C.dark){ return {name:'맑은 고딕',size,bold,color:{argb:color}}; }
function fill(argb){ return {type:'pattern',pattern:'solid',fgColor:{argb}}; }
function align(horizontal='center',wrap=true){ return {horizontal,vertical:'middle',wrapText:wrap}; }

function styleRange(ws, r1, c1, r2, c2, opts={}){
  for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++){
    const cell=ws.getCell(r,c);
    if(opts.font) cell.font=opts.font;
    if(opts.fill) cell.fill=opts.fill;
    if(opts.alignment) cell.alignment=opts.alignment;
    if(opts.border!==false) cell.border=border();
    if(opts.numFmt) cell.numFmt=opts.numFmt;
  }
}

function setPage(ws, printArea, repeatRows=''){
  ws.views=[{showGridLines:false}];
  ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,
    margins:{left:0.25,right:0.25,top:0.45,bottom:0.45,header:0.15,footer:0.15},printArea};
  if(repeatRows) ws.pageSetup.printTitlesRow=repeatRows;
  ws.headerFooter={oddFooter:'&C&P / &N'};
}

function titleBlock(ws,title,subtitle,lastCol){
  ws.mergeCells(1,1,2,lastCol);
  const t=ws.getCell(1,1); t.value=title; t.font=font(18,true,C.dark); t.alignment=align('center');
  ws.getRow(1).height=24; ws.getRow(2).height=10;
  ws.mergeCells(3,1,3,lastCol);
  const s=ws.getCell(3,1); s.value=subtitle; s.font=font(9,false,C.muted); s.alignment=align('right');
  ws.getRow(3).height=18;
}

function section(ws,row,text,lastCol){
  ws.mergeCells(row,1,row,lastCol);
  const c=ws.getCell(row,1); c.value=text; c.fill=fill(C.navy); c.font=font(10,true,C.white); c.alignment=align('left');
  ws.getRow(row).height=22; return row+1;
}
function headerRow(ws,row,lastCol){ styleRange(ws,row,1,row,lastCol,{font:font(9,true),fill:fill(C.header),alignment:align('center')}); ws.getRow(row).height=31; }
function dataRow(ws,row,lastCol,zebra=false){ styleRange(ws,row,1,row,lastCol,{font:font(9),fill:fill(zebra?C.zebra:C.white),alignment:align('center')}); ws.getRow(row).height=20; }
function totalRow(ws,row,lastCol,labelFill=C.green){ styleRange(ws,row,1,row,lastCol,{font:font(9,true),fill:fill(labelFill),alignment:align('center')}); ws.getRow(row).height=21; }

function afterSchoolPivot(s){
  const ids = AFTER_AREAS.map(x=>x[0]);
  const out = Object.fromEntries(gradeKeys().map(([lv,g])=>[`${lv}${g}`,Object.fromEntries(ids.map(a=>[a,0]))]));
  (s.stu||[]).forEach(stu=>{ if(!(stu.supportTypes||[]).includes('방과후학습코칭')) return; const row=out[`${stu.scType}${stu.gr}`]; if(!row) return; (stu.areas||[]).forEach(a=>{if(a in row) row[a]++;}); });
  return out;
}
function therapyData(s){
  const list=(s.stu||[]).filter(stu=>(stu.supportTypes||[]).includes('치료기관연계'));
  const pivot=Object.fromEntries(gradeKeys().map(([lv,g])=>[`${lv}${g}`,Object.fromEntries(THERAPY_IDS.map(a=>[a,0]))]));
  list.forEach(stu=>{const row=pivot[`${stu.scType}${stu.gr}`]; if(!row) return; (stu.areas||[]).forEach(a=>{if(a in row) row[a]++;});});
  return {list,pivot};
}
function dyslexBorder(s){
  const mk=()=>({applied:0,tested:0,pos_therapy:0,pos_coach:0,pos_class:0,neg_therapy:0,neg_coach:0,neg_class:0,unsup:0,reasons:[]});
  const out={dyslex:mk(),border:mk()};
  (s.stu||[]).forEach(stu=>{const areas=stu.areas||[],types=stu.supportTypes||[],diag=stu.diagTest||{},unsup=stu.unsupported||{};
    [['dyslex','DYSLEX','dyslexia'],['border','BORDER','borderline']].forEach(([key,area,posKey])=>{if(!areas.includes(area)) return; const r=out[key]; r.applied++; if(diag.done) r.tested++; const prefix=diag[posKey]?'pos':'neg'; if(types.includes('치료기관연계')) r[`${prefix}_therapy`]++; if(types.includes('방과후학습코칭')) r[`${prefix}_coach`]++; if(types.includes('수업협력코칭')) r[`${prefix}_class`]++; if(unsup.is){r.unsup++; if(unsup.reason) r.reasons.push(unsup.reason);}});
  }); return out;
}
function reportMetrics(s,gradePivot){ const gt=totals(gradePivot); return [['등록 학생',(s.stu||[]).length,'명'],['활동 지원단',(s.stf||[]).filter(x=>x.st==='active').length,'명'],['활성 매칭',(s.mat||[]).filter(x=>x.st==='active').length,'건'],['실제 학습코칭',gt.coach,'명'],['실제 수업협력',gt.class_cnt,'학급']]; }

function buildSummarySheet(wb,s,dateStr,type){
  const ws=wb.addWorksheet('종합보고서',{properties:{defaultRowHeight:20}}), grade=pivotByGradeV12(), region=pivotByRegionV12();
  const org=s.cfg?.org||'충북학습종합클리닉센터',base=s.cfg?.base||'거점센터',admin=s.cfg?.admin||'-';
  titleBlock(ws,type==='quarter'?`${org} 지역거점 지원 실적`:`${org} ${base} 지원 실적`,`기준일: ${fmtDate(dateStr)}  |  작성: ${admin}`,10);
  ws.columns=[11,8,13,17,17,11,13,17,17,14].map(width=>({width}));
  let row=5; row=section(ws,row,'Ⅰ. 핵심 현황',10);
  reportMetrics(s,grade).forEach(([label,value,unit],idx)=>{const c1=idx*2+1,c2=c1+1; ws.mergeCells(row,c1,row,c2); ws.mergeCells(row+1,c1,row+1,c2); const h=ws.getCell(row,c1); h.value=label; h.fill=fill(C.light); h.font=font(8,true); h.alignment=align('center'); const v=ws.getCell(row+1,c1); v.value=`${Number(value).toLocaleString('ko-KR')}${unit}`; v.font=font(13,true,C.navy); v.alignment=align('center'); for(let r0=row;r0<=row+1;r0++) for(let c=c1;c<=c2;c++) ws.getCell(r0,c).border=border();});
  ws.getRow(row).height=20; ws.getRow(row+1).height=28; row+=3;
  row=section(ws,row,'Ⅱ. 학교급별 지원 실적',10); const gradeHeader=row;
  ws.getRow(row).values=['학교급','학년','방과후 신청','수업협력 신청(학급)','수업협력 신청(학생)','심리진단','방과후 실적','수업협력 실적(학급)','수업협력 실적(학생)','치료기관연계']; headerRow(ws,row,10); row++;
  const grand=Object.fromEntries(METRIC_KEYS.map(k=>[k,0]));
  for(const [lv,max] of [['초',6],['중',3]]){const sub=Object.fromEntries(METRIC_KEYS.map(k=>[k,0])); for(let g=1;g<=max;g++){const d=grade[`${lv}${g}`]||{}; ws.getRow(row).values=[g===1?lv:'',g,...METRIC_KEYS.map(k=>Number(d[k]||0))]; dataRow(ws,row,10,row%2===0); METRIC_KEYS.forEach(k=>{sub[k]+=Number(d[k]||0);grand[k]+=Number(d[k]||0);}); row++;} ws.getRow(row).values=[`${lv} 소계`,'',...METRIC_KEYS.map(k=>sub[k])]; totalRow(ws,row,10); row++;}
  ws.getRow(row).values=['합계','',...METRIC_KEYS.map(k=>grand[k])]; totalRow(ws,row,10,C.yellow); row+=2;
  row=section(ws,row,'Ⅲ. 지역별 지원 현황',10);
  ws.getRow(row).values=['지역','방과후 신청','수업협력 신청(학급)','수업협력 신청(학생)','심리진단','방과후 실적','수업협력 실적(학급)','수업협력 실적(학생)','치료기관연계','비고']; headerRow(ws,row,10); row++;
  const rGrand=Object.fromEntries(METRIC_KEYS.map(k=>[k,0])); regions(s).forEach((name,idx)=>{const d=region[name]||{}; ws.getRow(row).values=[name,...METRIC_KEYS.map(k=>Number(d[k]||0)),'']; dataRow(ws,row,10,idx%2===1); METRIC_KEYS.forEach(k=>rGrand[k]+=Number(d[k]||0)); row++;});
  ws.getRow(row).values=['합계',...METRIC_KEYS.map(k=>rGrand[k]),'']; totalRow(ws,row,10,C.yellow); row+=2;
  row=section(ws,row,'Ⅳ. 작성 기준',10); ['• 신청 현황은 학생 등록 및 수업협력 활성 매칭을 기준으로 집계합니다.','• 실제 실적은 실시·검증·지급 상태의 활동 로그를 기준으로 집계합니다.','• 치료기관연계 세부 시트는 개인정보 최소화를 위해 학생 성명을 포함하지 않습니다.','• 본 파일은 보고·회의·결재 보조용 통계자료이며 원자료 수정용 파일이 아닙니다.'].forEach(note=>{ws.mergeCells(row,1,row,10); const c=ws.getCell(row,1); c.value=note; c.font=font(8,false,C.muted); c.alignment=align('left'); ws.getRow(row).height=18; row++;});
  ws.views=[{state:'frozen',ySplit:gradeHeader,showGridLines:false}]; setPage(ws,`A1:J${row}`,`${gradeHeader}:${gradeHeader}`);
}

function buildAfterSchoolSheet(wb,s,dateStr){
  const ws=wb.addWorksheet('방과후학습코칭',{properties:{defaultRowHeight:20}}),pivot=afterSchoolPivot(s),ids=AFTER_AREAS.map(x=>x[0]),labels=AFTER_AREAS.map(x=>x[1]),lastCol=3+ids.length;
  titleBlock(ws,'방과후학습코칭 지원 현황',`기준일: ${fmtDate(dateStr)}  |  영역별 학생 수`,lastCol); ws.columns=[9,9,...ids.map(()=>13),10].map(width=>({width})); let row=5;
  ws.getRow(row).values=['학교급','학년',...labels,'합계']; headerRow(ws,row,lastCol); const header=row; row++; const grand=Object.fromEntries(ids.map(a=>[a,0]));
  for(const [lv,max] of [['초',6],['중',3]]){const sub=Object.fromEntries(ids.map(a=>[a,0])); for(let g=1;g<=max;g++){const d=pivot[`${lv}${g}`]||{},vals=ids.map(a=>Number(d[a]||0)); ws.getRow(row).values=[g===1?lv:'',`${g}학년`,...vals,vals.reduce((a,b)=>a+b,0)]; dataRow(ws,row,lastCol,row%2===0); ids.forEach(a=>{sub[a]+=Number(d[a]||0);grand[a]+=Number(d[a]||0);}); row++;} const vals=ids.map(a=>sub[a]); ws.getRow(row).values=[`${lv} 소계`,'',...vals,vals.reduce((a,b)=>a+b,0)]; totalRow(ws,row,lastCol); row++;}
  const vals=ids.map(a=>grand[a]); ws.getRow(row).values=['합계','',...vals,vals.reduce((a,b)=>a+b,0)]; totalRow(ws,row,lastCol,C.yellow); ws.views=[{state:'frozen',ySplit:header,showGridLines:false}]; setPage(ws,`A1:${ws.getColumn(lastCol).letter}${row}`,`${header}:${header}`);
}

function buildTherapySheet(wb,s,dateStr){
  const ws=wb.addWorksheet('치료기관연계',{properties:{defaultRowHeight:20}}),{list,pivot}=therapyData(s); titleBlock(ws,'치료기관연계 지원 현황',`기준일: ${fmtDate(dateStr)}  |  개인정보 최소화: 학생 성명 미포함`,8); ws.columns=[7,18,9,8,26,20,23,22].map(width=>({width})); let row=5;
  ws.getRow(row).values=['번호','학교명','학년','성별','지원내용','연계기관','지원기간','비고']; headerRow(ws,row,8); const header=row; row++;
  if(list.length) list.forEach((stu,idx)=>{const therapy=stu.therapy||{},areas=(stu.areas||[]).map(a=>AREA_MAP[a]?.alt||a).join(', '); ws.getRow(row).values=[idx+1,stu.sc||'',`${stu.scType||''}${stu.gr||''}`,stu.gen||'',areas,therapy.inst||'',`${therapy.start||''} ~ ${therapy.end||''}`,(stu.areas||[]).includes('ETC')?(stu.etcDetail||''):'']; dataRow(ws,row,8,idx%2===1); ws.getCell(row,5).alignment=align('left'); ws.getCell(row,8).alignment=align('left'); row++;}); else {ws.mergeCells(row,1,row,8); ws.getCell(row,1).value='치료기관연계 대상 학생 없음'; dataRow(ws,row,8); row++;}
  row+=1; row=section(ws,row,'지원내용별 집계',8); ws.getRow(row).values=['학교급','학년','난독증','언어','경계선지능','ADHD','심리정서','기타']; headerRow(ws,row,8); row++; const grand=Object.fromEntries(THERAPY_IDS.map(a=>[a,0]));
  for(const [lv,max] of [['초',6],['중',3]]){const sub=Object.fromEntries(THERAPY_IDS.map(a=>[a,0])); for(let g=1;g<=max;g++){const d=pivot[`${lv}${g}`]||{},vals=THERAPY_IDS.map(a=>Number(d[a]||0)); ws.getRow(row).values=[g===1?lv:'',`${g}학년`,...vals]; dataRow(ws,row,8,row%2===0); THERAPY_IDS.forEach(a=>{sub[a]+=Number(d[a]||0);grand[a]+=Number(d[a]||0);}); row++;} ws.getRow(row).values=[`${lv} 소계`,'',...THERAPY_IDS.map(a=>sub[a])]; totalRow(ws,row,8); row++;}
  ws.getRow(row).values=['합계','',...THERAPY_IDS.map(a=>grand[a])]; totalRow(ws,row,8,C.yellow); ws.views=[{state:'frozen',ySplit:header,showGridLines:false}]; setPage(ws,`A1:H${row}`,`${header}:${header}`);
}

function buildDyslexSheet(wb,s,dateStr){
  const ws=wb.addWorksheet('난독경계선',{properties:{defaultRowHeight:20}}),data=dyslexBorder(s); titleBlock(ws,'난독증 및 경계선지능 지원 현황',`기준일: ${fmtDate(dateStr)}  |  진단·지원유형 교차 현황`,10); ws.columns=[13,10,10,11,11,14,11,11,14,27].map(width=>({width})); let row=5;
  ws.getRow(row).values=['분류','지원신청','진단검사','난독증/경계선인 경우','','','난독증/경계선 아닌 경우','','','미지원 수 및 사유']; ws.getRow(row+1).values=['','','','치료지원','학습코칭','수업협력코칭','치료지원','학습코칭','수업협력코칭','']; ws.mergeCells(row,4,row,6); ws.mergeCells(row,7,row,9); [1,2,3,10].forEach(c=>ws.mergeCells(row,c,row+1,c)); headerRow(ws,row,10); headerRow(ws,row+1,10); row+=2;
  for(const [label,key] of [['난독증','dyslex'],['경계선지능','border']]){const d=data[key],reasons=[...new Set(d.reasons)].join(', ')||'-'; ws.getRow(row).values=[label,d.applied,d.tested,d.pos_therapy,d.pos_coach,d.pos_class,d.neg_therapy,d.neg_coach,d.neg_class,`${d.unsup} (${reasons})`]; dataRow(ws,row,10,row%2===0); ws.getCell(row,10).alignment=align('left'); row++;}
  row+=1; ws.mergeCells(row,1,row,10); const n=ws.getCell(row,1); n.value='※ 학생명은 포함하지 않으며 프로그램의 등록·진단·지원유형 정보를 기준으로 집계합니다.'; n.font=font(8,false,C.muted); n.alignment=align('left'); setPage(ws,`A1:J${row}`,'5:6');
}

async function buildWorkbook(){
  const ExcelJS=await ensureExcelJS(),s=state(),dateStr=document.getElementById('stat-date')?.value||today(),type=document.getElementById('stat-type')?.value||'month';
  const wb=new ExcelJS.Workbook(); wb.creator=s.cfg?.org||'충북학습종합클리닉센터'; wb.created=new Date(); wb.modified=new Date(); wb.title='충북종합학습클리닉 지원 실적 보고서'; wb.subject='지원 실적 통계'; wb.company=s.cfg?.org||'';
  buildSummarySheet(wb,s,dateStr,type); buildAfterSchoolSheet(wb,s,dateStr); buildTherapySheet(wb,s,dateStr); buildDyslexSheet(wb,s,dateStr); return {wb,s,dateStr};
}
function downloadBuffer(buffer,filename){const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function exportAdministrativeStatisticsExcel(){
  try{window.ClinicApp?.toast?.('행정 보고형 통계 엑셀을 생성하고 있습니다.','info'); const {wb,s,dateStr}=await buildWorkbook(); const buffer=await wb.xlsx.writeBuffer(); const base=(s.cfg?.base||'거점센터').replace(/[\\/:*?"<>|]/g,'_'); downloadBuffer(buffer,`${base}_지원실적_행정보고서_${dateStr}.xlsx`); window.ClinicApp?.toast?.('행정 보고형 통계 엑셀을 생성했습니다.','success');}
  catch(err){console.error('[V13 statistics report export]',err); window.ClinicApp?.toast?.(`통계 엑셀 생성 실패: ${err.message||err}`,'danger');}
}
export function installAdministrativeStatisticsExport(){window.exportStatExcel=exportAdministrativeStatisticsExcel; window.ClinicApp=window.ClinicApp||{}; window.ClinicApp.exportStatExcel=exportAdministrativeStatisticsExcel; window.__V13_STATISTICS_EXCEL__='administrative-report-exceljs';}
