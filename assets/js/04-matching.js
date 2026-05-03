/* =============================================================
 * 매칭 엔진 (시간교집합 + 충돌 큐)
 * ============================================================= */
window.__conflictQueue = window.__conflictQueue || [];

async function autoMatch(){
  const t0 = performance.now();
  buildIndex();
  let matched = 0, conflicts = 0, skipped = 0;
  window.__conflictQueue = [];

  // 학생을 우선순위 순으로 정렬
  const students = db.stu.slice()
    .filter(s=>!s.unsupported?.is && (s.scd||[]).length>0)
    .sort((a,b)=>(a.priority||3)-(b.priority||3));

  for(const stu of students){
    // 이미 매칭된 학생은 건너뛰기 (1:N 허용이므로 영역별로 체크)
    const existingForStu = IDX.matByStu[stu.id] || [];
    const coveredAreas = new Set();
    existingForStu.forEach(m=>{
      const stf = IDX.stfById[m.stfId];
      if(stf) (stf.areas||[]).forEach(a=>coveredAreas.add(a));
    });

    const needAreas = (stu.areas||[]).filter(a=>!coveredAreas.has(a));
    if(needAreas.length === 0) continue; // 이미 모든 영역 매칭됨

    // 후보 지원단: 필요 영역 중 하나라도 담당 가능한 활동중 지원단
    const candidates = db.stf.filter(stf=>{
      if(stf.st !== 'active') return false;
      return (stf.areas||[]).some(a=>needAreas.includes(a));
    });

    if(candidates.length === 0){ skipped++; continue; }

    // 각 후보에 대해 점수 계산
    const scored = candidates.map(stf=>{
      const overlap = intersectSlots(stf.scd||[], stu.scd||[]);
      if(overlap.length === 0) return {stf, score:-1, slots:[]};
      // 기존 매칭 시간과 충돌 검사
      const usedSlots = (IDX.matByStf[stf.id]||[]).flatMap(m=>m.slots||[]);
      const validSlots = overlap.filter(slot=>!hasConflict(slot, usedSlots));
      if(validSlots.length === 0) return {stf, score:-1, slots:[], conflict:true};
      const areaMatch = (stf.areas||[]).filter(a=>needAreas.includes(a)).length;
      const load = (IDX.matByStf[stf.id]||[]).length;
      const score = validSlots.length * 10 + areaMatch * 5 - load * 2 + (6-(stu.priority||3));
      return {stf, score, slots:validSlots.slice(0,1), conflict:false};
    }).filter(x=>x.score >= 0).sort((a,b)=>b.score-a.score);

    if(scored.length === 0){
      // 충돌 큐에 추가 (교집합은 있으나 이미 점유됨)
      const conflictCand = candidates.find(stf=>{
        const ov = intersectSlots(stf.scd||[], stu.scd||[]);
        return ov.length > 0;
      });
      if(conflictCand){
        window.__conflictQueue.push({
          stuId: stu.id, stfId: conflictCand.id,
          reason: '시간충돌: 교집합은 있으나 이미 다른 학생에게 배정됨'
        });
        conflicts++;
      } else {
        skipped++;
      }
      continue;
    }

    const best = scored[0];
    const newMat = {
      id: uid(), stfId: best.stf.id, stuId: stu.id,
      slots: best.slots, st:'active', logs:[], createdAt: Date.now()
    };
    db.mat.push(newMat);
    await save('mat', newMat);
    matched++;

    // 인덱스 즉시 업데이트
    (IDX.matByStf[best.stf.id] = IDX.matByStf[best.stf.id]||[]).push(newMat);
    (IDX.matByStu[stu.id] = IDX.matByStu[stu.id]||[]).push(newMat);
  }

  const elapsed = (performance.now()-t0).toFixed(0);
  toast(`매칭 완료: ${matched}건 성공, ${conflicts}건 충돌, ${skipped}건 스킵 (${elapsed}ms)`,'success');
  renMatch();
  refreshDashboard();
}

function renMatch(){
  buildIndex();
  const unmatched = db.stu.filter(s=>!IDX.matByStu[s.id] && !s.unsupported?.is && (s.scd||[]).length>0);
  const matched = db.mat.filter(m=>m.st==='active');
  const activeStf = db.stf.filter(s=>s.st==='active');

  $('cnt-wait').textContent = unmatched.length;
  $('cnt-mat').textContent = matched.length;
  $('cnt-stf').textContent = activeStf.length;
  $('conflict-count').textContent = (window.__conflictQueue||[]).length;

  // 대기 학생 카드 (최대 50개 표시)
  $('dd-wait').innerHTML = unmatched.slice(0,50).map(s=>{
    const areas = (s.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).join(',');
    return `<div class="dd-card" onclick="openManualMatch('${s.id}')">
      <b>${s.nm}</b> <span class="badge bg-purple">${s.scType}${s.gr}</span>
      <div style="font-size:11px; color:var(--muted); margin-top:2px">${s.sc} · ${areas}</div>
      <div style="font-size:11px; color:var(--muted)">${(s.scd||[]).slice(0,2).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ')}</div>
    </div>`;
  }).join('') + (unmatched.length>50?`<div style="text-align:center; color:var(--muted); padding:8px">+ ${unmatched.length-50}명 더...</div>`:'');

  // 매칭 카드 (최대 50개)
  $('dd-mat').innerHTML = matched.slice(0,50).map(m=>{
    const stu = IDX.stuById[m.stuId]; const stf = IDX.stfById[m.stfId];
    if(!stu || !stf) return '';
    const slotTxt = (m.slots||[]).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ');
    return `<div class="dd-card">
      <b>${stf.nm}</b> → <b>${stu.nm}</b>
      <div style="font-size:11px; color:var(--muted)">${slotTxt}</div>
      <button class="btn btn-xs btn-danger" onclick="unmatch('${m.id}')" style="margin-top:4px">해제</button>
    </div>`;
  }).join('') + (matched.length>50?`<div style="text-align:center; color:var(--muted); padding:8px">+ ${matched.length-50}건 더...</div>`:'');

  // 활동 지원단
  $('dd-stf').innerHTML = activeStf.slice(0,50).map(s=>{
    const load = (IDX.matByStf[s.id]||[]).length;
    return `<div class="dd-card">
      <b>${s.nm}</b> <span class="badge ${load>0?'bg-yes':'bg-no'}">${load}건</span>
      <div style="font-size:11px; color:var(--muted)">${(s.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).slice(0,2).join(',')}</div>
    </div>`;
  }).join('');
}

async function unmatch(mid){
  if(!confirm2('매칭을 해제하시겠습니까?')) return;
  db.mat = db.mat.filter(m=>m.id!==mid);
  await removeItem('mat', mid);
  toast('해제되었습니다','success');
  renMatch();
  refreshDashboard();
}

function openManualMatch(stuId){
  const stu = db.stu.find(s=>s.id===stuId);
  if(!stu) return;
  buildIndex();
  const needAreas = stu.areas||[];
  const candidates = db.stf.filter(stf=>{
    if(stf.st!=='active') return false;
    return (stf.areas||[]).some(a=>needAreas.includes(a));
  }).map(stf=>{
    const overlap = intersectSlots(stf.scd||[], stu.scd||[]);
    const used = (IDX.matByStf[stf.id]||[]).flatMap(m=>m.slots||[]);
    const validSlots = overlap.filter(s=>!hasConflict(s, used));
    return {stf, overlap, validSlots};
  }).filter(x=>x.overlap.length>0);

  const html = `
    <div style="padding:12px">
      <div style="margin-bottom:12px"><b>${stu.nm}</b> (${stu.sc} ${stu.scType}${stu.gr}-${stu.cls})</div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px">희망 영역: ${needAreas.map(a=>AREA_BY_ID[a]?.label).join(', ')}</div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:12px">희망 시간: ${(stu.scd||[]).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ')}</div>
      <h4>매칭 가능 지원단</h4>
      ${candidates.length===0 ? '<div style="color:var(--muted); padding:20px">시간 교집합이 있는 지원단이 없습니다</div>' : candidates.map(c=>{
        const slotTxt = c.validSlots.length>0 
          ? c.validSlots.map(x=>`${x.d} ${x.s}~${x.e}`).join(', ')
          : `<span style="color:var(--danger)">전부 점유됨</span>`;
        return `<div style="padding:10px; background:#f8fafc; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center">
          <div>
            <b>${c.stf.nm}</b> <span class="badge bg-info">${(c.stf.areas||[]).map(a=>AREA_BY_ID[a]?.label).join(',')}</span>
            <div style="font-size:12px; color:var(--muted); margin-top:4px">${slotTxt}</div>
          </div>
          <button class="btn btn-sm btn-primary" ${c.validSlots.length===0?'disabled':''} onclick="doManualMatch('${stu.id}','${c.stf.id}')">배정</button>
        </div>`;
      }).join('')}
    </div>
  `;
  const m = document.createElement('div');
  m.className='modal-bg show';
  m.innerHTML = `<div class="modal" style="max-width:700px">
    <div class="modal-header">
      <div class="modal-title">🔗 수동 매칭 - ${stu.nm}</div>
      <button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button>
    </div>
    ${html}
  </div>`;
  document.body.appendChild(m);
  window.__manualMatchModal = m;
}

async function doManualMatch(stuId, stfId){
  buildIndex();
  const stu = IDX.stuById[stuId]; const stf = IDX.stfById[stfId];
  const overlap = intersectSlots(stf.scd||[], stu.scd||[]);
  const used = (IDX.matByStf[stfId]||[]).flatMap(m=>m.slots||[]);
  const valid = overlap.filter(s=>!hasConflict(s,used));
  if(valid.length===0){ toast('배정 가능한 슬롯이 없습니다','danger'); return; }
  const newMat = {
    id: uid(), stfId, stuId, slots:valid.slice(0,1),
    st:'active', logs:[], createdAt:Date.now()
  };
  db.mat.push(newMat);
  await save('mat', newMat);
  toast('매칭되었습니다','success');
  if(window.__manualMatchModal) window.__manualMatchModal.remove();
  renMatch(); refreshDashboard();
}

function openConflictQueue(){
  const q = window.__conflictQueue||[];
  if(q.length===0){ toast('충돌 대기 항목이 없습니다','info'); return; }
  buildIndex();

  const rows = q.map((c,i)=>{
    const stu = db.stu.find(s=>s.id===c.stuId);
    if(!stu) return '';

    // 후보 지원단 리스트 (학생 영역 담당 가능한 활동중)
    const needAreas = stu.areas||[];
    const cands = db.stf.filter(stf=>{
      if(stf.st!=='active') return false;
      return (stf.areas||[]).some(a=>needAreas.includes(a));
    }).map(stf=>{
      const overlap = intersectSlots(stf.scd||[], stu.scd||[]);
      const used = (IDX.matByStf[stf.id]||[]).flatMap(m=>m.slots||[]);
      const valid = overlap.filter(x=>!hasConflict(x,used));
      return {stf, overlap, valid};
    });
    // 수동 재배정 가능한 후보 (교집합 있고, 사용 가능 슬롯이 있거나, 학생 시간으로 연계 가능)
    const opts = cands.map(c=>{
      const slotCount = c.valid.length;
      const ovCount = c.overlap.length;
      let lbl = `${c.stf.nm}`;
      if(slotCount>0) lbl += ` · ✅가용 ${slotCount}슬롯`;
      else if(ovCount>0) lbl += ` · ⚠️점유됨 (학생시간으로 강제연계 가능)`;
      else lbl += ` · ❌교집합 없음`;
      return `<option value="${c.stf.id}">${lbl}</option>`;
    }).join('');

    const areas = needAreas.map(a=>AREA_BY_ID[a]?.label||a).join(', ');
    const times = (stu.scd||[]).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ');
    return `<div style="padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; margin-bottom:8px">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap">
        <div>
          <b>${stu.nm}</b>
          <span style="font-size:12px; color:#6b7280"> (${stu.sc||''} ${stu.scType||''}${stu.gr||''}-${stu.cls||''})</span>
          <div style="font-size:11px; color:#b91c1c; margin-top:4px">⚠️ ${c.reason}</div>
          <div style="font-size:11px; color:#6b7280; margin-top:2px">영역: ${areas}</div>
          <div style="font-size:11px; color:#6b7280">희망시간: ${times||'-'}</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">
          <select id="conf-sel-${i}" style="padding:6px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; min-width:220px">
            <option value="">-- 지원단 선택 --</option>${opts}
          </select>
          <label style="font-size:11px; display:flex; align-items:center; gap:3px">
            <input type="checkbox" id="conf-force-${i}"> 학생시간 강제
          </label>
          <button class="btn btn-xs btn-primary" onclick="resolveConflict(${i})">배정</button>
          <button class="btn btn-xs btn-outline" onclick="openManualMatch('${stu.id}'); closeModal('modal-conflict')">상세 수동</button>
          <button class="btn btn-xs btn-danger" onclick="dismissConflict(${i})">제외</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $('conflict-list').innerHTML = `
    <div style="font-size:12px; color:var(--muted); margin-bottom:12px; padding:10px; background:#f0f9ff; border-radius:8px">
      💡 드롭다운에서 지원단 선택 → 배정. 해당 지원단 시간이 겹치면 <b>"학생시간 강제"</b>를 체크해 학생 희망시간으로 강제 연계됩니다.
    </div>
    ${rows}`;
  $('modal-conflict').classList.add('show');
}

async function resolveConflict(idx){
  const q = window.__conflictQueue || [];
  const c = q[idx];
  if(!c) return;
  const stfId = $('conf-sel-'+idx).value;
  if(!stfId){ toast('지원단을 선택하세요','warning'); return; }
  const force = $('conf-force-'+idx).checked;

  buildIndex();
  const stu = IDX.stuById[c.stuId];
  const stf = IDX.stfById[stfId];
  if(!stu || !stf){ toast('데이터 오류','danger'); return; }

  const overlap = intersectSlots(stf.scd||[], stu.scd||[]);
  const used = (IDX.matByStf[stfId]||[]).flatMap(m=>m.slots||[]);
  const valid = overlap.filter(s=>!hasConflict(s,used));

  let assignSlots = [];
  if(valid.length>0){
    assignSlots = [valid[0]];
  } else if(force && (stu.scd||[]).length>0){
    // 학생 희망시간 기반 강제 배정
    assignSlots = [stu.scd[0]];
    toast('⚠️ 학생 시간으로 강제 연계했습니다. 지원단 스케줄 확인 필요','warning');
  } else {
    toast('배정 가능한 슬롯이 없습니다. "학생시간 강제"를 체크하세요','danger');
    return;
  }

  const newMat = {
    id: uid(), stfId, stuId: stu.id, slots:assignSlots,
    st:'active', logs:[], kind:'coach', createdAt:Date.now()
  };
  db.mat.push(newMat);
  await save('mat', newMat);
  q.splice(idx, 1);
  toast('배정 완료','success');
  openConflictQueue();
  renMatch();
  refreshDashboard();
}


function dismissConflict(idx){
  window.__conflictQueue.splice(idx,1);
  openConflictQueue();
  refreshDashboard();
}

