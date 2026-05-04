/* =============================================================
 * 통계 피벗
 * ============================================================= */
function renderPivots(){
  const type = $('stat-type').value;
  const dateStr = $('stat-date').value || new Date().toISOString().slice(0,10);
  const dateFormatted = dateStr.replace(/-/g,'.');
  const orgName = db.cfg.org || '충북학습종합클리닉센터';
  const baseName = db.cfg.base || '○○거점';

  const title1 = type==='quarter' 
    ? `${orgName} 지역거점 지원 실적 (${dateFormatted}.기준)`
    : `${orgName} ${baseName} 지원 실적 (${dateFormatted}.기준)`;

  // Pivot 1: 지역거점별 지원 실적 (학교급×8지표)
  const p1 = pivotByGrade();
  // Pivot 2: 지역별 지원현황
  const p2 = pivotByRegion();
  // Pivot 3: 방과후학습코칭 지원현황 (학년×9영역)
  const p3 = pivotAfterSchool();

  let html = '';

  // Pivot 1
  html += `<div style="margin-bottom:20px">
    <div class="pivot-title">${title1}<div class="pivot-sub">지역거점별 지원 실적</div></div>
    <table class="pivot-tbl">
      <thead>
        <tr>
          <th rowspan="2">학교급</th>
          <th colspan="3">신청 학생수</th>
          <th rowspan="2">심리진단</th>
          <th rowspan="2">방과후 학습코칭</th>
          <th rowspan="2">수업협력코칭<br>(학급수)</th>
          <th rowspan="2">수업협력코칭<br>(학생수)</th>
          <th rowspan="2">치료기관연계</th>
        </tr>
        <tr>
          <th>방과후<br>(학생수)</th>
          <th>수업협력<br>(학급수)</th>
          <th>수업협력<br>(학생수)</th>
        </tr>
      </thead>
      <tbody>${renderGradeRows(p1, '초', 6)}${renderGradeRows(p1, '중', 3)}
        <tr class="total"><td class="label">합계</td>${renderTotalCells(p1)}</tr>
      </tbody>
    </table>
  </div>`;

  // Pivot 2
  html += `<div style="margin-bottom:20px">
    <div class="pivot-title">지역별 지원현황 (${dateFormatted}.기준)</div>
    <table class="pivot-tbl">
      <thead>
        <tr>
          <th rowspan="2">지역</th>
          <th colspan="3">신청 학생수</th>
          <th rowspan="2">심리진단</th>
          <th rowspan="2">방과후 학습코칭</th>
          <th rowspan="2">수업협력코칭<br>(학급수)</th>
          <th rowspan="2">수업협력코칭<br>(학생수)</th>
          <th rowspan="2">치료기관연계</th>
        </tr>
        <tr><th>방과후</th><th>수협(학급)</th><th>수협(학생)</th></tr>
      </thead>
      <tbody>${(db.cfg.regions && db.cfg.regions.length ? db.cfg.regions : ['지역1','지역2']).map(r=>renderRegionRow(p2[r]||{}, r)).join('')}
        <tr class="total"><td class="label">합계</td>${renderRegionTotalCells(p2)}</tr>
      </tbody>
    </table>
  </div>`;

  // Pivot 3
  html += `<div style="margin-bottom:20px">
    <div class="pivot-title">방과후학습코칭 지원현황 (${dateFormatted}.기준)</div>
    <table class="pivot-tbl">
      <thead>
        <tr>
          <th rowspan="2">학교급</th><th rowspan="2">학년</th>
          ${AREAS.filter(a=>a.scope.includes('방과후')).map(a=>`<th>${a.label}</th>`).join('')}
          <th>합계</th>
        </tr>
      </thead>
      <tbody>${renderAfterSchoolRows(p3)}</tbody>
    </table>
  </div>`;

  // Pivot 4: 치료기관연계
  const p4 = pivotTherapy();
  html += `<div style="margin-bottom:20px">
    <div class="pivot-title">치료기관연계 지원 명단</div>
    <table class="pivot-tbl">
      <thead>
        <tr>
          <th style="width:40px">번호</th><th>학교명</th><th>학년</th><th>성별</th>
          <th>지원내용</th><th>연계기관</th><th>지원기간</th><th>비고</th>
        </tr>
      </thead>
      <tbody>
        ${p4.list.length===0 ? '<tr><td colspan="8" style="padding:20px; color:#64748b">치료기관연계 대상 학생이 없습니다</td></tr>' : p4.list.map((s,i)=>`<tr>
          <td>${i+1}</td><td>${s.sc}</td><td>${s.scType}${s.gr}</td><td>${s.gen}</td>
          <td>${(s.areas||[]).map(a=>{const d=AREA_BY_ID[a]; return d?(d.altLabel||d.label):a;}).join(',')}</td>
          <td>${s.therapy?.inst||'-'}</td>
          <td>${s.therapy?.start||''} ~ ${s.therapy?.end||''}</td>
          <td>${(s.areas||[]).includes('ETC')?s.etcDetail||'':''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:12px"><b>집계</b></div>
    <table class="pivot-tbl" style="max-width:700px">
      <thead><tr><th rowspan="2">학교급</th><th rowspan="2">학년</th>
        <th colspan="6">지원내용 (학생수)</th></tr>
        <tr>${['난독증','언어','경계선지능','ADHD','심리정서','기타'].map(x=>`<th>${x}</th>`).join('')}</tr>
      </thead>
      <tbody>${renderTherapyPivot(p4.pivot)}</tbody>
    </table>
  </div>`;

  // Pivot 5: 난독증/경계선지능
  const p5 = pivotDyslexBorder();
  html += `<div style="margin-bottom:20px">
    <div class="pivot-title">난독증 및 경계선 지능 지원 현황 (${dateFormatted}.기준)</div>
    <table class="pivot-tbl">
      <thead>
        <tr>
          <th rowspan="2">분류</th><th rowspan="2">지원신청</th><th rowspan="2">진단검사</th>
          <th colspan="3">난독증/경계선지능인 경우</th>
          <th colspan="3">난독증/경계선지능 아닌 경우</th>
          <th rowspan="2">미지원 수<br>및 사유</th>
        </tr>
        <tr>
          <th>치료지원</th><th>학습코칭</th><th>수업협력코칭</th>
          <th>치료지원</th><th>학습코칭</th><th>수업협력코칭</th>
        </tr>
      </thead>
      <tbody>
        <tr><td class="label">난독증</td>
          <td>${p5.dyslex.applied}</td><td>${p5.dyslex.tested}</td>
          <td>${p5.dyslex.pos_therapy}</td><td>${p5.dyslex.pos_coach}</td><td>${p5.dyslex.pos_class}</td>
          <td>${p5.dyslex.neg_therapy}</td><td>${p5.dyslex.neg_coach}</td><td>${p5.dyslex.neg_class}</td>
          <td>${p5.dyslex.unsup} (${p5.dyslex.unsupReasons.join(', ')||'-'})</td>
        </tr>
        <tr><td class="label">경계선지능</td>
          <td>${p5.border.applied}</td><td>${p5.border.tested}</td>
          <td>${p5.border.pos_therapy}</td><td>${p5.border.pos_coach}</td><td>${p5.border.pos_class}</td>
          <td>${p5.border.neg_therapy}</td><td>${p5.border.neg_coach}</td><td>${p5.border.neg_class}</td>
          <td>${p5.border.unsup} (${p5.border.unsupReasons.join(', ')||'-'})</td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:11px; color:var(--muted); margin-top:8px">* 참고: 이름은 학생구분을 위한 것으로 일괄 가명 또는 'OOO'으로 입력 (현재 마스킹 모드: <b>${db.cfg.maskMode}</b>)</p>
  </div>`;

  $('pivot-area').innerHTML = html;
}


function collectActualExecutionMetrics(){
  const coachStuIds = new Set();
  const classMatIds = new Set();
  const classStuIds = new Set();
  if(typeof forEachVerifiedLog === 'function'){
    forEachVerifiedLog((l, m)=>{
      const kind = (l.kind || m.kind);
      if(kind === 'class'){
        classMatIds.add(m.id);
        const ci = m.classInfo || {};
        (db.stu || []).forEach(s=>{
          if(!((s.supportTypes || []).includes('수업협력코칭'))) return;
          const sameSchool = (s.sc || '') === (ci.sc || '');
          const sameType = (s.scType || '') === (ci.scType || '');
          const sameGrade = String(s.gr || '') === String(ci.gr || '');
          const sameClass = (ci.cls == null || ci.cls === '' || s.cls == null || s.cls === '')
            ? true : String(s.cls) === String(ci.cls);
          if(sameSchool && sameType && sameGrade && sameClass) classStuIds.add(s.id);
        });
      } else if(m.stuId){
        coachStuIds.add(m.stuId);
      }
    });
  }
  return { coachStuIds, classMatIds, classStuIds };
}

function inferRegionFromClassInfo(ci){
  if(!ci) return '';
  let region = '';
  (db.stu || []).some(s=>{
    const sameSchool = (s.sc || '') === (ci.sc || '');
    const sameType = !ci.scType || (s.scType || '') === (ci.scType || '');
    const sameGrade = !ci.gr || String(s.gr || '') === String(ci.gr || '');
    if(sameSchool && sameType && sameGrade){
      region = s.region || '';
      return !!region;
    }
    return false;
  });
  return region;
}

function pivotByGrade(){
  const res = {};
  for(const lvl of ['초','중']){
    const maxGr = lvl==='초'?6:3;
    for(let g=1; g<=maxGr; g++){
      res[`${lvl}${g}`] = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
    }
  }

  // 신청 인원/건수
  db.stu.forEach(s=>{
    const key = `${s.scType}${s.gr}`;
    if(!res[key]) return;
    const sts = s.supportTypes||[];
    if(sts.includes('방과후학습코칭')) res[key].apply_coach++;
    if(sts.includes('수업협력코칭')) res[key].apply_class_stu++;
    if(sts.includes('심리진단')) res[key].diag++;
    if(sts.includes('치료기관연계')) res[key].therapy++;
  });
  (db.mat || []).filter(m=>m.kind==='class' && m.st==='active').forEach(m=>{
    const ci = m.classInfo || {};
    const key = `${ci.scType||''}${ci.gr||''}`;
    if(res[key]) res[key].apply_class_cnt++;
  });

  // 실제 실시(검증 완료) 기준 재집계
  const actual = collectActualExecutionMetrics();
  actual.coachStuIds.forEach(stuId=>{
    const s = (IDX.stuById || {})[stuId];
    if(!s) return;
    const key = `${s.scType}${s.gr}`;
    if(res[key]) res[key].coach++;
  });
  actual.classMatIds.forEach(matId=>{
    const m = (db.mat || []).find(x=>x.id===matId);
    if(!m) return;
    const ci = m.classInfo || {};
    const key = `${ci.scType||''}${ci.gr||''}`;
    if(res[key]) res[key].class_cnt++;
  });
  actual.classStuIds.forEach(stuId=>{
    const s = (IDX.stuById || {})[stuId];
    if(!s) return;
    const key = `${s.scType}${s.gr}`;
    if(res[key]) res[key].class_stu++;
  });
  return res;
}

function renderGradeRows(p, lvl, maxGr){
  const rows = [];
  const sub = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  for(let g=1; g<=maxGr; g++){
    const r = p[`${lvl}${g}`];
    rows.push(`<tr>
      ${g===1?`<td class="label" rowspan="${maxGr+1}">${lvl}</td>`:''}
      <td>${g}</td>
      ${renderCells(r)}
    </tr>`);
    Object.keys(sub).forEach(k=>sub[k]+=r[k]);
  }
  rows.push(`<tr class="total"><td class="label">소계</td>${renderCells(sub)}</tr>`);
  return rows.join('');
}

function renderCells(r){
  return ['apply_coach','apply_class_cnt','apply_class_stu','diag','coach','class_cnt','class_stu','therapy']
    .map(k=>`<td>${r[k]||0}</td>`).join('');
}

function renderTotalCells(p){
  const t = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  Object.values(p).forEach(r=>Object.keys(t).forEach(k=>t[k]+=r[k]||0));
  return renderCells(t);
}

function pivotByRegion(){
  const res = {};
  (db.cfg.regions && db.cfg.regions.length ? db.cfg.regions : ['지역1','지역2']).forEach(r=>{
    res[r] = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  });

  // 신청 인원/건수
  db.stu.forEach(s=>{
    const r = s.region;
    if(!res[r]) return;
    const sts = s.supportTypes||[];
    if(sts.includes('방과후학습코칭')) res[r].apply_coach++;
    if(sts.includes('수업협력코칭')) res[r].apply_class_stu++;
    if(sts.includes('심리진단')) res[r].diag++;
    if(sts.includes('치료기관연계')) res[r].therapy++;
  });
  (db.mat || []).filter(m=>m.kind==='class' && m.st==='active').forEach(m=>{
    const region = inferRegionFromClassInfo(m.classInfo || {});
    if(region && res[region]) res[region].apply_class_cnt++;
  });

  // 실제 실시(검증 완료) 기준 재집계
  const actual = collectActualExecutionMetrics();
  actual.coachStuIds.forEach(stuId=>{
    const s = (IDX.stuById || {})[stuId];
    if(s && res[s.region]) res[s.region].coach++;
  });
  actual.classMatIds.forEach(matId=>{
    const m = (db.mat || []).find(x=>x.id===matId);
    if(!m) return;
    const region = inferRegionFromClassInfo(m.classInfo || {});
    if(region && res[region]) res[region].class_cnt++;
  });
  actual.classStuIds.forEach(stuId=>{
    const s = (IDX.stuById || {})[stuId];
    if(s && res[s.region]) res[s.region].class_stu++;
  });
  return res;
}

function renderRegionRow(r, name){
  r = r || {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  return `<tr><td class="label">${name}</td>${renderCells(r)}</tr>`;
}

function renderRegionTotalCells(p){
  const t = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  Object.values(p).forEach(r=>Object.keys(t).forEach(k=>t[k]+=r[k]||0));
  return renderCells(t);
}

function pivotAfterSchool(){
  const areas = AREAS.filter(a=>a.scope.includes('방과후')).map(a=>a.id);
  const res = {};
  ['초1','초2','초3','초4','초5','초6','중1','중2','중3'].forEach(k=>{
    res[k] = {};
    areas.forEach(a=>res[k][a]=0);
  });
  db.stu.forEach(s=>{
    if(!(s.supportTypes||[]).includes('방과후학습코칭')) return;
    const key = `${s.scType}${s.gr}`;
    if(!res[key]) return;
    (s.areas||[]).forEach(a=>{
      if(res[key][a]!==undefined) res[key][a]++;
    });
  });
  return res;
}

function renderAfterSchoolRows(p){
  const areas = AREAS.filter(a=>a.scope.includes('방과후')).map(a=>a.id);
  const rows = [];
  const gradeSub = {};
  for(const lvl of ['초','중']){
    const maxGr = lvl==='초'?6:3;
    const sub = {}; areas.forEach(a=>sub[a]=0);
    for(let g=1; g<=maxGr; g++){
      const key = `${lvl}${g}`; const r = p[key]||{};
      const total = areas.reduce((s,a)=>s+(r[a]||0),0);
      rows.push(`<tr>${g===1?`<td class="label" rowspan="${maxGr+1}">${lvl}등</td>`:''}<td>${g}학년</td>${areas.map(a=>`<td>${r[a]||0}</td>`).join('')}<td>${total}</td></tr>`);
      areas.forEach(a=>sub[a]+=(r[a]||0));
    }
    const subTotal = areas.reduce((s,a)=>s+sub[a],0);
    rows.push(`<tr class="total"><td class="label">소계</td>${areas.map(a=>`<td>${sub[a]}</td>`).join('')}<td>${subTotal}</td></tr>`);
    gradeSub[lvl] = sub;
  }
  const grandTotal = {}; areas.forEach(a=>grandTotal[a]=(gradeSub['초'][a]||0)+(gradeSub['중'][a]||0));
  const grandSum = areas.reduce((s,a)=>s+grandTotal[a],0);
  rows.push(`<tr class="total"><td class="label" colspan="2">합계</td>${areas.map(a=>`<td>${grandTotal[a]}</td>`).join('')}<td>${grandSum}</td></tr>`);
  return rows.join('');
}

function pivotTherapy(){
  const list = db.stu.filter(s=>(s.supportTypes||[]).includes('치료기관연계'));
  const areas6 = ['DYSLEX','LANG','BORDER','ADHD','EMOTION','ETC'];
  const pivot = {};
  ['초1','초2','초3','초4','초5','초6','중1','중2','중3'].forEach(k=>{
    pivot[k]={}; areas6.forEach(a=>pivot[k][a]=0);
  });
  list.forEach(s=>{
    const key=`${s.scType}${s.gr}`;
    if(!pivot[key]) return;
    (s.areas||[]).forEach(a=>{
      if(pivot[key][a]!==undefined) pivot[key][a]++;
    });
  });
  return {list, pivot};
}

function renderTherapyPivot(p){
  const areas6 = ['DYSLEX','LANG','BORDER','ADHD','EMOTION','ETC'];
  const rows = [];
  const gradeSub={};
  for(const lvl of ['초','중']){
    const maxGr = lvl==='초'?6:3;
    const sub={}; areas6.forEach(a=>sub[a]=0);
    for(let g=1; g<=maxGr; g++){
      const r = p[`${lvl}${g}`]||{};
      rows.push(`<tr>${g===1?`<td class="label" rowspan="${maxGr+1}">${lvl}등</td>`:''}<td>${g}학년</td>${areas6.map(a=>`<td>${r[a]||0}</td>`).join('')}</tr>`);
      areas6.forEach(a=>sub[a]+=(r[a]||0));
    }
    rows.push(`<tr class="total"><td class="label">소계</td>${areas6.map(a=>`<td>${sub[a]}</td>`).join('')}</tr>`);
    gradeSub[lvl]=sub;
  }
  const grand={}; areas6.forEach(a=>grand[a]=(gradeSub['초'][a]||0)+(gradeSub['중'][a]||0));
  rows.push(`<tr class="total"><td class="label" colspan="2">합계</td>${areas6.map(a=>`<td>${grand[a]}</td>`).join('')}</tr>`);
  return rows.join('');
}

function pivotDyslexBorder(){
  const mk = ()=>({applied:0, tested:0, pos_therapy:0, pos_coach:0, pos_class:0, neg_therapy:0, neg_coach:0, neg_class:0, unsup:0, unsupReasons:[]});
  const dyslex = mk(); const border = mk();
  db.stu.forEach(s=>{
    const areas = s.areas||[]; const sts = s.supportTypes||[];
    const dt = s.diagTest||{};
    const isDyslex = areas.includes('DYSLEX');
    const isBorder = areas.includes('BORDER');
    if(isDyslex){
      dyslex.applied++;
      if(dt.done) dyslex.tested++;
      const isPos = dt.dyslexia;
      const target = isPos ? 'pos' : 'neg';
      if(sts.includes('치료기관연계')) dyslex[`${target}_therapy`]++;
      if(sts.includes('방과후학습코칭')) dyslex[`${target}_coach`]++;
      if(sts.includes('수업협력코칭')) dyslex[`${target}_class`]++;
      if(s.unsupported?.is){ dyslex.unsup++; if(s.unsupported.reason) dyslex.unsupReasons.push(s.unsupported.reason); }
    }
    if(isBorder){
      border.applied++;
      if(dt.done) border.tested++;
      const isPos = dt.borderline;
      const target = isPos ? 'pos' : 'neg';
      if(sts.includes('치료기관연계')) border[`${target}_therapy`]++;
      if(sts.includes('방과후학습코칭')) border[`${target}_coach`]++;
      if(sts.includes('수업협력코칭')) border[`${target}_class`]++;
      if(s.unsupported?.is){ border.unsup++; if(s.unsupported.reason) border.unsupReasons.push(s.unsupported.reason); }
    }
  });
  return {dyslex, border};
}

/* 엑셀 다운로드 */
function exportStatExcel(){
  if(typeof XLSX==='undefined'){ toast('엑셀 라이브러리 로딩 중...','warning'); return; }
  const wb = XLSX.utils.book_new();
  const dateStr = ($('stat-date').value||new Date().toISOString().slice(0,10)).replace(/-/g,'.');

  // Sheet 1: 지역거점별
  const p1 = pivotByGrade();
  const s1data = [
    [`${db.cfg.org||''} 지역거점 지원 실적 (${dateStr}.기준)`],
    [],
    ['학교급','','신청 학생수','','','심리진단','방과후 학습코칭','수업협력코칭(학급수)','수업협력코칭(학생수)','치료기관연계'],
    ['','','방과후(학생수)','수업협력(학급수)','수업협력(학생수)','','','','',''],
  ];
  const addGrade = (lvl, maxGr)=>{
    const sub = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
    for(let g=1; g<=maxGr; g++){
      const r = p1[`${lvl}${g}`]||{};
      s1data.push([g===1?lvl:'', g, r.apply_coach||0, r.apply_class_cnt||0, r.apply_class_stu||0, r.diag||0, r.coach||0, r.class_cnt||0, r.class_stu||0, r.therapy||0]);
      Object.keys(sub).forEach(k=>sub[k]+=r[k]||0);
    }
    s1data.push(['소계','', sub.apply_coach, sub.apply_class_cnt, sub.apply_class_stu, sub.diag, sub.coach, sub.class_cnt, sub.class_stu, sub.therapy]);
  };
  addGrade('초', 6); addGrade('중', 3);
  const t1 = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  Object.values(p1).forEach(r=>Object.keys(t1).forEach(k=>t1[k]+=r[k]||0));
  s1data.push(['합계','', t1.apply_coach, t1.apply_class_cnt, t1.apply_class_stu, t1.diag, t1.coach, t1.class_cnt, t1.class_stu, t1.therapy]);
  s1data.push([]);
  // 지역별
  const p2 = pivotByRegion();
  s1data.push([`지역별 지원현황 (${dateStr}.기준)`]);
  s1data.push(['지역','신청 학생수','','','심리진단','방과후 학습코칭','수업협력코칭(학급수)','수업협력코칭(학생수)','치료기관연계']);
  s1data.push(['','방과후(학생수)','수업협력(학급수)','수업협력(학생수)','','','','','']);
  (db.cfg.regions && db.cfg.regions.length ? db.cfg.regions : ['지역1','지역2']).forEach(rn=>{
    const r = p2[rn]||{};
    s1data.push([rn, r.apply_coach||0, r.apply_class_cnt||0, r.apply_class_stu||0, r.diag||0, r.coach||0, r.class_cnt||0, r.class_stu||0, r.therapy||0]);
  });
  const t2 = {apply_coach:0, apply_class_cnt:0, apply_class_stu:0, diag:0, coach:0, class_cnt:0, class_stu:0, therapy:0};
  Object.values(p2).forEach(r=>Object.keys(t2).forEach(k=>t2[k]+=r[k]||0));
  s1data.push(['합계', t2.apply_coach, t2.apply_class_cnt, t2.apply_class_stu, t2.diag, t2.coach, t2.class_cnt, t2.class_stu, t2.therapy]);

  const ws1 = XLSX.utils.aoa_to_sheet(s1data);
  XLSX.utils.book_append_sheet(wb, ws1, '지역거점별실적');

  // Sheet 2: 방과후학습코칭
  const p3 = pivotAfterSchool();
  const areaIds = AREAS.filter(a=>a.scope.includes('방과후')).map(a=>a.id);
  const areaLbl = AREAS.filter(a=>a.scope.includes('방과후')).map(a=>a.label);
  const s2data = [
    [`방과후학습코칭 지원현황 (${dateStr}.기준)`], [],
    ['학교급','학년', ...areaLbl, '합계']
  ];
  const addP3 = (lvl, maxGr)=>{
    const sub = {}; areaIds.forEach(a=>sub[a]=0);
    for(let g=1; g<=maxGr; g++){
      const r = p3[`${lvl}${g}`]||{};
      const row = [g===1?lvl+'등':'', `${g}학년`, ...areaIds.map(a=>r[a]||0)];
      row.push(areaIds.reduce((s,a)=>s+(r[a]||0),0));
      s2data.push(row);
      areaIds.forEach(a=>sub[a]+=(r[a]||0));
    }
    const subTotal = areaIds.reduce((s,a)=>s+sub[a],0);
    s2data.push(['', '소계', ...areaIds.map(a=>sub[a]), subTotal]);
  };
  addP3('초', 6); addP3('중', 3);
  const ws2 = XLSX.utils.aoa_to_sheet(s2data);
  XLSX.utils.book_append_sheet(wb, ws2, '방과후학습코칭');

  // Sheet 3: 치료기관연계
  const p4 = pivotTherapy();
  const s3data = [
    ['치료기관연계 지원 명단'], [],
    ['번호','학교명','학년','성별','지원내용','연계기관','지원기간','비고']
  ];
  p4.list.forEach((s,i)=>{
    s3data.push([i+1, s.sc, `${s.scType}${s.gr}`, s.gen,
      (s.areas||[]).map(a=>AREA_BY_ID[a]?.altLabel||AREA_BY_ID[a]?.label||a).join(','),
      s.therapy?.inst||'', `${s.therapy?.start||''} ~ ${s.therapy?.end||''}`,
      (s.areas||[]).includes('ETC')?s.etcDetail||'':''
    ]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(s3data);
  XLSX.utils.book_append_sheet(wb, ws3, '치료기관연계');

  // Sheet 4: 난독/경계선
  const p5 = pivotDyslexBorder();
  const s4data = [
    [`난독증 및 경계선지능 지원 현황 (${dateStr}.기준)`], [],
    ['분류','지원신청','진단검사','난독증/경계선인 경우','','','난독증/경계선 아닌 경우','','','미지원 수/사유'],
    ['','','','치료지원','학습코칭','수업협력코칭','치료지원','학습코칭','수업협력코칭',''],
    ['난독증', p5.dyslex.applied, p5.dyslex.tested, p5.dyslex.pos_therapy, p5.dyslex.pos_coach, p5.dyslex.pos_class, p5.dyslex.neg_therapy, p5.dyslex.neg_coach, p5.dyslex.neg_class, `${p5.dyslex.unsup} (${p5.dyslex.unsupReasons.join(',')||'-'})`],
    ['경계선지능', p5.border.applied, p5.border.tested, p5.border.pos_therapy, p5.border.pos_coach, p5.border.pos_class, p5.border.neg_therapy, p5.border.neg_coach, p5.border.neg_class, `${p5.border.unsup} (${p5.border.unsupReasons.join(',')||'-'})`]
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(s4data);
  XLSX.utils.book_append_sheet(wb, ws4, '난독경계선');

  XLSX.writeFile(wb, `${db.cfg.base||'거점센터'}_통계_${dateStr}.xlsx`);
  toast('엑셀 다운로드 완료','success');
}

