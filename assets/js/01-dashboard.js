/* =============================================================
 * 대시보드
 * ============================================================= */
function refreshDashboard(){
  buildIndex();
  const activeStf = db.stf.filter(s=>s.st==='active').length;
  const activeMat = db.mat.filter(m=>m.st==='active').length;
  const unmatched = db.stu.filter(s=>!IDX.matByStu[s.id] && !s.unsupported?.is).length;
  const therapy = db.stu.filter(s=>s.supportTypes?.includes('치료기관연계')).length;
  const conflicts = (window.__conflictQueue||[]).length;
  const ccEl = $('conflict-count');
  if(ccEl) ccEl.textContent = conflicts;

  $('stat-cards').innerHTML = `
    <div class="stat-card"><div class="lbl">👩‍🏫 활동 지원단</div><div class="num">${activeStf}</div><div class="lbl">/ ${db.stf.length}명</div></div>
    <div class="stat-card"><div class="lbl">🎒 등록 학생</div><div class="num">${db.stu.length}</div><div class="lbl">/ 최대 1,500명</div></div>
    <div class="stat-card"><div class="lbl">🔗 활성 매칭</div><div class="num">${activeMat}</div><div class="lbl">건</div></div>
    <div class="stat-card"><div class="lbl">⏳ 매칭 대기</div><div class="num" style="color:var(--warning)">${unmatched}</div><div class="lbl">명</div></div>
    <div class="stat-card"><div class="lbl">🏥 치료연계</div><div class="num" style="color:var(--info)">${therapy}</div><div class="lbl">명</div></div>
    <div class="stat-card"><div class="lbl">⚠️ 충돌 대기</div><div class="num" style="color:var(--danger)">${conflicts}</div><div class="lbl">건</div></div>
    <div class="stat-card"><div class="lbl">📚 연수 실시</div><div class="num">${db.trn.length}</div><div class="lbl">회</div></div>
  `;

  // 예산 카드
  renderBudgetCards();
  // 차트 렌더
  setTimeout(renderDashCharts, 50);
  // 알림
  renderAlerts(unmatched, therapy);
}

function renderAlerts(unmatched, therapy){
  const alerts = [];
  if(unmatched > 0)
    alerts.push(`<div style="padding:10px; background:#fef3c7; border-left:4px solid #f59e0b; margin-bottom:8px">⏳ 매칭 대기 학생 <b>${unmatched}명</b></div>`);
  if(therapy > 0)
    alerts.push(`<div style="padding:10px; background:#dbeafe; border-left:4px solid #3b82f6; margin-bottom:8px">🏥 치료기관 연계 학생 <b>${therapy}명</b></div>`);
  // 미검증 회기 알림
  const pendingVer = countPendingVerify();
  if(pendingVer > 0)
    alerts.push(`<div style="padding:10px; background:#fef2f2; border-left:4px solid #ef4444; margin-bottom:8px">✋ 검증 대기 실적 <b>${pendingVer}건</b> - 실적/검증 탭에서 처리 필요</div>`);
  // 예산 경고
  const bud = db.cfg.budget || {};
  const exec = calcExecuted();
  ['coach','cls','travel'].forEach(k=>{
    const b = bud[k]||0;
    if(b>0 && exec[k]/b >= 0.9){
      const nm = {coach:'학습코칭', cls:'수업협력', travel:'연수출장비'}[k];
      alerts.push(`<div style="padding:10px; background:#fef2f2; border-left:4px solid #dc2626; margin-bottom:8px">⚠️ <b>${nm}</b> 예산 ${((exec[k]/b)*100).toFixed(0)}% 소진 (${formatMoney(exec[k])}/${formatMoney(b)})</div>`);
    }
  });
  if(db.stu.length >= 1200)
    alerts.push(`<div style="padding:10px; background:#e0e7ff; border-left:4px solid #6366f1; margin-bottom:8px">📈 학생수 ${db.stu.length}명 - 1,500명 한도의 ${(db.stu.length/15).toFixed(0)}% 사용 중</div>`);
  $('alert-list').innerHTML = alerts.length ? alerts.join('') : '<div style="color:var(--muted); padding:16px; text-align:center">✅ 특이 알림 없음</div>';
}


function addSlot(containerId, data){
  const d = data || {d:'월', s:'14:00', e:'15:00'};
  const el = document.createElement('div');
  el.className = 'slot-item';
  el.innerHTML = `
    <select class="slot-d">${DAYS.map(x=>`<option ${x===d.d?'selected':''}>${x}</option>`).join('')}</select>
    <input type="time" class="slot-s" value="${d.s}">
    <span>~</span>
    <input type="time" class="slot-e" value="${d.e}">
    <button class="rm" onclick="this.parentElement.remove()">삭제</button>
  `;
  $(containerId).appendChild(el);
}

function readSlots(containerId){
  const items = $(containerId).querySelectorAll('.slot-item');
  const out = [];
  items.forEach(it=>{
    const d = it.querySelector('.slot-d').value;
    const s = it.querySelector('.slot-s').value;
    const e = it.querySelector('.slot-e').value;
    if(s && e && s < e) out.push({d, s, e});
  });
  return out;
}

function setChecks(containerId, values){
  const set = new Set(values||[]);
  $(containerId).querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.checked = set.has(cb.value);
  });
}

function readChecks(containerId){
  return Array.from($(containerId).querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
}

