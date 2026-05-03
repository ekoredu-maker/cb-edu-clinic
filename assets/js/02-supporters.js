/* =============================================================
 * 지원단 CRUD + 가상스크롤
 * ============================================================= */
let editingStaffId = null;

function openStaffModal(id){
  editingStaffId = id || null;
  $('staff-modal-title').textContent = id ? '지원단 수정' : '지원단 등록';
  $('sf-nm').value = ''; $('sf-ph').value=''; $('sf-bd').value='';
  $('sf-st').value='active'; $('sf-ds').value='';
  $('sf-slots').innerHTML = '';
  setChecks('sf-areas', []);
  if(id){
    const s = db.stf.find(x=>x.id===id);
    if(s){
      $('sf-nm').value=s.nm; $('sf-ph').value=s.ph; $('sf-bd').value=s.bd;
      $('sf-st').value=s.st; $('sf-ds').value=s.ds||'';
      setChecks('sf-areas', s.areas||[]);
      (s.scd||[]).forEach(slot=>addSlot('sf-slots', slot));
    }
  }
  if($('sf-slots').children.length===0) addSlot('sf-slots');
  $('modal-staff').classList.add('show');
}

async function saveStaff(){
  const nm = $('sf-nm').value.trim();
  if(!nm){ toast('이름은 필수','warning'); return; }
  if(db.stf.length >= 50 && !editingStaffId){
    toast('지원단은 최대 50명까지 등록 가능합니다','danger'); return;
  }
  const s = {
    id: editingStaffId || uid(),
    nm, ph: $('sf-ph').value, bd: $('sf-bd').value,
    st: $('sf-st').value, ds: $('sf-ds').value,
    areas: readChecks('sf-areas'),
    scd: readSlots('sf-slots'),
    plans: editingStaffId ? (db.stf.find(x=>x.id===editingStaffId)?.plans||[]) : []
  };
  if(editingStaffId){
    const idx = db.stf.findIndex(x=>x.id===editingStaffId);
    db.stf[idx] = s;
  } else {
    db.stf.push(s);
  }
  await save('stf', s);
  closeModal('modal-staff');
  toast('저장되었습니다','success');
  renStaff();
  refreshDashboard();
}

async function delStaff(id){
  if(!confirm2('지원단을 삭제하시겠습니까?\n관련 매칭도 함께 정리됩니다.')) return;
  db.stf = db.stf.filter(x=>x.id!==id);
  // Cascade
  const cascadeMat = db.mat.filter(m=>m.stfId===id);
  db.mat = db.mat.filter(m=>m.stfId!==id);
  await removeItem('stf', id);
  for(const m of cascadeMat) await removeItem('mat', m.id);
  toast(`삭제 완료 (관련 매칭 ${cascadeMat.length}건 정리)`,'success');
  renStaff();
  refreshDashboard();
}

/* 가상 스크롤 렌더러 */
const ROW_HEIGHT = 52;
const VIEWPORT_BUFFER = 5;

function renVirtualList(wrapId, innerId, items, rowRenderer){
  const wrap = $(wrapId);
  const inner = $(innerId);
  const total = items.length;
  inner.style.height = (total * ROW_HEIGHT) + 'px';

  function render(){
    const scrollTop = wrap.scrollTop;
    const viewHeight = wrap.clientHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIEWPORT_BUFFER);
    const endIdx = Math.min(total, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + VIEWPORT_BUFFER);
    const rows = [];
    for(let i=startIdx; i<endIdx; i++){
      rows.push(`<div style="position:absolute; top:${i*ROW_HEIGHT}px; left:0; right:0; height:${ROW_HEIGHT}px; padding:0 12px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center">${rowRenderer(items[i], i)}</div>`);
    }
    inner.innerHTML = rows.join('');
  }

  render();
  if(!wrap.__scrollHandler){
    wrap.addEventListener('scroll', ()=>{
      if(wrap.__rafPending) return;
      wrap.__rafPending = true;
      requestAnimationFrame(()=>{ wrap.__rafPending=false; render(); });
    });
    wrap.__scrollHandler = true;
  }
}

function renStaff(){
  const q = ($('staff-search').value||'').toLowerCase();
  const fArea = $('staff-filter-area').value;
  let list = db.stf.slice().sort((a,b)=>a.nm.localeCompare(b.nm));
  if(q) list = list.filter(s=>s.nm.toLowerCase().includes(q) || (s.ph||'').includes(q));
  if(fArea) list = list.filter(s=>(s.areas||[]).includes(fArea));

  renVirtualList('staff-vscroll','staff-inner', list, (s)=>{
    const scdTxt = (s.scd||[]).slice(0,3).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ') + (s.scd?.length>3?` 외 ${s.scd.length-3}`:'');
    const areasTxt = (s.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).join(', ');
    const stColor = s.st==='active'?'bg-yes':(s.st==='pause'?'bg-no':'bg-danger');
    const stTxt = s.st==='active'?'활동중':(s.st==='pause'?'휴식':'종료');
    return `
      <div style="flex:0 0 150px"><b class="name-edit" onclick="openStaffModal('${s.id}')" title="클릭하여 수정">${s.nm}</b> <span class="badge ${stColor}">${stTxt}</span></div>
      <div style="flex:0 0 120px; font-size:12px; color:var(--muted)">${s.ph||'-'}</div>
      <div style="flex:1; font-size:12px">${areasTxt||'-'}</div>
      <div style="flex:1; font-size:12px; color:var(--muted)">${scdTxt||'-'}</div>
      <div style="flex:0 0 140px; text-align:right">
        <button class="btn btn-xs btn-outline" onclick="openStaffModal('${s.id}')">수정</button>
        <button class="btn btn-xs btn-danger" onclick="delStaff('${s.id}')">삭제</button>
      </div>
    `;
  });
  $('staff-count').textContent = `총 ${list.length}명 표시${list.length!==db.stf.length?` (전체 ${db.stf.length}명)`:''}`;
}

