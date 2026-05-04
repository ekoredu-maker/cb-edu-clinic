'use strict';

/* =============================================================
 * V9.7 - IndexedDB 기반 저장 레이어
 * ============================================================= */
const DB_NAME = 'jc_clinic_v97';
const DB_VERSION = 1;
const STORES = ['meta','stf','stu','mat','trn','log'];

let idb = null;
let storageMode = 'idb'; // 'idb' | 'ls'
let db = {
  cfg:{org:'', base:'', regions:[],
       admin:'', rate:30000, maskMode:'ooo', pwHash:null, storageMode:'auto'},
  stf:[], stu:[], mat:[], trn:[], log:[], _ver:'9.9'
};

/* IndexedDB 초기화 */
function openIDB(){
  return new Promise((resolve, reject)=>{
    if(!window.indexedDB){ reject('IndexedDB 미지원'); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e=>{
      const d = e.target.result;
      STORES.forEach(s=>{
        if(!d.objectStoreNames.contains(s)){
          d.createObjectStore(s, {keyPath:'id'});
        }
      });
    };
    req.onsuccess = e=>{ idb = e.target.result; resolve(idb); };
    req.onerror = e=>reject(e.target.error);
  });
}

function idbGetAll(store){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(store,'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = ()=>resolve(req.result||[]);
    req.onerror = ()=>reject(req.error);
  });
}

function idbPut(store, obj){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(store,'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}

function idbBulkPut(store, arr){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(store,'readwrite');
    const os = tx.objectStore(store);
    arr.forEach(o=>os.put(o));
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}

function idbDelete(store, id){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(store,'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}

function idbClear(store){
  return new Promise((resolve,reject)=>{
    const tx = idb.transaction(store,'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  });
}

/* 데이터 로드 (IndexedDB 우선, 실패시 localStorage) */
async function loadData(){
  try{
    await openIDB();
    const meta = await idbGetAll('meta');
    if(meta.length === 0){
      // 최초 실행 - localStorage 마이그레이션 시도
      const migrated = await migrateFromLocalStorage();
      if(!migrated){
        // 기본 설정 저장
        await idbPut('meta', {id:'cfg', ...db.cfg});
      }
    }
    db.stf = await idbGetAll('stf');
    db.stu = await idbGetAll('stu');
    db.mat = await idbGetAll('mat');
    db.trn = await idbGetAll('trn');
    db.log = await idbGetAll('log');
    const cfg = (await idbGetAll('meta')).find(m=>m.id==='cfg');
    if(cfg){ const {id, ...rest} = cfg; db.cfg = {...db.cfg, ...rest}; }
    storageMode = 'idb';
  }catch(e){
    console.warn('IDB 실패, LS 폴백:', e);
    loadFromLS();
    storageMode = 'ls';
  }
  updateStorageBadge();
}

function loadFromLS(){
  const raw = localStorage.getItem('jc_db_v97');
  if(raw){ try{ db = JSON.parse(raw); }catch(e){} }
}

/* localStorage → IndexedDB 마이그레이션 */
async function migrateFromLocalStorage(){
  const keys = ['jc_db_v95','jc_db_v96','jc_db_v97'];
  for(const k of keys){
    const raw = localStorage.getItem(k);
    if(raw){
      try{
        const old = JSON.parse(raw);
        const migrated = migrateSchema(old);
        db = migrated;
        await saveAll();
        toast('✅ localStorage 데이터 마이그레이션 완료','success');
        return true;
      }catch(e){ console.error('Migration fail:',e); }
    }
  }
  return false;
}

/* 스키마 마이그레이션 (V9.5/V9.6 → V9.7) */
function migrateSchema(old){
  const res = {
    cfg: {org:'', base:'', regions:[],
          admin:'', rate:30000, maskMode:'ooo', pwHash:null, storageMode:'auto', ...(old.cfg||{})},
    stf:[], stu:[], mat:[], trn:[], log:[], _ver:'9.9'
  };
  // 지원단
  (old.stf||[]).forEach(s=>{
    const ns = {
      id: String(s.id),
      nm: s.nm||'', ph: s.ph||'', bd: s.bd||'',
      st: s.st||'active', ds: s.ds||'',
      areas: s.areas || (s.ar ? [s.ar] : []),
      scd: (s.scd||[]).map(x=>{
        if(x.s && x.e) return {d:x.d, s:x.s, e:x.e};
        if(x.t){ const [s1,e1]=x.t.split('~'); return {d:x.d, s:s1||'14:00', e:e1||'15:00'}; }
        return {d:x.d||'월', s:'14:00', e:'15:00'};
      }),
      plans: s.plans||[]
    };
    res.stf.push(ns);
  });
  // 학생
  (old.stu||[]).forEach(s=>{
    const scType = s.scType || (s.sc && s.sc.includes('중') ? '중' : '초');
    const ns = {
      id: String(s.id),
      nm: s.nm||'', alias: s.alias||'', gen: s.gen||'남',
      sc: s.sc||'', scType, gr: s.gr||1, cls: s.cls||1,
      region: s.region || '',
      supportTypes: s.supportTypes || ['방과후학습코칭'],
      areas: s.areas || (s.ar ? [s.ar] : []),
      etcDetail: s.etcDetail||'',
      priority: s.priority || 3,
      diagTest: s.diagTest || {done:false, dyslexia:false, adhd:false, borderline:false, testDate:'', testInst:''},
      therapy: s.therapy || {inst:'', start:'', end:''},
      unsupported: s.unsupported || {is:false, reason:''},
      scd: (s.scd||[]).map(x=>{
        if(x.s && x.e) return {d:x.d, s:x.s, e:x.e};
        if(x.t){ const [s1,e1]=x.t.split('~'); return {d:x.d, s:s1||'14:00', e:e1||'15:00'}; }
        return {d:x.d||'월', s:'14:00', e:'15:00'};
      })
    };
    res.stu.push(ns);
  });
  // 매칭
  (old.mat||[]).forEach(m=>{
    res.mat.push({
      id: String(m.id),
      stfId: String(m.stfId||m.sid||''),
      stuId: String(m.stuId||m.tid||''),
      slots: m.slots || (m.req_day ? [{d:m.req_day, s:'14:00', e:'15:00'}] : []),
      st: m.st || 'active',
      logs: m.logs||[],
      createdAt: m.createdAt || Date.now()
    });
  });
  // 연수
  (old.trn||[]).forEach(t=>{
    res.trn.push({
      id: String(t.id),
      nm: t.nm||'', dt: t.dt||'', lect: t.lect||'',
      hr: t.hr||2, loc: t.loc||'',
      attendees: t.attendees||[], memo: t.memo||''
    });
  });
  return res;
}

/* 저장 */
async function save(store, obj){
  if(storageMode === 'idb'){
    await idbPut(store, obj);
  } else {
    saveLS();
  }
}

async function saveAll(){
  if(storageMode === 'idb'){
    await idbClear('meta'); await idbPut('meta', {id:'cfg', ...db.cfg});
    await idbClear('stf'); await idbBulkPut('stf', db.stf);
    await idbClear('stu'); await idbBulkPut('stu', db.stu);
    await idbClear('mat'); await idbBulkPut('mat', db.mat);
    await idbClear('trn'); await idbBulkPut('trn', db.trn);
    await idbClear('log'); await idbBulkPut('log', db.log);
  } else {
    saveLS();
  }
}

function saveLS(){
  try{
    localStorage.setItem('jc_db_v97', JSON.stringify(db));
  }catch(e){
    toast('❌ 저장 실패: 용량 초과. IndexedDB 전환을 시도하세요.','danger');
  }
}

async function removeItem(store, id){
  if(storageMode === 'idb'){ await idbDelete(store, id); }
  else { saveLS(); }
}

function updateStorageBadge(){
  const b = document.getElementById('storage-badge');
  if(!b) return;
  if(storageMode === 'idb'){ b.textContent='💾 IndexedDB'; b.className='badge-storage'; }
  else { b.textContent='⚠️ localStorage'; b.className='badge-storage ls'; }
}

/* =============================================================
 * 유틸
 * ============================================================= */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function toast(msg, type='info'){
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className='toast '+(type||'');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 3000);
}

function confirm2(msg){ return window.confirm(msg); }

async function sha256(str){
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* 시간 유틸 */
function toMin(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function toHHMM(min){ return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0'); }

/* 스케줄 교집합: 지원단 슬롯 × 학생 슬롯 → 겹치는 시간대 배열 */
function intersectSlots(stfScd, stuScd, minMinutes=30){
  const out = [];
  stfScd.forEach(a=>{
    stuScd.forEach(b=>{
      if(a.d !== b.d) return;
      const s = Math.max(toMin(a.s), toMin(b.s));
      const e = Math.min(toMin(a.e), toMin(b.e));
      if(e - s >= minMinutes){
        out.push({d:a.d, s:toHHMM(s), e:toHHMM(e)});
      }
    });
  });
  return out;
}

/* 시간 충돌 검사: slot이 기존 slots와 겹치는지 */
function hasConflict(slot, existingSlots){
  return existingSlots.some(x=>{
    if(x.d !== slot.d) return false;
    return toMin(x.s) < toMin(slot.e) && toMin(slot.s) < toMin(x.e);
  });
}

/* 인덱스 빌더 (성능) */
let IDX = {};
function buildIndex(){
  const t0 = performance.now();
  IDX = {
    stuById: {}, stfById: {},
    stuByRegion: {}, stuBySctype: {},
    matByStf: {}, matByStu: {},
    stfActiveSlots: {}, // stfId -> slots (with existing mat blocked out)
  };
  db.stu.forEach(s=>{
    IDX.stuById[s.id] = s;
    (IDX.stuByRegion[s.region] = IDX.stuByRegion[s.region]||[]).push(s);
    (IDX.stuBySctype[s.scType] = IDX.stuBySctype[s.scType]||[]).push(s);
  });
  db.stf.forEach(s=>{
    IDX.stfById[s.id] = s;
    IDX.stfActiveSlots[s.id] = [...(s.scd||[])];
  });
  db.mat.forEach(m=>{
    if(m.st !== 'active') return;
    (IDX.matByStf[m.stfId] = IDX.matByStf[m.stfId]||[]).push(m);
    (IDX.matByStu[m.stuId] = IDX.matByStu[m.stuId]||[]).push(m);
  });
  console.log(`[IDX] 빌드 ${(performance.now()-t0).toFixed(1)}ms, stu=${db.stu.length} stf=${db.stf.length} mat=${db.mat.length}`);
}

/* =============================================================
 * 이름 마스킹
 * ============================================================= */
function maskName(s){
  if(!s) return '';
  const mode = db.cfg.maskMode || 'full';
  if(mode === 'full') return s.nm;
  if(mode === 'ooo') return 'OOO';
  if(mode === 'partial'){
    if(!s.nm) return 'OOO';
    return s.nm.slice(0,1) + 'OO';
  }
  if(mode === 'alias') return s.alias || `학생${s.id.slice(-4)}`;
  return s.nm;
}

/* =============================================================
 * 지원영역 마스터
 * ============================================================= */
const AREAS = [
  {id:'HANGUL',  label:'한글[NAME]',    altLabel:'한글미해득',  scope:['방과후']},
  {id:'BASIC',   label:'기초학습지원',  altLabel:'기초학습지원',scope:['방과후']},
  {id:'DYSLEX',  label:'난독증',        altLabel:'난독증',      scope:['방과후','치료'], needDiag:true},
  {id:'READING', label:'읽기곤란',      altLabel:'읽기곤란',    scope:['방과후']},
  {id:'ADHD',    label:'ADHD',          altLabel:'ADHD',        scope:['방과후','치료'], needDiag:true},
  {id:'BORDER',  label:'경계선지능',    altLabel:'경계선지능',  scope:['방과후','치료'], needDiag:true},
  {id:'EMOTION', label:'심리정서',      altLabel:'심리정서',    scope:['방과후','치료']},
  {id:'LANG',    label:'언어발달지연',  altLabel:'언어',        scope:['방과후','치료']},
  {id:'ETC',     label:'기타',          altLabel:'기타',        scope:['방과후','치료'], needDetail:true}
];
const AREA_BY_ID = {}; AREAS.forEach(a=>AREA_BY_ID[a.id]=a);

const SUPPORT_TYPES = ['방과후학습코칭','수업협력코칭','심리진단','치료기관연계'];
const DAYS = ['월','화','수','목','금','토','일'];

/* =============================================================
 * 로그인
 * ============================================================= */
async function doLogin(){
  const pw = $('login-pw').value;
  if(!pw){ toast('비밀번호를 입력하세요','warning'); return; }
  let ok = false;
  if(!db.cfg.pwHash){
    // 최초 - 1111 기본
    if(pw === '1111'){
      db.cfg.pwHash = await sha256('1111');
      await save('meta', {id:'cfg', ...db.cfg});
      ok = true;
    }
  } else {
    const h = await sha256(pw);
    ok = (h === db.cfg.pwHash);
  }
  if(ok){
    $('login-overlay').style.display = 'none';
    $('app-header').style.display = 'flex';
    $('app-tabs').style.display = 'flex';
    $('app-body').style.display = 'block';
    initApp();
  } else {
    toast('비밀번호가 틀렸습니다','danger');
  }
}

function doLogout(){
  location.reload();
}

/* =============================================================
 * 탭 전환
 * ============================================================= */

/* 지역 프리셋 (충북 학습종합클리닉 거점 기준) */
function setRegionPreset(key){
  const presets = {
    '청주':'청주,청원',
    '충주':'충주',
    '제천':'제천,단양',
    '보은':'보은,옥천,영동',
    '진천':'진천,증평,괴산,음성'
  };
  $('cfg-regions').value = presets[key] || key;
  toast(`프리셋 적용: ${presets[key]}`,'info');
}

function goTab(id, btn){
  document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));
  $(id).classList.add('active');
  if(btn) btn.classList.add('active');
  // Tab-specific refresh
  if(id==='t1') refreshDashboard();
  if(id==='t2') renStaff();
  if(id==='t3') renStu();
  if(id==='t4') renMatch();
  if(id==='t5') loadValidation();
  if(id==='t6') renTrn();
  if(id==='t7') renderPivots();
  if(id==='t8'){ refreshMgrStfSelect(); fillTTSelects(); }
}

/* =============================================================
 * 초기화
 * ============================================================= */
async function initApp(){
  // 헤더 업데이트
  $('hdr-title').textContent = `🎓 ${db.cfg.org||'학습클리닉 통합관리'}`;
  $('hdr-sub').textContent = `V11.2 Stable Edition • 지원단 ${db.stf.length} · 학생 ${db.stu.length}` + (db.cfg.base?` • ${db.cfg.base}`:'');

  // 지역 select 채우기
  fillRegionSelects();
  // 지원영역 체크박스 채우기
  fillAreaCheckboxes();
  // 지원유형 체크박스
  fillSupportTypeCheckboxes();
  // 지원영역 필터
  const areaFilter = $('staff-filter-area');
  areaFilter.innerHTML = '<option value="">전체 지원영역</option>' + AREAS.map(a=>`<option value="${a.id}">${a.label}</option>`).join('');

  // 설정 값 폼 반영
  $('cfg-org').value = db.cfg.org||'';
  $('cfg-base').value = db.cfg.base||'';
  $('cfg-regions').value = (db.cfg.regions||[]).join(',');
  $('cfg-admin').value = db.cfg.admin||'';
  // [V9.9] cfg-rate removed, confirmer handled by V9.9 module
  $('cfg-mask').value = db.cfg.maskMode||'ooo';
  $('cfg-storage').value = db.cfg.storageMode||'auto';

  // 월 기본값
  const now = new Date();
  $('ver-month').value = now.toISOString().slice(0,7);
  $('stat-date').value = now.toISOString().slice(0,10);

  // 엔터키 로그인 이미 처리됨

  buildIndex();
  refreshDashboard();

  // V9.5 localStorage 정리
  ['jc_db_v95','jc_db_v96'].forEach(k=>{
    if(localStorage.getItem(k)){
      console.log(`[cleanup] ${k} 정리 대상 (백업 후 삭제)`);
    }
  });
}

function fillRegionSelects(){
  const regions = (db.cfg.regions && db.cfg.regions.length ? db.cfg.regions : ['지역1','지역2']);
  const opts = regions.map(r=>`<option value="${r}">${r}</option>`).join('');
  $('st-region').innerHTML = opts;
  const filt = $('stu-filter-region');
  filt.innerHTML = '<option value="">전체 지역</option>' + opts;
}

function fillAreaCheckboxes(){
  const html = AREAS.map(a=>`<label><input type="checkbox" value="${a.id}"> ${a.label}</label>`).join('');
  $('sf-areas').innerHTML = html;
  $('st-areas').innerHTML = html;
  // ETC 감지
  $('st-areas').addEventListener('change', ()=>{
    const etc = $('st-areas').querySelector('input[value="ETC"]:checked');
    $('st-etc-wrap').style.display = etc ? 'block' : 'none';
  });
}

function fillSupportTypeCheckboxes(){
  $('st-stypes').innerHTML = SUPPORT_TYPES.map(t=>`<label><input type="checkbox" value="${t}"> ${t}</label>`).join('');
}

