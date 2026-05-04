/* =================================================================
 * V9.9 확장 모듈: 서브탭/차트/세션/예산/명세서/수업협력/연수출장비
 * ================================================================= */

/* ---------- 서브탭 공통 ---------- */
function goSubT4(key, btn){
  document.querySelectorAll('#t4 .subtab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#t4 .subtab-content').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sub-t4-'+key).classList.add('active');
  if(key==='coach') renMatch();
  if(key==='class') renClassSupport();
}
function goSubT5(key, btn){
  document.querySelectorAll('#t5 .subtab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#t5 .subtab-content').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sub-t5-'+key).classList.add('active');
  if(key==='record') loadStfRecord();
  if(key==='verify') loadVerify();
  if(key==='settle') loadSettle();
}

/* ---------- 포맷/헬퍼 ---------- */
function formatMoney(n){ return (Number(n)||0).toLocaleString('ko-KR')+'원'; }
function todayStr(){ const d=new Date(); return d.toISOString().slice(0,10); }
function thisMonth(){ return todayStr().slice(0,7); }

function getDatesForDayInMonth(ym, dayLabel){
  const DAY_IDX={일:0, 월:1, 화:2, 수:3, 목:4, 금:5, 토:6};
  const target=DAY_IDX[dayLabel];
  if(target===undefined) return [];
  const [y,m]=String(ym||'').split('-').map(Number);
  if(!y || !m) return [];
  const daysInMonth=new Date(y,m,0).getDate();
  const result=[];
  for(let d=1; d<=daysInMonth; d++){
    if(new Date(y,m-1,d).getDay()===target){
      result.push(`${ym}-${String(d).padStart(2,'0')}`);
    }
  }
  return result;
}

function classSessionMinutes(scType){
  if(scType==='중' || scType==='중등') return 45;
  if(scType==='고' || scType==='고등') return 50;
  return 40; // 초등 기본
}

/* ---------- 단가/예산 로직 ---------- */
function getRates(){
  return {
    coach:    Number(db.cfg.rateCoach||40000),
    cls:      Number(db.cfg.rateClass||30000),
    travelLong:  Number(db.cfg.rateTravelLong||20000),
    travelShort: Number(db.cfg.rateTravelShort||10000),
    taxPct:   Number(db.cfg.taxPct||3.3)
  };
}
function getBudget(){
  return db.cfg.budget || {total:0, coach:0, cls:0, travel:0};
}

function saveRatesAndBudget(){
  db.cfg.rateCoach = parseInt($('cfg-rate-coach').value)||40000;
  db.cfg.rateClass = parseInt($('cfg-rate-class').value)||30000;
  db.cfg.rateTravelLong = parseInt($('cfg-rate-travel-long').value)||20000;
  db.cfg.rateTravelShort = parseInt($('cfg-rate-travel-short').value)||10000;
  db.cfg.taxPct = parseFloat($('cfg-tax').value)||3.3;
  db.cfg.budget = {
    total: parseInt($('cfg-bud-total').value)||0,
    coach: parseInt($('cfg-bud-coach').value)||0,
    cls:   parseInt($('cfg-bud-class').value)||0,
    travel:parseInt($('cfg-bud-travel').value)||0
  };
  save('meta', {id:'cfg', ...db.cfg});
  toast('단가·예산 저장 완료','success');
  refreshDashboard();
}

function loadRatesAndBudget(){
  const r = getRates(); const b = getBudget();
  if($('cfg-rate-coach')) $('cfg-rate-coach').value = r.coach;
  if($('cfg-rate-class')) $('cfg-rate-class').value = r.cls;
  if($('cfg-rate-travel-long')) $('cfg-rate-travel-long').value = r.travelLong;
  if($('cfg-rate-travel-short')) $('cfg-rate-travel-short').value = r.travelShort;
  if($('cfg-tax')) $('cfg-tax').value = r.taxPct;
  if($('cfg-bud-total')) $('cfg-bud-total').value = b.total;
  if($('cfg-bud-coach')) $('cfg-bud-coach').value = b.coach;
  if($('cfg-bud-class')) $('cfg-bud-class').value = b.cls;
  if($('cfg-bud-travel')) $('cfg-bud-travel').value = b.travel;
  if($('cfg-confirmer')) $('cfg-confirmer').value = db.cfg.confirmer || '담당 장학사';
}

/* ---------- 세션 로그 유틸 (mat.logs 확장) ---------- */
/* log 엔트리 스키마:
   { id, date, time, topic, place, status: 'conducted'|'canceled'|'verified'|'rejected',
     minutes, cancelReason, verifiedBy, verifiedAt, amount, kind }
*/
function ensureLogFields(l, m){
  if(!l.id) l.id = uid();
  if(!l.status) l.status = 'conducted';  // 구데이터 호환
  if(!l.kind) l.kind = m.kind || 'coach';
  if(!l.minutes){
    if(l.kind==='class'){
      const stu = (IDX.stuById||{})[m.stuId];
      l.minutes = classSessionMinutes(stu ? stu.scType : '초');
    } else l.minutes = 50;
  }
  return l;
}
function calcLogAmount(l){
  const r = getRates();
  if(l.kind === 'class') return r.cls;
  return r.coach;
}

/* 검증 승인된 회기만 집계 */
function forEachVerifiedLog(cb, filter){
  filter = filter || {};
  db.mat.forEach(m=>{
    (m.logs||[]).forEach(l=>{
      ensureLogFields(l, m);
      if(l.status !== 'verified' && l.status !== 'paid') return;
      if(filter.ym && !(l.date||'').startsWith(filter.ym)) return;
      if(filter.stfId && m.stfId !== filter.stfId) return;
      cb(l, m);
    });
  });
}

function countPendingVerify(){
  let c = 0;
  db.mat.forEach(m=>{
    (m.logs||[]).forEach(l=>{
      ensureLogFields(l, m);
      if(l.status === 'conducted') c++;
    });
  });
  return c;
}

/* 집행액 계산 (검증 승인 기준, 총액) */
function calcExecuted(ym){
  let coach = 0, cls = 0, travel = 0;
  const filter = ym ? {ym} : {};
  forEachVerifiedLog((l,m)=>{
    const amt = l.amount || calcLogAmount(l);
    if(l.kind === 'class') cls += amt;
    else coach += amt;
  }, filter);
  // 연수 출장비 (연수 참석자 검증 시 저장되는 값 기반)
  (db.trn||[]).forEach(t=>{
    if(!t.verified) return;
    if(ym && !(t.dt||'').startsWith(ym)) return;
    const r = getRates();
    const per = (t.hr||0) >= 4 ? r.travelLong : r.travelShort;
    travel += per * (t.attendees||[]).length;
  });
  return {coach, cls, travel, total: coach+cls+travel};
}

/* ---------- 대시보드 예산 카드 + 차트 ---------- */
function renderBudgetCards(){
  const b = getBudget();
  const ex = calcExecuted();
  const mk = (lbl, used, budget, color)=>{
    const pct = budget>0 ? Math.min(100, (used/budget)*100) : 0;
    return `<div class="stat-card">
      <div class="lbl">${lbl}</div>
      <div class="num" style="color:${color}">${formatMoney(used)}</div>
      <div class="lbl">/ ${formatMoney(budget)} (${pct.toFixed(0)}%)</div>
    </div>`;
  };
  if($('budget-cards')){
    $('budget-cards').innerHTML =
      mk('💰 총 예산', ex.total, b.total, '#3b82f6') +
      mk('📚 학습코칭', ex.coach, b.coach, '#10b981') +
      mk('🏫 수업협력', ex.cls, b.cls, '#f59e0b') +
      mk('🚗 연수 출장비', ex.travel, b.travel, '#8b5cf6');
    if($('budget-pct')){
      const pct = b.total>0 ? ((ex.total/b.total)*100).toFixed(1) : '0';
      $('budget-pct').textContent = `연간 집행률 ${pct}% · 잔여 ${formatMoney(Math.max(0, b.total-ex.total))}`;
    }
  }
}

var _chartRefs = {};
function makeChart(id, cfg){
  const el = document.getElementById(id);
  if(!el || !window.Chart) return;
  if(_chartRefs[id]){ _chartRefs[id].destroy(); }
  _chartRefs[id] = new Chart(el, cfg);
}
function renderDashCharts(){
  if(!window.Chart) return;
  const b = getBudget(); const ex = calcExecuted();

  // 1) 예산 도넛
  makeChart('chart-budget', {
    type:'doughnut',
    data:{ labels:['학습코칭','수업협력','출장비','잔여'],
      datasets:[{
        data:[ex.coach, ex.cls, ex.travel, Math.max(0, b.total - ex.total)],
        backgroundColor:['#10b981','#f59e0b','#8b5cf6','#e5e7eb'],
        borderWidth:2
      }]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom', labels:{font:{size:11}}}}}
  });

  // 2) 영역별 예산 가로 막대
  makeChart('chart-budget-bar', {
    type:'bar',
    data:{ labels:['학습코칭','수업협력','출장비'],
      datasets:[
        {label:'집행', data:[ex.coach, ex.cls, ex.travel], backgroundColor:'#3b82f6'},
        {label:'예산', data:[b.coach, b.cls, b.travel], backgroundColor:'#e5e7eb'}
      ]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom'}}, scales:{x:{ticks:{callback:v=>(v/10000).toFixed(0)+'만'}}}}
  });

  // 3) 월별 실적 추이 (최근 12개월)
  const months = [];
  const now = new Date();
  for(let i=11;i>=0;i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push(String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  const coachMonthly = months.map(ym=>{
    let c = 0;
    forEachVerifiedLog((l)=>{ if(l.kind!=='class') c++; }, {ym});
    return c;
  });
  const clsMonthly = months.map(ym=>{
    let c = 0;
    forEachVerifiedLog((l)=>{ if(l.kind==='class') c++; }, {ym});
    return c;
  });
  makeChart('chart-monthly', {
    type:'line',
    data:{ labels:months.map(m=>m.slice(5)+'월'),
      datasets:[
        {label:'학습코칭', data:coachMonthly, borderColor:'#10b981', tension:.3, fill:false},
        {label:'수업협력', data:clsMonthly, borderColor:'#f59e0b', tension:.3, fill:false}
      ]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}
  });

  // 4) 영역별 매칭 분포
  const areaCount = {};
  db.mat.filter(m=>m.st==='active').forEach(m=>{
    const stf = (IDX.stfById||{})[m.stfId];
    if(!stf) return;
    (stf.areas||[]).forEach(a=>{ areaCount[a] = (areaCount[a]||0)+1; });
  });
  const aLabels = Object.keys(areaCount).map(a=>AREA_BY_ID[a]?.label || a);
  makeChart('chart-area', {
    type:'bar',
    data:{labels:aLabels, datasets:[{label:'매칭수', data:Object.values(areaCount), backgroundColor:'#6366f1'}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
  });

  // 5) 지원단 TOP 10
  const stfMat = {};
  db.mat.filter(m=>m.st==='active').forEach(m=>{
    stfMat[m.stfId] = (stfMat[m.stfId]||0)+1;
  });
  const top = Object.entries(stfMat).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const topLabels = top.map(([id])=>{
    const s = (IDX.stfById||{})[id];
    return s ? s.nm : '?';
  });
  makeChart('chart-top', {
    type:'bar',
    data:{labels:topLabels, datasets:[{label:'매칭수', data:top.map(x=>x[1]), backgroundColor:'#ec4899'}]},
    options:{indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
  });

  // 6) 검증 상태 (이번달)
  const ym = thisMonth();
  let pending=0, verified=0, rejected=0;
  db.mat.forEach(m=>{
    (m.logs||[]).forEach(l=>{
      ensureLogFields(l,m);
      if(!(l.date||'').startsWith(ym)) return;
      if(l.status==='verified' || l.status==='paid') verified++;
      else if(l.status==='rejected') rejected++;
      else if(l.status==='conducted') pending++;
    });
  });
  makeChart('chart-verify', {
    type:'doughnut',
    data:{labels:['미검증','승인','반려'],
      datasets:[{data:[pending,verified,rejected], backgroundColor:['#fbbf24','#10b981','#ef4444']}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}
  });
}

/* ---------- 오늘의 실시기록 ---------- */
function loadTodayRec(){
  const dt = $('rec-date').value || todayStr();
  if(!$('rec-date').value) $('rec-date').value = dt;
  buildIndex();
  const day = ['일','월','화','수','목','금','토'][new Date(dt).getDay()];
  const list = [];
  db.mat.filter(m=>m.st==='active').forEach(m=>{
    (m.slots||[]).forEach(slot=>{
      if(slot.d !== day) return;
      // 이미 기록된 로그 확인
      const existing = (m.logs||[]).find(l=>l.date===dt && l.time && l.time.includes(slot.s));
      list.push({mat:m, slot, existing});
    });
  });

  if(list.length===0){
    $('rec-area').innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted)">
      📭 ${dt} (${day}요일)에 예정된 매칭이 없습니다</div>`;
    return;
  }

  const rows = list.map((item,i)=>{
    const {mat, slot, existing} = item;
    const stf = IDX.stfById[mat.stfId];
    const stu = IDX.stuById[mat.stuId];
    if(!stf || !stu) return '';
    const kindLbl = mat.kind==='class' ? '🏫 수업협력' : '📚 학습코칭';
    const minutes = mat.kind==='class' ? classSessionMinutes(stu.scType) : 50;
    let statusHtml = '';
    if(existing){
      const st = existing.status;
      const stColor = st==='verified'?'bg-yes':(st==='rejected'?'bg-danger':(st==='canceled'?'bg-no':'bg-info'));
      const stLbl = {conducted:'실시',verified:'✅승인',rejected:'❌반려',canceled:'취소',paid:'지급'}[st]||st;
      statusHtml = `<span class="badge ${stColor}">${stLbl}</span>
        <button class="btn btn-xs btn-outline" onclick="delRec('${mat.id}','${existing.id}')">취소</button>`;
    } else {
      statusHtml = `
        <input class="rec-topic" data-i="${i}" placeholder="지도내용(간단히)" style="padding:6px; border:1px solid var(--border); border-radius:6px; font-size:12px; width:180px">
        <button class="btn btn-xs btn-success" onclick="quickRec(${i},'conducted')">✅ 실시</button>
        <button class="btn btn-xs btn-danger" onclick="quickRec(${i},'canceled')">❌ 취소</button>
      `;
    }
    return `<tr data-idx="${i}">
      <td class="center">${kindLbl}</td>
      <td><b>${stf.nm}</b></td>
      <td><b>${stu.nm}</b><br><span style="font-size:11px;color:var(--muted)">${stu.sc||''}</span></td>
      <td class="center">${slot.s}~${slot.e}<br><span style="font-size:11px;color:var(--muted)">${minutes}분</span></td>
      <td>${statusHtml}</td>
    </tr>`;
  }).join('');
  $('rec-area').innerHTML = `<table class="tbl"><thead><tr>
    <th>유형</th><th>지원단</th><th>학생</th><th>시간</th><th>실시 기록</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
  window.__recList = list;
  window.__recDate = dt;
}

async function quickRec(i, status){
  const it = (window.__recList||[])[i];
  if(!it) return;
  const topicEl = document.querySelector(`.rec-topic[data-i="${i}"]`);
  const topic = topicEl ? topicEl.value.trim() : '';
  const stu = IDX.stuById[it.mat.stuId];
  const minutes = it.mat.kind==='class' ? classSessionMinutes(stu ? stu.scType : '초') : 50;

  const log = {
    id: uid(),
    date: window.__recDate,
    time: `${it.slot.s}~${it.slot.e}`,
    topic: topic || (status==='canceled' ? '(취소)' : '학습지도'),
    status: status,
    kind: it.mat.kind || 'coach',
    minutes: minutes
  };
  if(status==='canceled'){ log.cancelReason='사유미기재'; }
  else { log.amount = calcLogAmount(log); }

  it.mat.logs = it.mat.logs || [];
  it.mat.logs.push(log);
  await save('mat', it.mat);
  toast('기록 저장됨','success');
  loadTodayRec();
}

async function delRec(matId, logId){
  const m = db.mat.find(x=>x.id===matId);
  if(!m) return;
  m.logs = (m.logs||[]).filter(l=>l.id !== logId);
  await save('mat', m);
  loadTodayRec();
  toast('기록 삭제','info');
}

async function quickRecAll(){
  const list = window.__recList || [];
  if(list.length===0){ toast('기록할 항목이 없습니다','info'); return; }
  if(!confirm2(`${list.length}건을 모두 "실시"로 기록합니다. 진행할까요?`)) return;
  for(let i=0;i<list.length;i++){
    const it = list[i];
    if(it.existing) continue;
    const stu = IDX.stuById[it.mat.stuId];
    const minutes = it.mat.kind==='class' ? classSessionMinutes(stu ? stu.scType : '초') : 50;
    const log = {
      id: uid(), date: window.__recDate,
      time: `${it.slot.s}~${it.slot.e}`, topic: '학습지도',
      status: 'conducted', kind: it.mat.kind||'coach', minutes
    };
    log.amount = calcLogAmount(log);
    it.mat.logs = it.mat.logs||[];
    it.mat.logs.push(log);
    await save('mat', it.mat);
  }
  toast('일괄 실시 기록 완료','success');
  loadTodayRec();
}

/* ---------- 월간 검증 ---------- */
function loadVerify(){
  const ym = $('ver-month').value || thisMonth();
  if(!$('ver-month').value) $('ver-month').value = ym;
  const filter = $('ver-filter').value || 'pending';
  buildIndex();
  const rows = [];
  db.mat.forEach(m=>{
    (m.logs||[]).forEach(l=>{
      ensureLogFields(l, m);
      if(!(l.date||'').startsWith(ym)) return;
      if(filter !== 'all'){
        const s = l.status;
        if(filter==='pending' && s!=='conducted') return;
        if(filter==='verified' && s!=='verified' && s!=='paid') return;
        if(filter==='rejected' && s!=='rejected') return;
      }
      rows.push({m, l});
    });
  });
  if(rows.length===0){
    $('ver-area').innerHTML = `<div style="padding:30px; text-align:center; color:var(--muted)">해당 조건의 실적이 없습니다</div>`;
    return;
  }
  const html = `<table class="tbl"><thead><tr>
    <th style="width:30px"><input type="checkbox" id="ver-all" onchange="toggleVerAll(this)"></th>
    <th>날짜</th><th>지원단</th><th>학생</th><th>유형</th><th>시간</th><th>지도내용</th><th>금액</th><th>상태</th><th>작업</th>
  </tr></thead><tbody>${rows.map((r,i)=>{
    const stf = IDX.stfById[r.m.stfId]; const stu = IDX.stuById[r.m.stuId];
    const amt = r.l.amount || calcLogAmount(r.l);
    const s = r.l.status;
    const stColor = s==='verified'||s==='paid'?'bg-yes':(s==='rejected'?'bg-danger':(s==='canceled'?'bg-no':'bg-info'));
    const stLbl = {conducted:'미검증',verified:'✅승인',rejected:'❌반려',canceled:'취소',paid:'지급완료'}[s]||s;
    const kindLbl = r.l.kind==='class'?'수업협력':'학습코칭';
    return `<tr>
      <td class="center"><input type="checkbox" class="ver-chk" data-mat="${r.m.id}" data-log="${r.l.id}"></td>
      <td>${r.l.date}</td>
      <td>${stf?stf.nm:'-'}</td>
      <td>${stu?stu.nm:'-'}</td>
      <td>${kindLbl}</td>
      <td>${r.l.time||''}</td>
      <td style="font-size:12px">${r.l.topic||''}</td>
      <td class="ar">${s==='canceled'?'-':formatMoney(amt)}</td>
      <td><span class="badge ${stColor}">${stLbl}</span></td>
      <td>
        ${s==='conducted'?`<button class="btn btn-xs btn-success" onclick="verifyOne('${r.m.id}','${r.l.id}','verified')">승인</button>
          <button class="btn btn-xs btn-danger" onclick="verifyOne('${r.m.id}','${r.l.id}','rejected')">반려</button>`:
          `<button class="btn btn-xs btn-outline" onclick="verifyOne('${r.m.id}','${r.l.id}','conducted')">되돌림</button>`}
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;
  $('ver-area').innerHTML = html;
}

function toggleVerAll(cb){
  document.querySelectorAll('.ver-chk').forEach(x=>x.checked = cb.checked);
}

async function verifyOne(matId, logId, newStatus){
  const m = db.mat.find(x=>x.id===matId); if(!m) return;
  const l = (m.logs||[]).find(x=>x.id===logId); if(!l) return;
  l.status = newStatus;
  if(newStatus==='verified'){
    l.verifiedBy = db.cfg.confirmer || '학습상담사';
    l.verifiedAt = Date.now();
    if(!l.amount) l.amount = calcLogAmount(l);
  }
  await save('mat', m);
  loadVerify();
  refreshDashboard();
}

async function bulkVerify(newStatus){
  const chks = document.querySelectorAll('.ver-chk:checked');
  if(chks.length===0){ toast('항목을 선택하세요','warning'); return; }
  if(!confirm2(`${chks.length}건을 "${newStatus==='verified'?'승인':'반려'}" 처리할까요?`)) return;
  const done = new Set();
  for(const c of chks){
    const matId = c.dataset.mat; const logId = c.dataset.log;
    const m = db.mat.find(x=>x.id===matId);
    if(!m) continue;
    const l = (m.logs||[]).find(x=>x.id===logId);
    if(!l) continue;
    l.status = newStatus;
    if(newStatus==='verified'){
      l.verifiedBy = db.cfg.confirmer || '학습상담사';
      l.verifiedAt = Date.now();
      if(!l.amount) l.amount = calcLogAmount(l);
    }
    done.add(matId);
  }
  for(const id of done){ await save('mat', db.mat.find(x=>x.id===id)); }
  toast(`일괄 처리 완료 (${chks.length}건)`,'success');
  loadVerify();
  refreshDashboard();
}

/* ---------- 월별 정산 ---------- */
function buildSettleData(ym){
  buildIndex();
  const byStf = {}; // stfId -> {coach:[], cls:[], travel:[]}
  forEachVerifiedLog((l,m)=>{
    const key = m.stfId;
    if(!byStf[key]) byStf[key] = {coach:[], cls:[], travel:[]};
    const bucket = l.kind==='class' ? 'cls' : 'coach';
    const stuObj = IDX.stuById[m.stuId];
    const isClass = l.kind === 'class';
    byStf[key][bucket].push({
      date:l.date, time:l.time||'', topic:l.topic||'',
      minutes:l.minutes, amount:l.amount||calcLogAmount(l),
      stu: isClass
        ? ((m.classInfo||{}).gr ? `${(m.classInfo||{}).gr}-${(m.classInfo||{}).cls}반` : ((m.classInfo||{}).sc||''))
        : ((stuObj||{}).nm || ''),
      sc: isClass
        ? ((m.classInfo||{}).sc || '')
        : ((stuObj||{}).sc || '')
    });
  }, {ym});
  // 연수 출장비
  (db.trn||[]).forEach(t=>{
    if(!t.verified) return;
    if(!(t.dt||'').startsWith(ym)) return;
    const r = getRates();
    const per = (t.hr||0) >= 4 ? r.travelLong : r.travelShort;
    (t.attendees||[]).forEach(stfId=>{
      if(!byStf[stfId]) byStf[stfId] = {coach:[], cls:[], travel:[]};
      byStf[stfId].travel.push({
        date:t.dt.slice(0,10), title:t.nm, hours:t.hr, amount:per
      });
    });
  });
  return byStf;
}

function loadSettle(){
  const ym = $('stl-month').value || thisMonth();
  if(!$('stl-month').value) $('stl-month').value = ym;
  const data = buildSettleData(ym);
  const stfIds = Object.keys(data);
  if(stfIds.length===0){
    $('stl-area').innerHTML = `<div style="padding:30px; text-align:center; color:var(--muted)">해당 월에 승인된 실적이 없습니다</div>`;
    return;
  }
  const r = getRates();
  let totalAll = 0;
  const rows = stfIds.map(id=>{
    const d = data[id]; const stf = (IDX.stfById||{})[id];
    const coachCnt = d.coach.length, coachSum = d.coach.reduce((a,b)=>a+b.amount,0);
    const clsCnt = d.cls.length, clsSum = d.cls.reduce((a,b)=>a+b.amount,0);
    const trvCnt = d.travel.length, trvSum = d.travel.reduce((a,b)=>a+b.amount,0);
    const tot = coachSum+clsSum+trvSum;
    totalAll += tot;
    const tax = Math.round(tot * r.taxPct/100);
    return `<tr>
      <td><b>${stf?stf.nm:'?'}</b></td>
      <td class="center">${coachCnt}회</td>
      <td class="ar">${formatMoney(coachSum)}</td>
      <td class="center">${clsCnt}회</td>
      <td class="ar">${formatMoney(clsSum)}</td>
      <td class="center">${trvCnt}회</td>
      <td class="ar">${formatMoney(trvSum)}</td>
      <td class="ar"><b>${formatMoney(tot)}</b></td>
      <td class="ar" style="color:#dc2626">-${formatMoney(tax)}</td>
      <td class="ar" style="color:#059669"><b>${formatMoney(tot-tax)}</b></td>
      <td><button class="btn btn-xs btn-primary" onclick="printSinglePaySlip('${id}','${ym}')">📄 명세서</button></td>
    </tr>`;
  }).join('');
  $('stl-area').innerHTML = `
    <div style="padding:12px; background:#f0f9ff; border-radius:8px; margin-bottom:12px; font-size:13px">
      <b>${ym}</b> 총 지급예정액: <b style="color:var(--primary); font-size:16px">${formatMoney(totalAll)}</b>
      (원천징수 ${r.taxPct}% 공제 전 세전 총액)
    </div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr>
      <th>지원단</th>
      <th colspan="2">학습코칭</th>
      <th colspan="2">수업협력</th>
      <th colspan="2">출장비</th>
      <th>지급액</th><th>공제액</th><th>실수령</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- 지급 명세서 ---------- */
function buildPaySlipHtml(stfId, ym){
  const stf = db.stf.find(s=>s.id===stfId);
  if(!stf) return '';
  const data = buildSettleData(ym)[stfId] || {coach:[], cls:[], travel:[]};
  const r = getRates();
  const coachSum = data.coach.reduce((a,b)=>a+b.amount,0);
  const clsSum = data.cls.reduce((a,b)=>a+b.amount,0);
  const trvSum = data.travel.reduce((a,b)=>a+b.amount,0);
  const tot = coachSum+clsSum+trvSum;
  const tax = Math.round(tot * r.taxPct/100);
  const net = tot - tax;

  let rows = '';
  if(data.coach.length>0){
    rows += `<tr class="subhead"><td colspan="6">▣ 학습코칭 (50분×${data.coach.length}회 = ${formatMoney(coachSum)})</td></tr>`;
    data.coach.forEach(d=>{
      rows += `<tr><td>${d.date}</td><td class="al">${d.stu}</td><td class="al">${d.sc}</td>
        <td>${d.time}</td><td class="al">${d.topic}</td><td class="ar">${formatMoney(d.amount)}</td></tr>`;
    });
  }
  if(data.cls.length>0){
    rows += `<tr class="subhead"><td colspan="6">▣ 수업협력 (${data.cls.length}교시 = ${formatMoney(clsSum)})</td></tr>`;
    data.cls.forEach(d=>{
      rows += `<tr><td>${d.date}</td><td class="al">${d.stu}</td><td class="al">${d.sc}</td>
        <td>${d.time}</td><td class="al">${d.topic}</td><td class="ar">${formatMoney(d.amount)}</td></tr>`;
    });
  }
  if(data.travel.length>0){
    rows += `<tr class="subhead"><td colspan="6">▣ 연수 출장비 (${data.travel.length}회 = ${formatMoney(trvSum)})</td></tr>`;
    data.travel.forEach(d=>{
      rows += `<tr><td>${d.date}</td><td class="al" colspan="2">${d.title}</td>
        <td class="center">${d.hours}시간</td><td class="al">${d.hours>=4?'4시간이상':'4시간미만'}</td>
        <td class="ar">${formatMoney(d.amount)}</td></tr>`;
    });
  }
  if(!rows) rows = `<tr><td colspan="6" style="padding:24px;color:#9ca3af">해당 월 승인 실적 없음</td></tr>`;

  return `<div class="pay-doc">
    <div class="pay-title">활동비 지급 명세서 (${ym})</div>
    <div class="pay-meta">
      <div>수령인: <b>${stf.nm}</b> (${stf.ph||'-'})</div>
      <div>소속: <b>${db.cfg.org||''}</b></div>
      <div>발행일: ${todayStr()}</div>
    </div>
    <table class="pay-tbl">
      <thead><tr><th>날짜</th><th>학생/제목</th><th>학교</th><th>시간</th><th>내용</th><th>금액</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pay-sum">
      <div class="row"><span>학습코칭 소계 (${data.coach.length}회 × ${formatMoney(r.coach)})</span><b>${formatMoney(coachSum)}</b></div>
      <div class="row"><span>수업협력 소계 (${data.cls.length}회 × ${formatMoney(r.cls)})</span><b>${formatMoney(clsSum)}</b></div>
      <div class="row"><span>연수 출장비 소계 (${data.travel.length}회)</span><b>${formatMoney(trvSum)}</b></div>
      <div class="row" style="border-top:1px solid #cbd5e1; padding-top:8px; margin-top:4px"><span>단가 합계 / 지급액(총액)</span><b>${formatMoney(tot)}</b></div>
      <div class="row"><span>공제액 (원천징수 ${r.taxPct}%)</span><b style="color:#dc2626">-${formatMoney(tax)}</b></div>
      <div class="row total"><span>★ 실지급액</span><span>${formatMoney(net)}</span></div>
    </div>
    <div class="pay-note">
      ※ 실제 입금은 지출담당 부서(K-에듀파인)에서 처리됩니다.<br>
      ※ 확인자: ${db.cfg.confirmer || '학습상담사'} ______________________ (인)
    </div>
  </div>`;
}

function refreshPayStfSelect(){
  const sel = $('pay-stf-sel');
  if(!sel) return;
  const active = db.stf.filter(s=>s.st==='active').sort((a,b)=>a.nm.localeCompare(b.nm));
  sel.innerHTML = '<option value="">(지원단을 선택하세요)</option>' +
    active.map(s=>`<option value="${s.id}">${s.nm}</option>`).join('');
  if(!$('pay-ym').value) $('pay-ym').value = thisMonth();
}
function renderPaySlip(){
  const stfId = $('pay-stf-sel').value; const ym = $('pay-ym').value;
  if(!stfId || !ym){ toast('지원단과 월을 선택하세요','warning'); return; }
  $('pay-slip-area').innerHTML = buildPaySlipHtml(stfId, ym);
}
function renderPaySlipAll(){
  const ym = $('pay-ym').value || thisMonth();
  const data = buildSettleData(ym);
  const ids = Object.keys(data);
  if(ids.length===0){ toast('해당 월에 승인 실적이 없습니다','warning'); return; }
  $('pay-slip-area').innerHTML = ids.map(id=>buildPaySlipHtml(id, ym))
    .join('<div class="page-break"></div>');
  toast(`${ids.length}명 명세서 생성 완료`,'success');
}
function printPaySlip(){
  const area = $('pay-slip-area');
  if(!area.innerHTML.trim()){ toast('먼저 명세서를 생성하세요','warning'); return; }
  openPrintWin('활동비 지급 명세서', area.innerHTML);
}
function printSinglePaySlip(stfId, ym){
  openPrintWin('활동비 지급 명세서', buildPaySlipHtml(stfId, ym));
}
function printAllPaySlips(){
  const ym = $('stl-month').value || thisMonth();
  const data = buildSettleData(ym);
  const ids = Object.keys(data);
  if(ids.length===0){ toast('해당 월 승인 실적이 없습니다','warning'); return; }
  openPrintWin('전체 지급 명세서', ids.map(id=>buildPaySlipHtml(id, ym))
    .join('<div class="page-break"></div>'));
}

function exportPaySlipXlsx(){
  const stfId = $('pay-stf-sel').value; const ym = $('pay-ym').value;
  if(!stfId || !ym){ toast('지원단과 월을 선택하세요','warning'); return; }
  const stf = db.stf.find(s=>s.id===stfId);
  const data = buildSettleData(ym)[stfId] || {coach:[], cls:[], travel:[]};
  const r = getRates();
  const aoa = [[`활동비 지급 명세서 (${ym})`],
    [`수령인: ${stf.nm}`,'', `소속: ${db.cfg.org||''}`,'', `발행일: ${todayStr()}`],
    [],['날짜','구분','학생/제목','학교','시간/회차','내용','단가','지급액']];
  data.coach.forEach(d=>aoa.push([d.date,'학습코칭',d.stu,d.sc,d.time,d.topic,r.coach,d.amount]));
  data.cls.forEach(d=>aoa.push([d.date,'수업협력',d.stu,d.sc,d.time,d.topic,r.cls,d.amount]));
  data.travel.forEach(d=>aoa.push([d.date,'연수출장',d.title,'',d.hours+'시간',
    d.hours>=4?'4시간이상':'4시간미만', d.amount, d.amount]));
  const tot = data.coach.reduce((a,b)=>a+b.amount,0) + data.cls.reduce((a,b)=>a+b.amount,0)
    + data.travel.reduce((a,b)=>a+b.amount,0);
  const tax = Math.round(tot*r.taxPct/100);
  aoa.push([]);
  aoa.push(['','','','','','단가합계/지급액',' ', tot]);
  aoa.push(['','','','','',`공제액(${r.taxPct}%)`,' ', -tax]);
  aoa.push(['','','','','','★ 실지급액',' ', tot-tax]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:12},{wch:10},{wch:16},{wch:16},{wch:14},{wch:22},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, '지급명세서');
  XLSX.writeFile(wb, `지급명세서_${stf.nm}_${ym}.xlsx`);
  toast('엑셀 다운로드 완료','success');
}

/* ---------- 센터 집행내역서 ---------- */
function buildExecReportHtml(ym){
  const data = buildSettleData(ym);
  const r = getRates();
  const stfIds = Object.keys(data).sort();
  let grandCoach=0, grandCls=0, grandTrv=0;
  const rows = stfIds.map((id,idx)=>{
    const d = data[id]; const stf = (IDX.stfById||{})[id];
    const coachSum = d.coach.reduce((a,b)=>a+b.amount,0);
    const clsSum = d.cls.reduce((a,b)=>a+b.amount,0);
    const trvSum = d.travel.reduce((a,b)=>a+b.amount,0);
    const tot = coachSum+clsSum+trvSum;
    grandCoach+=coachSum; grandCls+=clsSum; grandTrv+=trvSum;
    return `<tr>
      <td class="center">${idx+1}</td>
      <td><b>${stf?stf.nm:'?'}</b></td>
      <td class="center">${d.coach.length}회</td>
      <td class="ar">${formatMoney(coachSum)}</td>
      <td class="center">${d.cls.length}회</td>
      <td class="ar">${formatMoney(clsSum)}</td>
      <td class="center">${d.travel.length}회</td>
      <td class="ar">${formatMoney(trvSum)}</td>
      <td class="ar"><b>${formatMoney(tot)}</b></td>
    </tr>`;
  }).join('');
  const grand = grandCoach+grandCls+grandTrv;

  return `<div class="pay-doc">
    <div class="pay-title">월별 활동비 집행내역서 (${ym})</div>
    <div class="pay-meta">
      <div>기관: <b>${db.cfg.org||''}</b></div>
      <div>대상: ${ym}</div>
      <div>발행일: ${todayStr()}</div>
    </div>
    <table class="pay-tbl">
      <thead><tr><th>No</th><th>지원단</th>
        <th>학습코칭</th><th>금액</th>
        <th>수업협력</th><th>금액</th>
        <th>출장비</th><th>금액</th>
        <th>총액(세전)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" style="padding:24px;color:#9ca3af">승인 실적 없음</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">합계</td>
        <td class="ar">${formatMoney(grandCoach)}</td><td></td>
        <td class="ar">${formatMoney(grandCls)}</td><td></td>
        <td class="ar">${formatMoney(grandTrv)}</td>
        <td class="ar" style="color:#059669">${formatMoney(grand)}</td></tr></tfoot>
    </table>
    <div class="pay-note">
      ※ 이 내역서는 K-에듀파인 지출결의 첨부용입니다. 금액은 총액(세전)이며 원천징수는 지출담당 부서에서 처리합니다.<br>
      ※ 발행·확인자: ${db.cfg.confirmer||'학습상담사'} ______________ (인)
    </div>
  </div>`;
}

function renderExecReport(){
  const ym = $('exec-ym').value || thisMonth();
  if(!$('exec-ym').value) $('exec-ym').value = ym;
  $('exec-area').innerHTML = buildExecReportHtml(ym);
}
function printExecReport(){
  const area = $('exec-area');
  if(!area.innerHTML.trim()){ toast('먼저 집행내역서를 생성하세요','warning'); return; }
  openPrintWin('월별 집행내역서', area.innerHTML);
}
function exportExecReportXlsx(){
  const ym = $('exec-ym').value || thisMonth();
  const data = buildSettleData(ym);
  const ids = Object.keys(data).sort();
  const aoa = [[`월별 활동비 집행내역서 (${ym})`],
    [`기관: ${db.cfg.org||''}`],
    [],['No','지원단','코칭(회)','코칭금액','협력(회)','협력금액','출장(회)','출장금액','합계(세전)','비고']];
  let g1=0,g2=0,g3=0;
  ids.forEach((id,i)=>{
    const d = data[id]; const stf = (IDX.stfById||{})[id];
    const c1 = d.coach.reduce((a,b)=>a+b.amount,0);
    const c2 = d.cls.reduce((a,b)=>a+b.amount,0);
    const c3 = d.travel.reduce((a,b)=>a+b.amount,0);
    aoa.push([i+1, stf?stf.nm:'(탈퇴)', d.coach.length, c1, d.cls.length, c2, d.travel.length, c3, c1+c2+c3, stf ? '' : '지원단 정보 없음']);
    g1+=c1; g2+=c2; g3+=c3;
  });
  aoa.push([]);
  aoa.push(['','합계','',g1,'',g2,'',g3,g1+g2+g3,'']);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:5},{wch:12},{wch:10},{wch:14},{wch:10},{wch:14},{wch:10},{wch:14},{wch:14},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws, '집행내역서');
  XLSX.writeFile(wb, `집행내역서_${ym}.xlsx`);
  toast('엑셀 다운로드 완료','success');
}

/* ---------- 수업협력 ---------- */
function renClassSupport(){
  buildIndex();
  const cls = db.mat.filter(m=>m.kind==='class' && m.st==='active');
  if(cls.length===0){
    $('cls-list').innerHTML = `<div style="padding:30px; text-align:center; color:var(--muted); grid-column:1/-1">
      배정된 수업협력이 없습니다. [+ 수업협력 배정] 버튼으로 추가하세요</div>`;
  } else {
    $('cls-list').innerHTML = cls.map(m=>{
      const stf = IDX.stfById[m.stfId];
      const stu = IDX.stuById[m.stuId]; // 학급 대표 학생 (학급정보 목적)
      const cls = m.classInfo || {};
      const slots = (m.slots||[]).map(s=>`${s.d} ${s.s}~${s.e}`).join(', ');
      const mins = classSessionMinutes(cls.scType || (stu?stu.scType:'초'));
      return `<div class="cls-card">
        <div class="hd">
          <div><b>${cls.sc||(stu?stu.sc:'')}</b><br><small>${cls.scType||'초'} ${cls.gr||''}-${cls.cls||''}반</small></div>
          <span class="badge bg-info">${mins}분</span>
        </div>
        <div class="stf">👩‍🏫 ${stf?stf.nm:'?'}</div>
        <div style="font-size:12px; color:var(--muted); margin-top:6px">⏰ ${slots||'시간 미정'}</div>
        <div style="font-size:12px; margin-top:6px">과목: ${cls.subject||'-'}</div>
        <div style="margin-top:8px; text-align:right">
          <button class="btn btn-xs btn-outline" onclick="openClassMatchModal('${m.id}')">수정</button>
          <button class="btn btn-xs btn-danger" onclick="unmatch('${m.id}')">해제</button>
        </div>
      </div>`;
    }).join('');
  }
  // 지원단별 현황
  const byStf = {};
  cls.forEach(m=>{
    if(!byStf[m.stfId]) byStf[m.stfId] = {cnt:0, hours:0, schools:new Set()};
    byStf[m.stfId].cnt++;
    byStf[m.stfId].hours += (m.slots||[]).length;
    const c = m.classInfo||{};
    if(c.sc) byStf[m.stfId].schools.add(c.sc);
  });
  const tbody = document.querySelector('#cls-by-stf tbody');
  if(tbody){
    const rows = Object.keys(byStf).map(id=>{
      const s = IDX.stfById[id]; const d = byStf[id];
      return `<tr><td><b>${s?s.nm:'?'}</b></td><td class="center">${d.cnt}</td>
        <td class="center">${d.hours}교시</td><td>${[...d.schools].join(', ')}</td></tr>`;
    }).join('');
    tbody.innerHTML = rows || '<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--muted)">데이터 없음</td></tr>';
  }
}

function openClassMatchModal(matId){
  buildIndex();
  const m = matId ? db.mat.find(x=>x.id===matId) : null;
  const ci = m ? (m.classInfo||{}) : {};
  const schools = [...new Set(db.stu.map(s=>s.sc).filter(Boolean))];
  const stfOptions = db.stf.filter(s=>s.st==='active')
    .map(s=>`<option value="${s.id}" ${m&&m.stfId===s.id?'selected':''}>${s.nm}</option>`).join('');
  const schOptions = schools.map(sc=>`<option value="${sc}" ${ci.sc===sc?'selected':''}>${sc}</option>`).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-bg show';
  modal.id = 'modal-cls-match';
  modal.innerHTML = `<div class="modal">
    <div class="modal-header">
      <div class="modal-title">${matId?'수업협력 수정':'수업협력 배정'}</div>
      <button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>지원단*</label>
        <select id="cls-stf"><option value="">선택</option>${stfOptions}</select></div>
      <div class="form-group"><label>학교*</label>
        <select id="cls-sc"><option value="">선택</option>${schOptions}</select>
        <input id="cls-sc-new" placeholder="또는 직접 입력" style="margin-top:4px">
      </div>
      <div class="form-group"><label>학교급*</label>
        <select id="cls-sctype">
          <option value="초" ${ci.scType==='초'?'selected':''}>초등(40분)</option>
          <option value="중" ${ci.scType==='중'?'selected':''}>중등(45분)</option>
          <option value="고" ${ci.scType==='고'?'selected':''}>고등(50분)</option>
        </select></div>
      <div class="form-group"><label>학년</label><input type="number" id="cls-gr" min="1" max="6" value="${ci.gr||''}"></div>
      <div class="form-group"><label>반</label><input type="number" id="cls-cls" min="1" value="${ci.cls||''}"></div>
      <div class="form-group"><label>과목</label><input id="cls-subject" value="${ci.subject||''}" placeholder="예: 국어"></div>
    </div>
    <div class="form-group">
      <label>수업 시간 (요일·교시)</label>
      <div class="slot-list" id="cls-slots"></div>
      <button class="btn btn-sm btn-outline" onclick="addSlot('cls-slots')" style="margin-top:6px">+ 시간대 추가</button>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px">
      <button class="btn btn-outline" onclick="this.closest('.modal-bg').remove()">취소</button>
      <button class="btn btn-primary" onclick="saveClassMatch('${matId||''}')">저장</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  // 슬롯 프리필
  const slotList = $('cls-slots');
  if(m && (m.slots||[]).length>0){
    m.slots.forEach(s=>addSlot('cls-slots', s));
  } else {
    addSlot('cls-slots', {d:'월', s:'09:00', e:'09:40'});
  }
}

async function saveClassMatch(matId){
  const stfId = $('cls-stf').value;
  const sc = $('cls-sc-new').value.trim() || $('cls-sc').value;
  if(!stfId || !sc){ toast('지원단과 학교는 필수','warning'); return; }
  const slots = readSlots('cls-slots');
  if(slots.length===0){ toast('수업 시간을 입력하세요','warning'); return; }

  const classInfo = {
    sc, scType: $('cls-sctype').value,
    gr: parseInt($('cls-gr').value)||null,
    cls: parseInt($('cls-cls').value)||null,
    subject: $('cls-subject').value.trim()
  };

  let m;
  if(matId){
    m = db.mat.find(x=>x.id===matId);
    if(!m) return;
    m.stfId = stfId; m.slots = slots; m.classInfo = classInfo; m.kind = 'class';
  } else {
    m = {
      id: uid(), stfId, stuId: '', kind:'class',
      slots, classInfo, st:'active', logs:[], createdAt:Date.now()
    };
    db.mat.push(m);
  }
  await save('mat', m);
  document.getElementById('modal-cls-match').remove();
  toast('수업협력 저장','success');
  renClassSupport(); refreshDashboard();
}

/* ---------- 새창 인쇄 헬퍼 ---------- */
function openPrintWin(title, contentHtml){
  const styles = Array.from(document.querySelectorAll('style')).map(s=>s.outerHTML).join('');
  const w = window.open('', '_blank', 'width=1000,height=800');
  if(!w){ toast('팝업이 차단되었습니다. 팝업을 허용해주세요','danger'); return; }
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
    ${styles}
    <style>
      body{background:#fff; padding:24px; font-family:"Pretendard",sans-serif}
      .no-print{display:none}
      @media print{ body{padding:0} .page-break{page-break-after:always} }
      .print-bar{position:fixed; top:10px; right:10px; display:flex; gap:6px; z-index:1000}
    </style>
    </head><body>
    <div class="print-bar no-print">
      <button class="btn btn-primary" onclick="window.print()">🖨️ 인쇄</button>
      <button class="btn btn-outline" onclick="window.close()">닫기</button>
    </div>
    ${contentHtml}
    <scr${''}ipt>setTimeout(()=>{try{window.focus()}catch(e){}},100);<\/scr${''}ipt>
    </body></html>`);
  w.document.close();
}

/* 기존 printMgrBook 오버라이드 - 새창 사용 */
function printMgrBook(){
  const area = $('mgr-book-area');
  if(!area.innerHTML.trim()){ toast('먼저 관리부를 생성하세요','warning'); return; }
  openPrintWin('학습지원단 관리부', area.innerHTML);
}
function printTT(){
  const area = $('tt-area');
  if(!area.innerHTML.trim()){ toast('먼저 시간표를 생성하세요','warning'); return; }
  openPrintWin('시간표', area.innerHTML);
}

/* ---------- 연수 (확장) ---------- */
function renTrnV99(){
  const tbody = $('trn-tbody');
  if(!tbody) return;
  if(db.trn.length === 0){
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:24px; color:#9ca3af">등록된 연수가 없습니다</td></tr>';
    return;
  }
  const r = getRates();
  tbody.innerHTML = db.trn.slice().sort((a,b)=>(b.dt||'').localeCompare(a.dt||'')).map(t=>{
    const attCnt = (t.attendees||[]).length;
    const per = (t.hr||0) >= 4 ? r.travelLong : r.travelShort;
    const travelTotal = per * attCnt;
    const verBadge = t.verified ? '<span class="badge bg-yes">✅검증</span>' : '<span class="badge bg-info">미검증</span>';
    return `<tr>
      <td>${(t.dt||'').slice(0,16).replace('T',' ')}</td>
      <td><b>${t.nm}</b></td>
      <td>${t.lect||'-'}</td>
      <td class="center">${t.hr||0}h</td>
      <td class="center">${attCnt}명</td>
      <td class="ar">${formatMoney(travelTotal)}<br><small style="color:#6b7280">(${formatMoney(per)}×${attCnt})</small></td>
      <td class="center">${verBadge}</td>
      <td>
        ${t.verified
          ? `<button class="btn btn-xs btn-outline" onclick="unverifyTrn('${t.id}')">검증취소</button>`
          : `<button class="btn btn-xs btn-success" onclick="verifyTrn('${t.id}')">✅ 검증</button>`}
        <button class="btn btn-xs btn-primary" onclick="printTrnAttend('${t.id}')">📖 출석부</button>
        <button class="btn btn-xs btn-info" onclick="printTrnTravel('${t.id}')">📄 증빙</button>
        <button class="btn btn-xs btn-outline" onclick="openTrnModal('${t.id}')">수정</button>
        <button class="btn btn-xs btn-danger" onclick="delTrn('${t.id}')">삭제</button>
      </td>
    </tr>`;
  }).join('');
}
window.renTrn = renTrnV99;

async function verifyTrn(id){
  const t = db.trn.find(x=>x.id===id); if(!t) return;
  t.verified = true;
  t.verifiedBy = db.cfg.confirmer || '학습상담사';
  t.verifiedAt = Date.now();
  await save('trn', t);
  toast('연수 검증 완료 - 출장비가 예산에 반영됩니다','success');
  renTrn(); refreshDashboard();
}
async function unverifyTrn(id){
  const t = db.trn.find(x=>x.id===id); if(!t) return;
  t.verified = false;
  await save('trn', t);
  renTrn(); refreshDashboard();
}

function printTrnAttend(id){
  const t = db.trn.find(x=>x.id===id); if(!t) return;
  const attNames = (t.attendees||[]).map(sid=>{
    const s = db.stf.find(x=>x.id===sid);
    return s ? {id:sid, nm:s.nm, ph:s.ph||''} : null;
  }).filter(Boolean);
  const rows = attNames.map((a,i)=>`<tr>
    <td class="center">${i+1}</td><td>${a.nm}</td><td>${a.ph}</td>
    <td style="height:44px"></td></tr>`).join('');
  const html = `<div class="pay-doc">
    <div class="pay-title">${t.nm} 참석 확인부</div>
    <div class="pay-meta">
      <div>일시: <b>${(t.dt||'').replace('T',' ')}</b></div>
      <div>이수시간: ${t.hr}시간</div>
      <div>강사: ${t.lect||'-'}</div>
      <div>장소: ${t.loc||'-'}</div>
    </div>
    <table class="pay-tbl" style="margin-top:14px">
      <thead><tr><th style="width:60px">No</th><th>성명</th><th style="width:160px">연락처</th><th style="width:120px">서명</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="padding:20px">참석자 없음</td></tr>'}</tbody>
    </table>
    <div class="pay-note">
      ※ 위 참석자는 해당 연수에 참석하였음을 확인합니다.<br>
      ※ 확인자: ${db.cfg.confirmer||'학습상담사'} ____________________ (인)
    </div>
  </div>`;
  openPrintWin(t.nm+' 출석부', html);
}

function printTrnTravel(id){
  const t = db.trn.find(x=>x.id===id); if(!t) return;
  const r = getRates();
  const per = (t.hr||0) >= 4 ? r.travelLong : r.travelShort;
  const attList = (t.attendees||[]).map(sid=>db.stf.find(x=>x.id===sid)).filter(Boolean);
  const rows = attList.map((s,i)=>`<tr>
    <td class="center">${i+1}</td>
    <td><b>${s.nm}</b></td>
    <td class="center">${t.hr}시간</td>
    <td class="center">${t.hr>=4?'4시간이상':'4시간미만'}</td>
    <td class="ar">${formatMoney(per)}</td>
    <td style="height:44px"></td>
  </tr>`).join('');
  const totalAmt = per * attList.length;
  const html = `<div class="pay-doc">
    <div class="pay-title">연수 출장비 지급 증빙</div>
    <div class="pay-meta">
      <div>연수명: <b>${t.nm}</b></div>
      <div>일시: ${(t.dt||'').replace('T',' ')}</div>
      <div>장소: ${t.loc||'-'}</div>
    </div>
    <table class="pay-tbl" style="margin-top:14px">
      <thead><tr><th>No</th><th>성명</th><th>참석시간</th><th>구분</th><th>지급액</th><th>수령확인</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="padding:20px">참석자 없음</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">합계</td>
        <td class="ar"><b>${formatMoney(totalAmt)}</b></td><td></td></tr></tfoot>
    </table>
    <div class="pay-note">
      ※ 출장비 기준: 4시간 이상 ${formatMoney(r.travelLong)}, 4시간 미만 ${formatMoney(r.travelShort)}<br>
      ※ 확인자: ${db.cfg.confirmer||'학습상담사'} ____________________ (인)
    </div>
  </div>`;
  openPrintWin(t.nm+' 출장비 증빙', html);
}

/* ---------- 관리부 확인자 학습상담사로 통일 ---------- */
/* buildMgrBookHtml은 이미 db.cfg.mgr_edu/admin 참조하므로, 저장 시 confirmer 사용 */

/* ---------- 관리부가 승인된 실적만 포함하도록 (collectStfLogs 오버라이드) ---------- */
const _origCollectStfLogs = window.collectStfLogs;
window.collectStfLogs = function(stfId, ym){
  const mats = db.mat.filter(m=>m.stfId===stfId);
  const result = [];
  mats.forEach(m=>{
    const stu = db.stu.find(x=>x.id===m.stuId);
    (m.logs||[]).forEach(l=>{
      ensureLogFields(l, m);
      // 승인된 실적만
      if(l.status !== 'verified' && l.status !== 'paid') return;
      if(l.date && l.date.startsWith(ym)){
        result.push({
          date: l.date,
          time: l.time || '',
          topic: (l.topic || l.content || '') + (l.kind==='class'?' [수업협력]':''),
          stuNm: m.kind==='class' ? ((m.classInfo||{}).sc||'') : (stu?stu.nm||'':'(삭제됨)'),
          scNm: stu ? (stu.sc||'') : ((m.classInfo||{}).sc||''),
          stuGrade: stu ? `${stu.scType||''}${stu.gr||''}` : '',
          matId: m.id, place: l.place || '',
          kind: l.kind, minutes: l.minutes
        });
      }
    });
  });
  result.sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  return result;
};

/* ---------- saveCfg 확장 (확인자 저장) ---------- */
const _origSaveCfg = window.saveCfg;
window.saveCfg = async function(){
  if($('cfg-confirmer')) db.cfg.confirmer = $('cfg-confirmer').value || '담당 장학사';
  if(_origSaveCfg) await _origSaveCfg();
  else {
    await save('meta', {id:'cfg', ...db.cfg});
    toast('설정 저장','success');
  }
};

/* ---------- goTab 확장 (서브탭 초기화) ---------- */
const _origGoTab = window.goTab;
window.goTab = function(id, btn){
  if(_origGoTab) _origGoTab(id, btn);
  if(id==='t5'){
    if(typeof refreshRecStfSelect==='function') refreshRecStfSelect();
    if($('rec-month') && !$('rec-month').value) $('rec-month').value = thisMonth();
  }
  if(id==='t8'){ refreshPayStfSelect(); }
  if(id==='t9'){ loadRatesAndBudget(); }
};

/* ---------- 초기화 시점에 UI 세팅 ---------- */
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    loadRatesAndBudget();
    if(typeof refreshRecStfSelect==='function') refreshRecStfSelect();
    if($('rec-month') && !$('rec-month').value) $('rec-month').value = thisMonth();
  }, 800);
});

/* =================================================================
 * V9.9 END
 * ================================================================= */

