/* =============================================================
 * 학생 CRUD + 가상스크롤
 * ============================================================= */
let editingStuId = null;

function openStuModal(id){
  editingStuId = id || null;
  $('stu-modal-title').textContent = id ? '학생 수정' : '학생 등록';
  const fields = ['st-nm','st-alias','st-sc','st-gr','st-cls','st-etc-detail','st-diag-date','st-diag-inst','st-therapy-inst','st-therapy-start','st-therapy-end','st-unsup-reason'];
  fields.forEach(f=>{ const el=$(f); if(el) el.value=''; });
  $('st-gen').value='남'; $('st-sctype').value='초'; $('st-pri').value='3';
  ['st-diag-done','st-diag-dys','st-diag-adhd','st-diag-border','st-unsup-is'].forEach(f=>$(f).checked=false);
  $('st-slots').innerHTML='';
  setChecks('st-stypes',['방과후학습코칭']);
  setChecks('st-areas',[]);
  $('st-etc-wrap').style.display='none';
  if(id){
    const s = db.stu.find(x=>x.id===id);
    if(s){
      $('st-nm').value=s.nm; $('st-alias').value=s.alias||''; $('st-gen').value=s.gen;
      $('st-sc').value=s.sc; $('st-sctype').value=s.scType; $('st-gr').value=s.gr; $('st-cls').value=s.cls;
      $('st-region').value=s.region; $('st-pri').value=s.priority||3;
      setChecks('st-stypes', s.supportTypes||[]);
      setChecks('st-areas', s.areas||[]);
      if((s.areas||[]).includes('ETC')){ $('st-etc-wrap').style.display='block'; $('st-etc-detail').value=s.etcDetail||''; }
      const dt = s.diagTest||{};
      $('st-diag-done').checked = !!dt.done;
      $('st-diag-dys').checked = !!dt.dyslexia;
      $('st-diag-adhd').checked = !!dt.adhd;
      $('st-diag-border').checked = !!dt.borderline;
      $('st-diag-date').value = dt.testDate||'';
      $('st-diag-inst').value = dt.testInst||'';
      const th = s.therapy||{};
      $('st-therapy-inst').value = th.inst||'';
      $('st-therapy-start').value = th.start||'';
      $('st-therapy-end').value = th.end||'';
      const un = s.unsupported||{};
      $('st-unsup-is').checked = !!un.is;
      $('st-unsup-reason').value = un.reason||'';
      (s.scd||[]).forEach(slot=>addSlot('st-slots', slot));
    }
  }
  if($('st-slots').children.length===0) addSlot('st-slots');
  $('modal-stu').classList.add('show');
}

async function saveStu(){
  const nm = $('st-nm').value.trim();
  if(!nm){ toast('이름은 필수','warning'); return; }
  if(db.stu.length >= 1500 && !editingStuId){
    toast('학생은 최대 1,500명까지 등록 가능합니다','danger'); return;
  }
  const areas = readChecks('st-areas');
  const supportTypes = readChecks('st-stypes');
  const diagDone = $('st-diag-done').checked;
  const diagDys = $('st-diag-dys').checked;
  const diagADHD = $('st-diag-adhd').checked;
  const diagBorder = $('st-diag-border').checked;

  // 검증
  if(areas.includes('ETC') && !$('st-etc-detail').value.trim()){
    toast('기타 선택 시 상세내용이 필수입니다','warning'); return;
  }
  const needDiagAreas = areas.filter(a=>AREA_BY_ID[a]?.needDiag);
  if(needDiagAreas.length > 0){
    if(!diagDone){
      toast(`${needDiagAreas.map(a=>AREA_BY_ID[a].label).join('/')} 영역은 진단검사 실시가 필요합니다`,'warning'); return;
    }
  }
  if($('st-unsup-is').checked && !$('st-unsup-reason').value.trim()){
    toast('미지원 시 사유는 필수입니다','warning'); return;
  }

  const s = {
    id: editingStuId || uid(),
    nm, alias: $('st-alias').value||'',
    gen: $('st-gen').value, sc: $('st-sc').value, scType: $('st-sctype').value,
    gr: parseInt($('st-gr').value)||1, cls: parseInt($('st-cls').value)||1,
    region: $('st-region').value,
    supportTypes, areas,
    etcDetail: $('st-etc-detail').value||'',
    priority: parseInt($('st-pri').value)||3,
    diagTest: {
      done: diagDone, dyslexia: diagDys, adhd: diagADHD, borderline: diagBorder,
      testDate: $('st-diag-date').value, testInst: $('st-diag-inst').value
    },
    therapy: {
      inst: $('st-therapy-inst').value, start: $('st-therapy-start').value, end: $('st-therapy-end').value
    },
    unsupported: { is: $('st-unsup-is').checked, reason: $('st-unsup-reason').value||'' },
    scd: readSlots('st-slots')
  };
  if(editingStuId){
    const idx = db.stu.findIndex(x=>x.id===editingStuId);
    db.stu[idx] = s;
  } else {
    db.stu.push(s);
  }
  await save('stu', s);
  closeModal('modal-stu');
  toast('저장되었습니다','success');
  renStu();
  refreshDashboard();
}

async function delStu(id){
  if(!confirm2('학생을 삭제하시겠습니까? 관련 매칭도 정리됩니다.')) return;
  db.stu = db.stu.filter(x=>x.id!==id);
  const cascadeMat = db.mat.filter(m=>m.stuId===id);
  db.mat = db.mat.filter(m=>m.stuId!==id);
  await removeItem('stu', id);
  for(const m of cascadeMat) await removeItem('mat', m.id);
  toast(`삭제 완료 (관련 매칭 ${cascadeMat.length}건 정리)`,'success');
  renStu();
  refreshDashboard();
}

function renStu(){
  const q = ($('stu-search').value||'').toLowerCase();
  const fReg = $('stu-filter-region').value;
  const fSctype = $('stu-filter-sctype').value;
  const fSup = $('stu-filter-support').value;
  let list = db.stu.slice().sort((a,b)=>a.nm.localeCompare(b.nm));
  if(q) list = list.filter(s=>s.nm.toLowerCase().includes(q) || (s.sc||'').toLowerCase().includes(q));
  if(fReg) list = list.filter(s=>s.region===fReg);
  if(fSctype) list = list.filter(s=>s.scType===fSctype);
  if(fSup) list = list.filter(s=>(s.supportTypes||[]).includes(fSup));

  renVirtualList('stu-vscroll','stu-inner', list, (s)=>{
    const stypesTxt = (s.supportTypes||[]).join(',');
    const areasTxt = (s.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).slice(0,2).join(', ');
    const matCount = (IDX.matByStu?.[s.id]||[]).length;
    const matBadge = matCount>0 ? `<span class="badge bg-yes">매칭 ${matCount}</span>` : (s.unsupported?.is ? '<span class="badge bg-danger">미지원</span>' : '<span class="badge bg-no">대기</span>');
    return `
      <div style="flex:0 0 100px"><b class="name-edit" onclick="openStuModal('${s.id}')" title="클릭하여 수정">${s.nm}</b> ${matBadge}</div>
      <div style="flex:0 0 140px; font-size:12px">${s.sc} ${s.scType}${s.gr}-${s.cls}</div>
      <div style="flex:0 0 60px; font-size:12px">${s.region}</div>
      <div style="flex:1; font-size:12px">${stypesTxt}</div>
      <div style="flex:1; font-size:12px; color:var(--muted)">${areasTxt}</div>
      <div style="flex:0 0 140px; text-align:right">
        <button class="btn btn-xs btn-outline" onclick="openStuModal('${s.id}')">수정</button>
        <button class="btn btn-xs btn-danger" onclick="delStu('${s.id}')">삭제</button>
      </div>
    `;
  });
  $('stu-count').textContent = `총 ${list.length}명 표시${list.length!==db.stu.length?` (전체 ${db.stu.length}명)`:''}`;
}

function closeModal(id){ $(id).classList.remove('show'); }

