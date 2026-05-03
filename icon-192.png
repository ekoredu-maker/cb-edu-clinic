/* =================================================================
 * V10.0 MODULE: 위촉관리 · 서식확장 · 관리부분리 · 인쇄개선
 * ================================================================= */

/* ---------- 1. 개발자 모드 토글 ---------- */
(function(){
  try{
    const qs = new URLSearchParams(location.search);
    if(qs.get('dev')==='1'){
      const z = document.getElementById('dev-zone');
      if(z) z.style.display = 'block';
    }
  }catch(e){}
})();

/* ---------- 2. 위촉일 자동 계산 ---------- */
function autoSetApEnd(){
  const s = document.getElementById('sf-ap-start');
  const e = document.getElementById('sf-ap-end');
  if(!s || !e) return;
  if(s.value && !e.value){
    const d = new Date(s.value);
    d.setDate(d.getDate()+365-1);
    e.value = d.toISOString().slice(0,10);
  }
}

/* ---------- 3. openStaffModal 오버라이드 (위촉 필드 주입) ---------- */
const _origOpenStaffModal = window.openStaffModal;
window.openStaffModal = function(id){
  _origOpenStaffModal(id);
  // 리셋
  const setVal = (k,v)=>{ const el = document.getElementById(k); if(el) el.value = v||''; };
  setVal('sf-ap-start',''); setVal('sf-ap-end',''); setVal('sf-resign',''); setVal('sf-resign-reason','');
  const areaSel = document.getElementById('sf-ap-area'); if(areaSel) areaSel.value='학습코칭';
  if(id){
    const s = db.stf.find(x=>x.id===id);
    if(s){
      setVal('sf-ap-start', s.appointStart);
      setVal('sf-ap-end',   s.appointEnd);
      setVal('sf-resign',   s.resignDate);
      setVal('sf-resign-reason', s.resignReason);
      if(areaSel && s.appointArea) areaSel.value = s.appointArea;
    }
  }
};

/* ---------- 4. saveStaff 오버라이드 (위촉 필드 저장 + 경력 누적) ---------- */
const _origSaveStaff = window.saveStaff;
window.saveStaff = async function(){
  const id = editingStaffId;
  const prev = id ? db.stf.find(x=>x.id===id) : null;
  const prevCareer = prev ? (prev.careerHistory||[]) : [];
  await _origSaveStaff();
  // 저장된 객체 가져와서 보강
  const newId = id || (db.stf.length ? db.stf[db.stf.length-1].id : null);
  if(!newId) return;
  const s = db.stf.find(x=>x.id===newId);
  if(!s) return;
  const apStart = document.getElementById('sf-ap-start');
  const apEnd = document.getElementById('sf-ap-end');
  const apArea = document.getElementById('sf-ap-area');
  const resign = document.getElementById('sf-resign');
  const resignReason = document.getElementById('sf-resign-reason');
  s.appointStart = apStart ? apStart.value : '';
  s.appointEnd   = apEnd ? apEnd.value : '';
  s.appointArea  = apArea ? apArea.value : '학습코칭';
  s.resignDate   = resign ? resign.value : '';
  s.resignReason = resignReason ? resignReason.value : '';
  // 경력 누적: 이전 위촉기간이 새것과 다르면 이력에 추가
  s.careerHistory = prevCareer.slice();
  if(prev && prev.appointStart && prev.appointEnd &&
     (prev.appointStart !== s.appointStart || prev.appointEnd !== s.appointEnd)){
    s.careerHistory.push({
      start: prev.appointStart, end: prev.appointEnd,
      area:  prev.appointArea || '학습코칭'
    });
  }
  await save('stf', s);
  // 해촉 처리: resignDate 있으면 상태 '종료'로
  if(s.resignDate && s.st!=='end'){
    s.st = 'end';
    await save('stf', s);
    if(typeof renStaff==='function') renStaff();
  }
};

/* ---------- 5. 관리부 (학습코칭/수업협력 분리) ---------- */
window.collectStfLogs = function(stfId, ym, kindFilter){
  const mats = db.mat.filter(m=>m.stfId===stfId);
  const result = [];
  mats.forEach(m=>{
    const stu = db.stu.find(x=>x.id===m.stuId);
    (m.logs||[]).forEach(l=>{
      ensureLogFields(l, m);
      if(l.status !== 'verified' && l.status !== 'paid') return;
      if(!l.date || !l.date.startsWith(ym)) return;
      const kind = l.kind || m.kind || 'coach';
      if(kindFilter && kind !== kindFilter) return;
      const ci = m.classInfo||{};
      result.push({
        date: l.date,
        time: l.time || '',
        topic: l.topic || l.content || '',
        stuNm: kind==='class' ? (ci.scType+' '+(ci.gr||'')+'-'+(ci.cls||'')+'반') : (stu?stu.nm||'':'(삭제됨)'),
        scNm:  kind==='class' ? (ci.sc||'') : (stu?stu.sc||'':''),
        matId: m.id, place: l.place || '',
        kind: kind, minutes: l.minutes
      });
    });
  });
  result.sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  return result;
};

/* 관리부 HTML 재작성 - kind 분리 */
window.buildMgrBookHtml = function(stfId, ym, kindFilter){
  const stf = db.stf.find(s=>s.id===stfId);
  if(!stf) return '<div class="empty">지원단을 찾을 수 없습니다</div>';
  kindFilter = kindFilter || 'coach';
  const kindLbl = kindFilter==='class' ? '수업협력' : '학습코칭';

  const [yy, mm] = ym.split('-').map(n=>parseInt(n));
  const lastDay = new Date(yy, mm, 0).getDate();
  const logs = window.collectStfLogs(stfId, ym, kindFilter);

  if(logs.length===0){
    return `<div class="mgr-book">
      <div class="mgr-title">학습지원단 관리부 — ${kindLbl} (${yy}년 ${mm}월)</div>
      <div class="mgr-meta"><span>□ 성명: <b>${stf.nm}</b></span></div>
      <div style="padding:30px; text-align:center; color:#999; border:1px dashed #ddd; margin-top:16px">
        ${kindLbl} 승인 실적이 없습니다. (실적/검증 탭에서 승인 후 재생성)
      </div>
    </div>`;
  }

  const byDay = {};
  logs.forEach(l=>{
    const d = parseInt(l.date.split('-')[2]);
    if(!byDay[d]) byDay[d] = [];
    byDay[d].push(l);
  });
  const DAY_NM = ['일','월','화','수','목','금','토'];
  let totalCnt = 0, totalHr = 0;
  let rows = '';
  for(let i=1; i<=16; i++){
    const d1 = i, d2 = (i+16 <= lastDay) ? i+16 : null;
    const l1arr = byDay[d1] || [];
    const l1 = l1arr[0] || null;
    const day1 = l1 ? DAY_NM[new Date(yy, mm-1, d1).getDay()] : '';
    const l2arr = d2 ? (byDay[d2] || []) : [];
    const l2 = l2arr[0] || null;
    const day2 = (d2 && l2) ? DAY_NM[new Date(yy, mm-1, d2).getDay()] : '';
    const extra1 = l1arr.length > 1 ? `<br><small style="color:#6366f1">외 ${l1arr.length-1}건</small>` : '';
    const extra2 = l2arr.length > 1 ? `<br><small style="color:#6366f1">외 ${l2arr.length-1}건</small>` : '';
    totalCnt += l1arr.length + l2arr.length;
    [...l1arr, ...l2arr].forEach(l=>{
      const mt = (l.time||'').match(/(\d{2}):(\d{2}).*?(\d{2}):(\d{2})/);
      if(mt){
        const s = parseInt(mt[1])*60+parseInt(mt[2]);
        const e = parseInt(mt[3])*60+parseInt(mt[4]);
        totalHr += Math.max(0, (e-s)/60);
      } else if(l.minutes){
        totalHr += l.minutes/60;
      }
    });
    rows += `<tr>
      <td class="mgr-d">${d1}</td>
      <td class="mgr-w">${day1}</td>
      <td class="mgr-sc">${l1?l1.scNm:''}</td>
      <td class="mgr-t">${l1?l1.time:''}</td>
      <td class="mgr-c">${l1?(l1.topic+extra1):''}</td>
      <td class="mgr-stu">${l1?l1.stuNm:''}</td>
      <td class="mgr-d">${d2||''}</td>
      <td class="mgr-w">${day2}</td>
      <td class="mgr-sc">${l2?l2.scNm:''}</td>
      <td class="mgr-t">${l2?l2.time:''}</td>
      <td class="mgr-c">${l2?(l2.topic+extra2):''}</td>
      <td class="mgr-stu">${l2?l2.stuNm:''}</td>
    </tr>`;
  }
  const signer = (db.cfg.confirmer || '학습상담사');
  const orgName = db.cfg.org || '○○교육지원청';
  return `<div class="mgr-book">
    <div class="mgr-title">학습지원단 관리부 — ${kindLbl} (${yy}년 ${mm}월)</div>
    <div class="mgr-meta">
      <span>□ 소속: <b>${orgName}</b></span>
      <span>□ 성명: <b>${stf.nm}</b></span>
      <span>□ 연락처: ${stf.ph||'-'}</span>
      <span>□ 구분: <b>${kindLbl}</b></span>
    </div>
    <table class="mgr-tbl">
      <thead>
        <tr>
          <th>일</th><th>요</th><th>학교</th><th>시간</th><th>지도내용</th><th>${kindFilter==='class'?'학급':'학생'}</th>
          <th>일</th><th>요</th><th>학교</th><th>시간</th><th>지도내용</th><th>${kindFilter==='class'?'학급':'학생'}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="12" style="text-align:right; padding:10px">
          총 실시 회기: <b>${totalCnt}</b>회 · 총 시수: <b>${totalHr.toFixed(1)}</b>시간
          &nbsp;&nbsp;&nbsp; 확인자(${signer}): ______________ (인)
        </td></tr>
      </tfoot>
    </table>
  </div>`;
};

/* 관리부 생성 - kind 반영 */
window.renderMgrBook = function(){
  const stfId = document.getElementById('mgr-stf-sel').value;
  const ym = document.getElementById('mgr-ym').value;
  const kind = (document.getElementById('mgr-kind')||{}).value || 'coach';
  if(!stfId || !ym){ toast('지원단과 월을 선택하세요','warning'); return; }
  document.getElementById('mgr-book-area').innerHTML = window.buildMgrBookHtml(stfId, ym, kind);
};

/* 전체 일괄 - kind 반영 */
window.renderMgrBookAll = function(){
  const ym = document.getElementById('mgr-ym').value;
  const kind = (document.getElementById('mgr-kind')||{}).value || 'coach';
  if(!ym){ toast('월을 선택하세요','warning'); return; }
  const actives = db.stf.filter(s=>s.st==='active').sort((a,b)=>a.nm.localeCompare(b.nm));
  if(actives.length===0){ toast('활동중 지원단이 없습니다','warning'); return; }
  const htmls = actives.map(s=>window.buildMgrBookHtml(s.id, ym, kind)).join('<div class="page-break"></div>');
  document.getElementById('mgr-book-area').innerHTML = htmls;
  toast(`${actives.length}명 일괄 생성 완료`,'success');
};

/* ---------- 6. 서식 탭: 지원단 선택 드롭다운 채우기 ---------- */
function refreshFormStfSelect(){
  const sel = document.getElementById('form-stf-sel');
  if(!sel) return;
  const list = db.stf.slice().sort((a,b)=>a.nm.localeCompare(b.nm));
  sel.innerHTML = '<option value="">(지원단을 선택하세요)</option>' +
    list.map(s=>`<option value="${s.id}">${s.nm} (${s.st==='active'?'활동중':(s.st==='pause'?'휴식':'종료')})</option>`).join('');
}

/* ---------- 7. openForm 재작성 - 개별 발급 ---------- */
window.openForm = function(type){
  const area = document.getElementById('form-preview');
  const now = new Date();
  const ymd = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;
  const orgName = db.cfg.org || '○○교육지원청';
  const signer  = db.cfg.confirmer || '학습상담사';

  const stfId = (document.getElementById('form-stf-sel')||{}).value;
  const needStf = ['staff-appoint','appoint-confirm','career-confirm','resign','plan-doc'].includes(type);
  let stf = null;
  if(needStf){
    if(!stfId){ toast('지원단을 먼저 선택하세요','warning'); return; }
    stf = db.stf.find(x=>x.id===stfId);
    if(!stf){ toast('지원단 정보를 찾을 수 없습니다','danger'); return; }
  }

  const fmtDate = (iso)=>{
    if(!iso) return '____. __. __.';
    const d = new Date(iso);
    return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,'0')}. ${String(d.getDate()).padStart(2,'0')}.`;
  };

  if(type==='staff-appoint'){
    const apPeriod = (stf.appointStart && stf.appointEnd)
      ? `${fmtDate(stf.appointStart)} ~ ${fmtDate(stf.appointEnd)}`
      : '별도 공문에 따름';
    area.innerHTML = `<div class="form-doc">
      <h1 style="text-align:center; font-size:32px; letter-spacing:40px; margin:40px 0">위 촉 장</h1>
      <table class="pivot-tbl" style="margin:20px 0">
        <tr><th>성 명</th><td><b>${stf.nm}</b></td><th>생년월일</th><td>${stf.bd||'-'}</td></tr>
        <tr><th>위촉 분야</th><td colspan="3">${stf.appointArea||'학습코칭'}</td></tr>
        <tr><th>위촉 기간</th><td colspan="3">${apPeriod}</td></tr>
      </table>
      <p style="margin:30px 0; line-height:2; text-align:center">
        위 사람을 <b>${orgName}</b>의 <b>학습지원단</b>으로 위촉합니다.
      </p>
      <p style="text-align:center; margin-top:60px; font-size:18px">${ymd}</p>
      <p style="text-align:center; font-size:22px; font-weight:700; margin-top:20px; letter-spacing:8px">${orgName}</p>
    </div>`;
  }
  else if(type==='appoint-confirm'){
    const apPeriod = (stf.appointStart && stf.appointEnd)
      ? `${fmtDate(stf.appointStart)} ~ ${fmtDate(stf.appointEnd)}`
      : '별도 공문에 따름';
    area.innerHTML = `<div class="form-doc">
      <h1 style="text-align:center; font-size:26px; letter-spacing:20px; margin:30px 0">위촉 확인서</h1>
      <table class="pivot-tbl">
        <tr><th style="width:120px">성 명</th><td><b>${stf.nm}</b></td><th style="width:120px">생년월일</th><td>${stf.bd||'-'}</td></tr>
        <tr><th>연락처</th><td>${stf.ph||'-'}</td><th>소 속</th><td>${orgName}</td></tr>
        <tr><th>위촉 분야</th><td colspan="3"><b>${stf.appointArea||'학습코칭'}</b></td></tr>
        <tr><th>위촉 기간</th><td colspan="3"><b>${apPeriod}</b></td></tr>
      </table>
      <p style="margin:30px 0; line-height:2">
        위 사람은 현재 본 기관에서 위와 같이 <b>학습지원단</b>으로 위촉되어 활동 중임을 확인합니다.
      </p>
      <p style="text-align:center; margin-top:50px">${ymd}</p>
      <p style="text-align:center; font-size:18px; font-weight:700; margin-top:10px">${orgName}</p>
      <p style="text-align:center; margin-top:20px">확인자: ${signer} ______________ (인)</p>
    </div>`;
  }
  else if(type==='career-confirm'){
    // 누적 경력: careerHistory + 현재 위촉기간
    const all = (stf.careerHistory||[]).slice();
    if(stf.appointStart && stf.appointEnd){
      all.push({start: stf.appointStart, end: stf.appointEnd, area: stf.appointArea||'학습코칭', current:true});
    }
    // 각 기간별 승인된 회기수/시수
    const careerRows = all.map((c,i)=>{
      let cnt = 0, hr = 0;
      (db.mat||[]).filter(m=>m.stfId===stf.id).forEach(m=>{
        (m.logs||[]).forEach(l=>{
          if(l.status!=='verified' && l.status!=='paid') return;
          if(!l.date) return;
          if(l.date >= c.start && l.date <= c.end){
            cnt++; hr += (l.minutes||50)/60;
          }
        });
      });
      const months = Math.max(1, Math.round(((new Date(c.end)-new Date(c.start))/(1000*60*60*24*30))));
      return `<tr>
        <td class="center">${i+1}</td>
        <td>${c.area||'학습코칭'}</td>
        <td>${fmtDate(c.start)} ~ ${fmtDate(c.end)}${c.current?' <span class="badge bg-yes">현재</span>':''}</td>
        <td class="center">${months}개월</td>
        <td class="center">${cnt}회</td>
        <td class="center">${hr.toFixed(1)}h</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="center" style="color:#999; padding:30px">기록된 위촉 이력이 없습니다</td></tr>';
    const totalMonths = all.reduce((s,c)=>s+Math.max(1, Math.round(((new Date(c.end)-new Date(c.start))/(1000*60*60*24*30)))),0);
    area.innerHTML = `<div class="form-doc">
      <h1 style="text-align:center; font-size:26px; letter-spacing:20px; margin:30px 0">경력 확인서</h1>
      <table class="pivot-tbl">
        <tr><th style="width:120px">성 명</th><td><b>${stf.nm}</b></td><th style="width:120px">생년월일</th><td>${stf.bd||'-'}</td></tr>
        <tr><th>연락처</th><td colspan="3">${stf.ph||'-'}</td></tr>
      </table>
      <h3 style="margin:20px 0 8px; font-size:14px">▣ 위촉 이력 (누적 ${all.length}회 · 총 ${totalMonths}개월)</h3>
      <table class="pivot-tbl">
        <thead><tr>
          <th style="width:40px">No</th><th>분야</th><th>위촉 기간</th><th>기간</th><th>실시 회기</th><th>시수</th>
        </tr></thead>
        <tbody>${careerRows}</tbody>
      </table>
      <p style="margin:30px 0; line-height:2">
        위와 같이 본 기관에서의 <b>학습지원단 활동 경력</b>을 확인합니다.
      </p>
      <p style="text-align:center; margin-top:50px">${ymd}</p>
      <p style="text-align:center; font-size:18px; font-weight:700; margin-top:10px">${orgName}</p>
      <p style="text-align:center; margin-top:20px">확인자: ${signer} ______________ (인)</p>
    </div>`;
  }
  else if(type==='resign'){
    area.innerHTML = `<div class="form-doc">
      <h1 style="text-align:center; font-size:26px; letter-spacing:20px; margin:30px 0">해촉 신청서</h1>
      <table class="pivot-tbl">
        <tr><th style="width:120px">성 명</th><td><b>${stf.nm}</b></td><th style="width:120px">생년월일</th><td>${stf.bd||'-'}</td></tr>
        <tr><th>연락처</th><td colspan="3">${stf.ph||'-'}</td></tr>
        <tr><th>위촉 분야</th><td>${stf.appointArea||'학습코칭'}</td><th>위촉일</th><td>${fmtDate(stf.appointStart)}</td></tr>
        <tr><th>해촉 예정일</th><td><input type="text" placeholder="YYYY. MM. DD." style="width:100%; border:none; background:transparent"></td>
            <th>해촉 사유</th><td><input type="text" placeholder="사유 입력" style="width:100%; border:none; background:transparent" value="${(stf.resignReason||'').replace(/"/g,'&quot;')}"></td></tr>
        <tr><th colspan="4">세부 사유</th></tr>
        <tr><td colspan="4" style="height:120px; vertical-align:top">&nbsp;</td></tr>
      </table>
      <p style="margin:30px 0; line-height:2">
        위와 같은 사유로 학습지원단 활동 <b>해촉을 신청</b>합니다.
      </p>
      <p style="text-align:center; margin-top:40px">${ymd}</p>
      <p style="text-align:right; margin-top:20px">신청인: <b>${stf.nm}</b> ________________ (인)</p>
      <p style="text-align:left; margin-top:30px"><b>${orgName}</b> 학습상담사 귀하</p>
    </div>`;
  }
  else if(type==='plan-doc'){
    // 지원단 신청서 정보 연동
    const scdTxt = (stf.scd||[]).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ') || '-';
    const areasTxt = (stf.areas||[]).map(a=>{
      const found = (typeof AREA_BY_ID!=='undefined') ? AREA_BY_ID[a] : null;
      return found ? found.label : a;
    }).join(', ') || '-';
    const apPeriod = (stf.appointStart && stf.appointEnd)
      ? `${fmtDate(stf.appointStart)} ~ ${fmtDate(stf.appointEnd)}` : '-';
    // 담당 학생
    const myMats = db.mat.filter(m=>m.stfId===stf.id && m.st==='active');
    const stuList = myMats.map(m=>{
      if(m.kind==='class'){
        const ci = m.classInfo||{};
        return `${ci.sc||''} ${ci.scType||''} ${ci.gr||''}-${ci.cls||''}반 [수업협력]`;
      }
      const stu = db.stu.find(x=>x.id===m.stuId);
      return stu ? `${stu.nm} (${stu.sc||''} ${stu.gr||''}학년)` : '';
    }).filter(Boolean).join(', ') || '(매칭 없음)';

    area.innerHTML = `<div class="form-doc">
      <h1 style="text-align:center; font-size:22px; letter-spacing:8px; margin:30px 0">학습지도 계획서</h1>
      <h3 style="margin:20px 0 8px; font-size:14px">▣ 지원단 신청서 정보 (자동 연동)</h3>
      <table class="pivot-tbl">
        <tr><th style="width:100px">성명</th><td><b>${stf.nm}</b></td><th style="width:100px">연락처</th><td>${stf.ph||'-'}</td></tr>
        <tr><th>위촉 분야</th><td>${stf.appointArea||'학습코칭'}</td><th>위촉 기간</th><td>${apPeriod}</td></tr>
        <tr><th>지원 영역</th><td colspan="3">${areasTxt}</td></tr>
        <tr><th>활동 가능 시간</th><td colspan="3">${scdTxt}</td></tr>
        <tr><th>담당 학생/학급</th><td colspan="3">${stuList}</td></tr>
      </table>
      <h3 style="margin:20px 0 8px; font-size:14px">▣ 지도 계획</h3>
      <table class="pivot-tbl">
        <tr><th colspan="4">학습목표</th></tr>
        <tr><td colspan="4" style="height:90px; vertical-align:top">&nbsp;</td></tr>
        <tr><th colspan="4">지도계획 (단원/주제/활동)</th></tr>
        <tr><td colspan="4" style="height:220px; vertical-align:top">&nbsp;</td></tr>
        <tr><th colspan="4">평가방법</th></tr>
        <tr><td colspan="4" style="height:90px; vertical-align:top">&nbsp;</td></tr>
        <tr><th colspan="4">특이사항/학부모 요청</th></tr>
        <tr><td colspan="4" style="height:80px; vertical-align:top">&nbsp;</td></tr>
      </table>
      <p style="text-align:center; margin-top:40px">${ymd}</p>
      <p style="text-align:right; margin-top:20px">작성자(지원단): <b>${stf.nm}</b> ________________ (인)</p>
      <p style="text-align:right; margin-top:10px">확인자: ${signer} ________________ (인)</p>
    </div>`;
  }

  // 새 창 인쇄 버튼 자동 삽입
  const bar = document.createElement('div');
  bar.className = 'no-print';
  bar.style.cssText = 'margin-top:16px; text-align:center; display:flex; gap:8px; justify-content:center';
  bar.innerHTML = `
    <button class="btn btn-primary" onclick="printFormPreview()">🖨️ 새창 인쇄</button>
    <button class="btn btn-outline" onclick="document.getElementById('form-preview').innerHTML=''">✖ 닫기</button>`;
  area.appendChild(bar);
};

/* 서식 미리보기 - 새창 인쇄 */
window.printFormPreview = function(){
  const area = document.getElementById('form-preview');
  if(!area || !area.innerHTML.trim()){ toast('먼저 서식을 생성하세요','warning'); return; }
  // 버튼 바 제외
  const clone = area.cloneNode(true);
  clone.querySelectorAll('.no-print').forEach(n=>n.remove());
  openPrintWin('서식 출력', clone.innerHTML);
};

/* ---------- 8. 서식 탭 활성화 시 dropdown 채우기 ---------- */
const _origGoTabV10 = window.goTab;
window.goTab = function(id, btn){
  if(_origGoTabV10) _origGoTabV10(id, btn);
  if(id==='t8'){
    refreshFormStfSelect();
    // 월 자동 기본값
    const ym = document.getElementById('mgr-ym');
    if(ym && !ym.value) ym.value = (typeof thisMonth==='function') ? thisMonth() : new Date().toISOString().slice(0,7);
  }
};

/* ---------- 9. 대시보드 위촉 만료 경고 ---------- */
function buildAppointAlerts(){
  const today = new Date(); today.setHours(0,0,0,0);
  const warn = [];
  (db.stf||[]).filter(s=>s.st==='active' && s.appointEnd).forEach(s=>{
    const end = new Date(s.appointEnd);
    const diff = Math.round((end - today)/(1000*60*60*24));
    if(diff <= 30 && diff >= -7){
      warn.push({stf:s, diff});
    }
  });
  if(warn.length===0) return '';
  warn.sort((a,b)=>a.diff-b.diff);
  return `<div style="padding:12px; background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; margin-bottom:12px">
    <div style="font-weight:700; color:#92400e; margin-bottom:6px">⚠️ 위촉 만료 예정 (${warn.length}명)</div>
    <div style="font-size:12px; color:#78350f">
      ${warn.slice(0,10).map(w=>{
        const lbl = w.diff>=0?`D-${w.diff}`:`만료 ${-w.diff}일 경과`;
        return `· <b>${w.stf.nm}</b> (${w.stf.appointArea||'학습코칭'}) ${lbl} — ${w.stf.appointEnd}`;
      }).join('<br>')}
      ${warn.length>10?`<br>... 외 ${warn.length-10}명`:''}
    </div>
  </div>`;
}

/* 대시보드 refresh 후 위촉 경고 주입 */
const _origRefreshDashboard = window.refreshDashboard;
window.refreshDashboard = function(){
  if(_origRefreshDashboard) _origRefreshDashboard();
  setTimeout(()=>{
    const host = document.querySelector('#t1');
    if(!host) return;
    // 기존 경고 제거
    const old = document.getElementById('appoint-alert-box');
    if(old) old.remove();
    const alertHtml = buildAppointAlerts();
    if(!alertHtml) return;
    const wrap = document.createElement('div');
    wrap.id = 'appoint-alert-box';
    wrap.innerHTML = alertHtml;
    host.insertBefore(wrap, host.firstChild);
  }, 50);
};

/* ---------- 10. 서식 문서 공통 CSS 주입 ---------- */
(function(){
  const s = document.createElement('style');
  s.textContent = `
    .form-doc{background:#fff; padding:40px 50px; border:1px solid var(--border); max-width:820px; margin:0 auto; font-family:"Pretendard",serif; line-height:1.6}
    .form-doc h1,.form-doc h2,.form-doc h3{color:#111}
    .form-doc table.pivot-tbl{width:100%; border-collapse:collapse; margin:8px 0}
    .form-doc table.pivot-tbl th,.form-doc table.pivot-tbl td{border:1px solid #333; padding:8px 10px}
    .form-doc table.pivot-tbl th{background:#f3f4f6; font-weight:700}
    .form-doc .center{text-align:center}
  `;
  document.head.appendChild(s);
})();

/* ---------- 11. 설정 저장에 confirmer 유지 (loadCfg 시 표시) ---------- */
(function(){
  const _orig = window.saveCfg;
  if(_orig){
    window.saveCfg = async function(){
      const c = document.getElementById('cfg-confirmer');
      if(c && c.value) db.cfg.confirmer = c.value;
      return _orig.apply(this, arguments);
    };
  }
  // loadCfg 복원 시 값 반영
  window.addEventListener('load', ()=>{
    setTimeout(()=>{
      const c = document.getElementById('cfg-confirmer');
      if(c && db.cfg && db.cfg.confirmer) c.value = db.cfg.confirmer;
    }, 900);
  });
})();

/* =================================================================
 * V10.0 END
 * ================================================================= */

