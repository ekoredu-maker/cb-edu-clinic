/* =============================================================
 * 부하 테스트 (더미 데이터)
 * ============================================================= */
async function genDummy(stfCnt, stuCnt){
  if(!confirm2(`지원단 ${stfCnt}명 + 학생 ${stuCnt}명 더미 데이터를 생성합니다.\n기존 데이터는 유지되며 DUMMY_ 접두어로 구분됩니다.\n진행하시겠습니까?`)) return;
  const t0 = performance.now();
  const names = ['[NAME]'];
  const schools = ['가람초','나래초','다온초','라온초','마루초','보람초','소망초','한빛중','새봄중','우리중'];

  const dummyStf = [];
  for(let i=0; i<stfCnt; i++){
    const scd = [];
    for(let k=0; k<2+Math.floor(Math.random()*3); k++){
      scd.push({d: DAYS[Math.floor(Math.random()*5)], s:'14:00', e:String(15+Math.floor(Math.random()*3)).padStart(2,'0')+':00'});
    }
    const areas = [];
    const areaIds = AREAS.map(a=>a.id);
    for(let k=0; k<2+Math.floor(Math.random()*3); k++){
      const a = areaIds[Math.floor(Math.random()*areaIds.length)];
      if(!areas.includes(a)) areas.push(a);
    }
    dummyStf.push({
      id: 'DUMMY_s_'+uid(),
      nm: `DUMMY_${names[i%names.length]}${i}`,
      ph: `010-${String(1000+i).padStart(4,'0')}-${String(1000+i).padStart(4,'0')}`,
      bd: '1980-01-01', st:'active', ds:'더미', areas, scd, plans:[]
    });
  }
  const dummyStu = [];
  for(let i=0; i<stuCnt; i++){
    const scType = Math.random()<0.7 ? '초' : '중';
    const gr = scType==='초' ? Math.ceil(Math.random()*6) : Math.ceil(Math.random()*3);
    const scd = [];
    for(let k=0; k<1+Math.floor(Math.random()*2); k++){
      scd.push({d: DAYS[Math.floor(Math.random()*5)], s:'14:00', e:'15:00'});
    }
    const areas = [AREAS[Math.floor(Math.random()*AREAS.length)].id];
    const sts = [];
    SUPPORT_TYPES.forEach(t=>{ if(Math.random()<0.4) sts.push(t); });
    if(sts.length===0) sts.push('방과후학습코칭');
    dummyStu.push({
      id: 'DUMMY_t_'+uid(),
      nm: `DUMMY_학생${i}`,
      alias:'', gen: Math.random()<0.5?'남':'여',
      sc: schools[Math.floor(Math.random()*schools.length)],
      scType, gr, cls: 1+Math.floor(Math.random()*6),
      region: (db.cfg.regions && db.cfg.regions.length ? db.cfg.regions[Math.floor(Math.random()*db.cfg.regions.length)] : (Math.random()<0.5?'지역1':'지역2')),
      supportTypes: sts,
      areas, etcDetail:'',
      priority: 1+Math.floor(Math.random()*5),
      diagTest: {done: Math.random()<0.5, dyslexia: Math.random()<0.3, adhd: Math.random()<0.3, borderline: Math.random()<0.3, testDate:'', testInst:''},
      therapy: {inst:'', start:'', end:''},
      unsupported: {is: Math.random()<0.05, reason: Math.random()<0.05?'학부모 거부':''},
      scd
    });
  }
  db.stf.push(...dummyStf); db.stu.push(...dummyStu);
  if(storageMode==='idb'){
    await idbBulkPut('stf', dummyStf);
    await idbBulkPut('stu', dummyStu);
  } else {
    saveLS();
  }
  const elapsed = (performance.now()-t0).toFixed(0);
  toast(`더미 생성 완료: 지원단 ${stfCnt}, 학생 ${stuCnt} (${elapsed}ms)`, 'success');
  buildIndex();
  refreshDashboard();
}

async function clearDummy(){
  if(!confirm2('DUMMY_ 접두어 데이터를 모두 삭제합니다. 진행하시겠습니까?')) return;
  const dummyStfIds = db.stf.filter(s=>s.id.startsWith('DUMMY_')).map(s=>s.id);
  const dummyStuIds = db.stu.filter(s=>s.id.startsWith('DUMMY_')).map(s=>s.id);
  db.stf = db.stf.filter(s=>!s.id.startsWith('DUMMY_'));
  db.stu = db.stu.filter(s=>!s.id.startsWith('DUMMY_'));
  db.mat = db.mat.filter(m=>!dummyStfIds.includes(m.stfId) && !dummyStuIds.includes(m.stuId));
  if(storageMode==='idb'){
    for(const id of dummyStfIds) await idbDelete('stf', id);
    for(const id of dummyStuIds) await idbDelete('stu', id);
    // matching cleanup
    const allMat = await idbGetAll('mat');
    for(const m of allMat){
      if(dummyStfIds.includes(m.stfId) || dummyStuIds.includes(m.stuId)){
        await idbDelete('mat', m.id);
      }
    }
  } else {
    saveLS();
  }
  toast(`더미 삭제: 지원단 ${dummyStfIds.length}, 학생 ${dummyStuIds.length}`, 'success');
  buildIndex();
  refreshDashboard();
}

/* =============================================================
 * 설정 저장
 * ============================================================= */
async function saveCfg(){
  db.cfg.org = $('cfg-org').value;
  db.cfg.base = $('cfg-base').value;
  db.cfg.regions = $('cfg-regions').value.split(',').map(s=>s.trim()).filter(Boolean);
  db.cfg.admin = $('cfg-admin').value;
  // [V9.9] cfg-rate removed
  db.cfg.maskMode = $('cfg-mask').value;
  db.cfg.storageMode = $('cfg-storage').value;
  const newPw = $('cfg-pw').value;
  if(newPw && newPw.length>=4){
    db.cfg.pwHash = await sha256(newPw);
    $('cfg-pw').value='';
  }
  await save('meta', {id:'cfg', ...db.cfg});
  fillRegionSelects();
  $('hdr-title').textContent = `🎓 ${db.cfg.org||'학습클리닉'}`;
  toast('설정 저장 완료','success');
}

async function resetAll(){
  if(!confirm2('정말 모든 데이터를 초기화하시겠습니까? 되돌릴 수 없습니다.')) return;
  if(!confirm2('최종 확인 — 정말로 삭제하시겠습니까?')) return;
  if(storageMode==='idb'){
    for(const s of STORES) await idbClear(s);
  }
  localStorage.removeItem('jc_db_v95');
  localStorage.removeItem('jc_db_v96');
  localStorage.removeItem('jc_db_v97');
  toast('초기화 완료. 새로고침합니다','success');
  setTimeout(()=>location.reload(), 1000);
}

/* =============================================================
 * 백업 / 복원
 * ============================================================= */
function exportBackup(){
  const blob = new Blob([JSON.stringify({...db, _backup:new Date().toISOString()}, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jc-clinic-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('백업 완료','success');
}

function importBackup(e){
  const f = e.target.files[0]; if(!f) return;
  if(!confirm2('기존 데이터를 덮어씁니다. 진행하시겠습니까?')){ e.target.value=''; return; }
  const r = new FileReader();
  r.onload = async ev=>{
    try{
      const data = JSON.parse(ev.target.result);
      db = migrateSchema(data);
      await saveAll();
      toast('복원 완료. 새로고침합니다','success');
      setTimeout(()=>location.reload(), 1000);
    }catch(err){ toast('복원 실패: '+err.message,'danger'); }
  };
  r.readAsText(f);
}

/* =============================================================
 * 엑셀 양식 다운로드/업로드
 * ============================================================= */
function resolveAreaIdsFromLabels(value){
  return String(value||'').split(',').map(x=>x.trim()).filter(Boolean).map(lbl=>{
    const found = AREAS.find(a=>a.label===lbl || a.altLabel===lbl || (a.id===lbl));
    return found ? found.id : null;
  }).filter(Boolean);
}

function dlStaffTemplate(){
  if(typeof XLSX==='undefined'){ toast('엑셀 라이브러리 로딩 중','warning'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['이름','연락처','생년월일','상태','지원영역(콤마)','활동시간(예:월 14:00-16:00,수 14:00-16:00)','비고'],
    ['홍길동','[PHONE_NUMBER]','1980-01-01','active','한글미해득,기초학습지원','월 14:00-16:00,수 14:00-16:00','']
  ]);
  XLSX.utils.book_append_sheet(wb, ws, '지원단');
  XLSX.writeFile(wb, '지원단_양식.xlsx');
}

function dlStuTemplate(){
  if(typeof XLSX==='undefined'){ toast('엑셀 라이브러리 로딩 중','warning'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['이름','성별','지역','학교명','학교급(초/중)','학년','반','지원유형(콤마)','지원영역(콤마)','우선순위(1-5)','희망시간(예:월 14:00-15:00)'],
    ['학생1','남','지역1','○○초','초','3','2','방과후학습코칭','한글미해득,기초학습지원','3','월 14:00-15:00']
  ]);
  XLSX.utils.book_append_sheet(wb, ws, '학생');
  XLSX.writeFile(wb, '학생_양식.xlsx');
}

async function upStaff(e){
  const f = e.target.files[0]; if(!f) return;
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let ok=0, fail=0;
  const errors = [];
  for(const r of rows){
    try{
      if(!r.이름){ fail++; errors.push({row:r, reason:'이름 누락'}); continue; }
      if(db.stf.length >= 50){ fail++; errors.push({row:r, reason:'50명 초과'}); continue; }
      const areas = resolveAreaIdsFromLabels(r['지원영역(콤마)']||'');
      const scd = String(r['활동시간(예:월 14:00-16:00,수 14:00-16:00)']||'').split(',').map(x=>{
        const m = x.trim().match(/^(.)[\s]+(\d{1,2}:\d{2})[\s]*[-~][\s]*(\d{1,2}:\d{2})$/);
        return m ? {d:m[1], s:m[2], e:m[3]} : null;
      }).filter(Boolean);
      const s = {
        id: uid(), nm: r.이름, ph: r.연락처||'', bd: r.생년월일||'',
        st: r.상태||'active', areas, scd, ds: r.비고||'', plans:[]
      };
      db.stf.push(s); await save('stf', s); ok++;
    }catch(err){ fail++; errors.push({row:r, reason:err.message}); }
  }
  toast(`업로드 완료: 성공 ${ok}건, 실패 ${fail}건`, fail>0?'warning':'success');
  if(errors.length) console.table(errors);
  renStaff(); refreshDashboard();
  e.target.value='';
}

async function upStu(e){
  const f = e.target.files[0]; if(!f) return;
  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let ok=0, fail=0;
  const errors=[];
  for(const r of rows){
    try{
      if(!r.이름){ fail++; continue; }
      if(db.stu.length >= 1500){ fail++; errors.push({row:r, reason:'1500명 초과'}); continue; }
      const areas = resolveAreaIdsFromLabels(r['지원영역(콤마)']||'');
      const sts = String(r['지원유형(콤마)']||'방과후학습코칭').split(',').map(x=>x.trim()).filter(Boolean);
      const scdStr = r['희망시간(예:월 14:00-15:00)']||'';
      const scd = String(scdStr).split(',').map(x=>{
        const m = x.trim().match(/^(.)[\s]+(\d{1,2}:\d{2})[\s]*[-~][\s]*(\d{1,2}:\d{2})$/);
        return m ? {d:m[1], s:m[2], e:m[3]} : null;
      }).filter(Boolean);
      const s = {
        id: uid(), nm: r.이름, alias:'', gen: r.성별||'남',
        region: r.지역||'', sc: r.학교명||'',
        scType: r['학교급(초/중)']||'초',
        gr: parseInt(r.학년)||1, cls: parseInt(r.반)||1,
        supportTypes: sts, areas, etcDetail:'',
        priority: parseInt(r['우선순위(1-5)'])||3,
        diagTest:{done:false,dyslexia:false,adhd:false,borderline:false,testDate:'',testInst:''},
        therapy:{inst:'',start:'',end:''},
        unsupported:{is:false,reason:''},
        scd
      };
      db.stu.push(s); await save('stu', s); ok++;
    }catch(err){ fail++; errors.push({row:r, reason:err.message}); }
  }
  toast(`업로드 완료: 성공 ${ok}건, 실패 ${fail}건`, fail>0?'warning':'success');
  if(errors.length) console.table(errors);
  renStu(); refreshDashboard();
  e.target.value='';
}

function dlStaffList(){
  const data = [['이름','연락처','생년월일','상태','지원영역','활동시간','비고']];
  db.stf.forEach(s=>{
    data.push([s.nm, s.ph, s.bd, s.st,
      (s.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).join(','),
      (s.scd||[]).map(x=>`${x.d} ${x.s}-${x.e}`).join(','),
      s.ds||''
    ]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), '지원단');
  XLSX.writeFile(wb, `지원단_목록_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function dlStuList(){
  const data = [['이름','성별','지역','학교','학교급','학년','반','지원유형','지원영역','우선순위','희망시간']];
  db.stu.forEach(s=>{
    data.push([s.nm, s.gen, s.region, s.sc, s.scType, s.gr, s.cls,
      (s.supportTypes||[]).join(','),
      (s.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).join(','),
      s.priority||3,
      (s.scd||[]).map(x=>`${x.d} ${x.s}-${x.e}`).join(',')
    ]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), '학생');
  XLSX.writeFile(wb, `학생_목록_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* =============================================================
 * 시작
 * ============================================================= */
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadData();
  // 엔터키 로그인
  $('login-pw').addEventListener('keydown', e=>{
    if(e.key==='Enter') doLogin();
  });
  // PWA SW 등록
  if('serviceWorker' in navigator){
    if(location.protocol.startsWith('http')){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
  }
});

