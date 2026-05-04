
/* ===== 00-core.js ===== */
'use strict';

/* V12 Phase 1 consolidated bundle */

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
let __idxDirty = true;
let __idxSig = '';
function markIndexDirty(){ __idxDirty = true; }

async function save(store, obj){
  markIndexDirty();
  if(storageMode === 'idb'){
    await idbPut(store, obj);
  } else {
    saveLS();
  }
}

async function saveAll(){
  markIndexDirty();
  if(storageMode === 'idb'){
    await idbPut('meta', {id:'cfg', ...db.cfg});
    const syncStore = async (store, current) => {
      const existing = await idbGetAll(store);
      const currentIds = new Set((current||[]).map(x => String(x.id)));
      for(const row of (current||[])) await idbPut(store, row);
      for(const row of existing){
        if(!currentIds.has(String(row.id))) await idbDelete(store, row.id);
      }
    };
    await syncStore('stf', db.stf);
    await syncStore('stu', db.stu);
    await syncStore('mat', db.mat);
    await syncStore('trn', db.trn);
    if(db.log) await syncStore('log', db.log);
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
  markIndexDirty();
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
  if (window.crypto && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  // Fallback for environments where SubtleCrypto is unavailable
  const bytes = Array.from(enc.encode(str));
  const rightRotate = (v, a) => (v >>> a) | (v << (32 - a));
  const maxWord = Math.pow(2, 32);
  const words = [];
  const bitLen = bytes.length * 8;
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << (((3 - i) % 4) * 8);
  words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;
  const hash = [], k = [];
  let primeCounter = 0;
  const isPrime = n => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };
  const fracBits = x => ((x - (x | 0)) * maxWord) | 0;
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isPrime(candidate)) continue;
    if (primeCounter < 8) hash[primeCounter] = fracBits(Math.pow(candidate, 1 / 2));
    k[primeCounter++] = fracBits(Math.pow(candidate, 1 / 3));
  }
  const w = new Array(64);
  for (let j = 0; j < words.length; j += 16) {
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      w[i] = i < 16 ? (words[j + i] | 0) :
        (((rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] +
          (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)) + w[i - 16]) | 0);
      const a = hash[0], e = hash[4];
      const temp1 = (hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) + k[i] + w[i]) | 0;
      const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
      hash.pop();
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  return hash.map(v => ('00000000' + (v >>> 0).toString(16)).slice(-8)).join('');
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
function buildIndex(force=false){
  const sig = `${db.stu.length}|${db.stf.length}|${db.mat.length}|${(db.mat||[]).reduce((s,m)=>s+((m.logs||[]).length),0)}`;
  if(!force && !__idxDirty && __idxSig === sig && IDX.stuById) return IDX;
  const t0 = performance.now();
  IDX = {
    stuById: {}, stfById: {},
    stuByRegion: {}, stuBySctype: {},
    matByStf: {}, matByStu: {},
    stfActiveSlots: {},
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
  __idxDirty = false;
  __idxSig = sig;
  console.log(`[IDX] 빌드 ${(performance.now()-t0).toFixed(1)}ms, stu=${db.stu.length} stf=${db.stf.length} mat=${db.mat.length}`);
  return IDX;
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

async function resetLoginPassword(){
  if(!confirm2('비밀번호를 초기값 1111로 재설정합니다. 기존 업무 데이터는 삭제되지 않습니다. 진행하시겠습니까?')) return;
  try{
    db.cfg.pwHash = await sha256('1111');
    await save('meta', {id:'cfg', ...db.cfg});
    const pwEl = $('login-pw');
    if(pwEl) pwEl.value = '';
    toast('비밀번호가 1111로 초기화되었습니다. 다시 로그인하세요.','success');
  }catch(e){
    console.error(e);
    toast('비밀번호 초기화 중 오류가 발생했습니다. 브라우저 저장소를 확인하세요.','danger');
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
  $('hdr-sub').textContent = `V12.3.2 Statistics & Print Fix Edition • 지원단 ${db.stf.length} · 학생 ${db.stu.length}` + (db.cfg.base?` • ${db.cfg.base}`:'');

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


/* ===== 01-dashboard.js ===== */
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


/* ===== 02-supporters.js ===== */
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


/* ===== 03-students.js ===== */
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


/* ===== 04-matching.js ===== */
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


/* ===== 05-training.js ===== */
/* =============================================================
 * 연수 관리
 * ============================================================= */
let editingTrnId = null;

function openTrnModal(id){
  editingTrnId = id||null;
  $('tr-nm').value=''; $('tr-dt').value=''; $('tr-lect').value='';
  $('tr-hr').value=2; $('tr-loc').value=''; $('tr-memo').value='';
  $('tr-attendees').innerHTML = db.stf.filter(s=>s.st==='active').map(s=>
    `<label><input type="checkbox" value="${s.id}"> ${s.nm}</label>`
  ).join('');
  if(id){
    const t = db.trn.find(x=>x.id===id);
    if(t){
      $('tr-nm').value=t.nm; $('tr-dt').value=t.dt; $('tr-lect').value=t.lect||'';
      $('tr-hr').value=t.hr; $('tr-loc').value=t.loc||''; $('tr-memo').value=t.memo||'';
      setChecks('tr-attendees', t.attendees||[]);
    }
  }
  $('modal-trn').classList.add('show');
}

async function saveTrn(){
  const nm = $('tr-nm').value.trim();
  const dt = $('tr-dt').value;
  if(!nm || !dt){ toast('연수명과 일시는 필수','warning'); return; }
  const t = {
    id: editingTrnId||uid(), nm, dt,
    lect: $('tr-lect').value, hr: parseFloat($('tr-hr').value)||2,
    loc: $('tr-loc').value, memo: $('tr-memo').value,
    attendees: readChecks('tr-attendees')
  };
  if(editingTrnId){
    const idx = db.trn.findIndex(x=>x.id===editingTrnId);
    db.trn[idx] = t;
  } else {
    db.trn.push(t);
  }
  await save('trn', t);
  closeModal('modal-trn');
  toast('저장되었습니다','success');
  renTrn();
}

async function delTrn(id){
  if(!confirm2('연수를 삭제하시겠습니까?')) return;
  db.trn = db.trn.filter(x=>x.id!==id);
  await removeItem('trn', id);
  toast('삭제되었습니다','success');
  renTrn();
}

function renTrn(){
  const list = db.trn.slice().sort((a,b)=>b.dt.localeCompare(a.dt));
  $('trn-tbody').innerHTML = list.map(t=>{
    const att = (t.attendees||[]).length;
    return `<tr>
      <td>${t.dt.replace('T',' ')}</td>
      <td>${t.nm}</td>
      <td>${t.lect||'-'}</td>
      <td class="center">${t.hr}시간</td>
      <td class="center">${att}명</td>
      <td>
        <button class="btn btn-xs btn-outline" onclick="openTrnModal('${t.id}')">수정</button>
        <button class="btn btn-xs btn-danger" onclick="delTrn('${t.id}')">삭제</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="center" style="padding:40px; color:var(--muted)">등록된 연수가 없습니다</td></tr>';
}


/* ===== 06-statistics.js ===== */
/* =============================================================
 * 통계 피벗
 * ============================================================= */
function renderPivots(){
  try{ buildIndex(); }catch(e){}
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


function isStatActualLog(l){
  const s = (l && l.status) || 'conducted';
  return s === 'conducted' || s === 'verified' || s === 'paid';
}

function forEachStatActualLog(cb, filter){
  filter = filter || {};
  (db.mat || []).forEach(m=>{
    (m.logs || []).forEach(l=>{
      try{ if(typeof ensureLogFields === 'function') ensureLogFields(l, m); }catch(e){}
      if(!isStatActualLog(l)) return;
      if(filter.ym && !(l.date || '').startsWith(filter.ym)) return;
      if(filter.stfId && m.stfId !== filter.stfId) return;
      cb(l, m);
    });
  });
}

function collectActualExecutionMetrics(){
  const coachStuIds = new Set();
  const classMatIds = new Set();
  const classStuIds = new Set();
  if(typeof forEachStatActualLog === 'function'){
    forEachStatActualLog((l, m)=>{
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


/* ===== 07-validation.js ===== */
/* =============================================================
 * 활동 검증 (월별 점검표)
 * ============================================================= */
function loadValidation(){
  const ym = $('ver-month').value;
  if(!ym){ $('ver-area').innerHTML='<p style="color:var(--muted)">월을 선택하세요</p>'; return; }
  const [y,m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayKr = ['일','월','화','수','목','금','토'];

  buildIndex();
  const actives = db.mat.filter(x=>x.st==='active');

  let html = `<table class="tbl" style="margin-top:12px"><thead><tr>
    <th>지원단</th><th>학생</th><th>영역</th><th>예정</th><th>실적</th><th>시수합계</th><th>검증</th>
  </tr></thead><tbody>`;

  actives.forEach(m=>{
    const stf = IDX.stfById[m.stfId]; const stu = IDX.stuById[m.stuId];
    if(!stf || !stu) return;
    let expected = 0;
    const slot = (m.slots||[])[0];
    if(slot){
      const targetDay = ['일','월','화','수','목','금','토'].indexOf(slot.d);
      for(let d=1; d<=daysInMonth; d++){
        if(new Date(y,m-1,d).getDay()===targetDay) expected++;
      }
    }
    const logs = (m.logs||[]).filter(l=>l.d && l.d.startsWith(ym));
    const logCount = logs.length;
    const totalHr = logs.reduce((s,l)=>{
      if(l.s && l.e) return s + (toMin(l.e)-toMin(l.s))/60;
      return s + 1;
    }, 0);
    const ok = logCount>=expected*0.8;
    const areas = (stf.areas||[]).map(a=>AREA_BY_ID[a]?.label||a).join(',');
    html += `<tr>
      <td>${stf.nm}</td><td>${stu.nm}</td><td>${areas}</td>
      <td class="center">${expected}회</td>
      <td class="center">${logCount}회</td>
      <td class="center">${totalHr.toFixed(1)}h</td>
      <td class="center"><span class="badge ${ok?'bg-yes':'bg-no'}">${ok?'✓ 정상':'⚠️ 미달'}</span></td>
    </tr>`;
  });
  html += `</tbody></table>
  <div style="margin-top:12px; padding:12px; background:#f0f9ff; border-radius:8px; font-size:12px">
    ℹ️ 매칭에 활동 로그(logs)를 추가하면 자동 집계됩니다. (추후 실적 입력 UI 추가 예정)
  </div>`;
  $('ver-area').innerHTML = html;
}


/* ===== 08-forms.js ===== */
/* =============================================================
 * 서식
 * ============================================================= */

/* =============================================================
 * 관리부 (출석부) 출력 - 핵심 기능
 * ============================================================= */

/* 지원단 선택 드롭다운 채우기 */
function refreshMgrStfSelect(){
  const sel = $('mgr-stf-sel');
  if(!sel) return;
  const active = db.stf.filter(s=>s.st==='active').sort((a,b)=>a.nm.localeCompare(b.nm));
  sel.innerHTML = '<option value="">(지원단을 선택하세요)</option>' +
    active.map(s=>`<option value="${s.id}">${s.nm} (${(s.ph||'').slice(-4)})</option>`).join('');
  // 기본 당월 세팅
  const ym = $('mgr-ym');
  if(ym && !ym.value){
    const d = new Date();
    ym.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
}

/* 지원단의 해당 월 실적 로그 수집 (복수 매칭 허용) */
function collectStfLogs(stfId, ym){
  const mats = db.mat.filter(m=>m.stfId===stfId);
  const result = []; // [{date, time, topic, stuNm, scNm, matId}]
  mats.forEach(m=>{
    const stu = db.stu.find(x=>x.id===m.stuId);
    (m.logs||[]).forEach(l=>{
      if(l.date && l.date.startsWith(ym)){
        result.push({
          date: l.date,
          time: l.time || '',
          topic: l.topic || l.content || '',
          stuNm: stu ? (stu.nm||'') : '(삭제된 학생)',
          scNm: stu ? (stu.sc||'') : '',
          stuGrade: stu ? `${stu.scType||''}${stu.gr||''}` : '',
          matId: m.id,
          place: l.place || ''
        });
      }
    });
  });
  // 날짜순 정렬
  result.sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
  return result;
}

/* 관리부 HTML 생성 */
function buildMgrBookHtml(stfId, ym){
  const stf = db.stf.find(s=>s.id===stfId);
  if(!stf) return '<div class="empty">지원단을 찾을 수 없습니다</div>';

  const [yy, mm] = ym.split('-').map(n=>parseInt(n));
  const lastDay = new Date(yy, mm, 0).getDate();
  const logs = collectStfLogs(stfId, ym);

  // 일자별 로그 맵
  const byDay = {};
  logs.forEach(l=>{
    const d = parseInt(l.date.split('-')[2]);
    if(!byDay[d]) byDay[d] = [];
    byDay[d].push(l);
  });

  const DAY_NM = ['일','월','화','수','목','금','토'];
  let totalCnt = 0, totalHr = 0;

  // 2단 구성 (1~16 / 17~31)
  let rows = '';
  for(let i=1; i<=16; i++){
    const d1 = i, d2 = i+16 <= lastDay ? i+16 : null;

    // 왼쪽 셀
    const l1arr = byDay[d1] || [];
    const l1 = l1arr[0] || null;
    const day1 = l1 ? DAY_NM[new Date(yy, mm-1, d1).getDay()] : '';

    // 오른쪽 셀
    const l2arr = d2 ? (byDay[d2] || []) : [];
    const l2 = l2arr[0] || null;
    const day2 = (d2 && l2) ? DAY_NM[new Date(yy, mm-1, d2).getDay()] : '';

    // 여러 건 있으면 '외 N건' 표기
    const extra1 = l1arr.length > 1 ? `<br><small style="color:#6366f1">외 ${l1arr.length-1}건</small>` : '';
    const extra2 = l2arr.length > 1 ? `<br><small style="color:#6366f1">외 ${l2arr.length-1}건</small>` : '';

    totalCnt += l1arr.length + l2arr.length;
    [...l1arr, ...l2arr].forEach(l=>{
      const m = (l.time||'').match(/(\d{2}):(\d{2}).*?(\d{2}):(\d{2})/);
      if(m){
        const s = parseInt(m[1])*60+parseInt(m[2]);
        const e = parseInt(m[3])*60+parseInt(m[4]);
        totalHr += Math.max(0, (e-s)/60);
      }
    });

    rows += `<tr>
      <td class="mgr-d">${d1}</td>
      <td class="mgr-w">${day1}</td>
      <td class="mgr-sc">${l1?l1.scNm:''}</td>
      <td class="mgr-t">${l1?l1.time:''}</td>
      <td class="mgr-c">${l1?(l1.topic+extra1):''}</td>
      <td class="mgr-stu">${l1?maskName(db.stu.find(x=>x.nm===l1.stuNm)||{nm:l1.stuNm}):''}</td>
      <td class="mgr-d">${d2||''}</td>
      <td class="mgr-w">${day2}</td>
      <td class="mgr-sc">${l2?l2.scNm:''}</td>
      <td class="mgr-t">${l2?l2.time:''}</td>
      <td class="mgr-c">${l2?(l2.topic+extra2):''}</td>
      <td class="mgr-stu">${l2?maskName(db.stu.find(x=>x.nm===l2.stuNm)||{nm:l2.stuNm}):''}</td>
    </tr>`;
  }

  // 담당 학생 목록
  const myMats = db.mat.filter(m=>m.stfId===stfId && m.st==='active');
  const stuList = myMats.map(m=>{
    const stu = db.stu.find(x=>x.id===m.stuId);
    return stu ? `${maskName(stu)}(${stu.sc||''})` : '-';
  }).filter(x=>x!=='-').join(', ') || '(매칭 없음)';

  const signer = (db.cfg.confirmer || '학습상담사');
  const orgName = db.cfg.org || '○○교육지원청';

  return `<div class="mgr-book">
    <div class="mgr-title">학습지원단 관리부 (${yy}년 ${mm}월)</div>
    <div class="mgr-meta">
      <span>□ 소속: <b>${orgName}</b></span>
      <span>□ 성명: <b>${stf.nm}</b></span>
      <span>□ 연락처: ${stf.ph||'-'}</span>
    </div>
    <div class="mgr-meta">
      <span>□ 담당학생: ${stuList}</span>
    </div>
    <table class="mgr-tbl">
      <thead>
        <tr>
          <th>일</th><th>요</th><th>학교</th><th>시간</th><th>지도내용</th><th>학생</th>
          <th>일</th><th>요</th><th>학교</th><th>시간</th><th>지도내용</th><th>학생</th>
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
}

/* 관리부 생성 (단일) */
function renderMgrBook(){
  const stfId = $('mgr-stf-sel').value;
  const ym = $('mgr-ym').value;
  if(!stfId){ toast('지원단을 선택하세요','warn'); return; }
  if(!ym){ toast('대상 월을 선택하세요','warn'); return; }
  $('mgr-book-area').innerHTML = buildMgrBookHtml(stfId, ym);
  toast('관리부 생성 완료','success');
}

/* 관리부 전체 일괄 생성 */
function renderMgrBookAll(){
  const ym = $('mgr-ym').value;
  if(!ym){ toast('대상 월을 선택하세요','warn'); return; }
  const active = db.stf.filter(s=>s.st==='active');
  if(active.length===0){ toast('활동중인 지원단이 없습니다','warn'); return; }
  if(!confirm2(`${active.length}명의 관리부를 일괄 생성합니다. 진행하시겠습니까?`)) return;
  const html = active.map(s=>buildMgrBookHtml(s.id, ym)).join('<div class="page-break"></div>');
  $('mgr-book-area').innerHTML = html;
  toast(`${active.length}명 관리부 생성 완료`,'success');
}

/* 관리부 인쇄 */
function printMgrBook(){
  const area = $('mgr-book-area');
  if(!area.innerHTML.trim()){ toast('먼저 관리부를 생성하세요','warn'); return; }
  window.print();
}

/* 관리부 엑셀 다운로드 */
function exportMgrBookXlsx(){
  const stfId = $('mgr-stf-sel').value;
  const ym = $('mgr-ym').value;
  if(!stfId || !ym){ toast('지원단과 월을 선택하세요','warn'); return; }
  const stf = db.stf.find(s=>s.id===stfId);
  const [yy, mm] = ym.split('-').map(n=>parseInt(n));
  const lastDay = new Date(yy, mm, 0).getDate();
  const logs = collectStfLogs(stfId, ym);
  const DAY_NM = ['일','월','화','수','목','금','토'];

  const aoa = [
    [`학습지원단 관리부 (${yy}년 ${mm}월)`],
    [`소속: ${db.cfg.org||''}`, '', `성명: ${stf.nm}`, '', `연락처: ${stf.ph||''}`],
    [],
    ['일','요일','학교','시간','지도내용','학생','','일','요일','학교','시간','지도내용','학생']
  ];
  const byDay = {};
  logs.forEach(l=>{
    const d = parseInt(l.date.split('-')[2]);
    if(!byDay[d]) byDay[d] = [];
    byDay[d].push(l);
  });
  let totalCnt = 0;
  for(let i=1; i<=16; i++){
    const d1 = i, d2 = i+16 <= lastDay ? i+16 : null;
    const l1 = (byDay[d1]||[])[0];
    const l2 = d2 ? (byDay[d2]||[])[0] : null;
    totalCnt += (byDay[d1]||[]).length + (d2?(byDay[d2]||[]).length:0);
    const stu1 = l1 ? maskName(db.stu.find(x=>x.nm===l1.stuNm)||{nm:l1.stuNm}) : '';
    const stu2 = l2 ? maskName(db.stu.find(x=>x.nm===l2.stuNm)||{nm:l2.stuNm}) : '';
    aoa.push([
      d1, l1?DAY_NM[new Date(yy,mm-1,d1).getDay()]:'', l1?l1.scNm:'', l1?l1.time:'', l1?l1.topic:'', stu1,
      '',
      d2||'', (d2&&l2)?DAY_NM[new Date(yy,mm-1,d2).getDay()]:'', l2?l2.scNm:'', l2?l2.time:'', l2?l2.topic:'', stu2
    ]);
  }
  aoa.push([]);
  aoa.push(['', '', '', '', `총 ${totalCnt}회 · 확인자(${db.cfg.confirmer||'학습상담사'}):`, '(인)']);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:12}}];
  ws['!cols'] = [{wch:4},{wch:5},{wch:12},{wch:12},{wch:24},{wch:10},{wch:2},{wch:4},{wch:5},{wch:12},{wch:12},{wch:24},{wch:10}];
  XLSX.utils.book_append_sheet(wb, ws, '관리부');
  XLSX.writeFile(wb, `관리부_${stf.nm}_${ym}.xlsx`);
  toast('엑셀 다운로드 완료','success');
}

/* ==========================================
 * 시간표 출력 - 학생별/학교별/지원단별
 * ========================================== */
var TT_MODE = 'staff';
var TT_DAYS = ['월','화','수','목','금','토','일'];
var TT_H_START = 8;  // 08:00
var TT_H_END = 22;   // 22:00
var TT_STEP = 30;    // 30분 단위

function switchTTMode(mode, el){
  TT_MODE = mode;
  document.querySelectorAll('#t8 .tt-controls').forEach(function(x){x.style.display='none'});
  document.getElementById('tt-controls-'+mode).style.display='';
  if(el){
    var tabs = el.parentElement.querySelectorAll('.tab');
    tabs.forEach(function(t){t.classList.remove('active')});
    el.classList.add('active');
  }
  document.getElementById('tt-area').innerHTML = '';
}

function fillTTSelects(){
  // 지원단
  var sel1 = document.getElementById('tt-sel-staff');
  if(sel1){
    sel1.innerHTML = '<option value="all">-- 전체 (개인별 페이지) --</option>';
    (db.stf||[]).filter(function(s){return s.st!=='deleted'}).forEach(function(s){
      sel1.innerHTML += '<option value="'+s.id+'">'+esc(s.nm)+'</option>';
    });
  }
  // 학생
  var sel2 = document.getElementById('tt-sel-stu');
  if(sel2){
    sel2.innerHTML = '<option value="all">-- 전체 (개인별 페이지) --</option>';
    (db.stu||[]).forEach(function(s){
      sel2.innerHTML += '<option value="'+s.id+'">'+esc(maskName(s))+' ('+esc(s.sc||'')+')</option>';
    });
  }
  // 학교
  var sel3 = document.getElementById('tt-sel-sch');
  if(sel3){
    sel3.innerHTML = '<option value="all">-- 전체 학교 --</option>';
    var schools = Array.from(new Set((db.stu||[]).map(function(s){return s.sc}).filter(Boolean))).sort();
    schools.forEach(function(sc){
      sel3.innerHTML += '<option value="'+esc(sc)+'">'+esc(sc)+'</option>';
    });
  }
}

/* 시간을 분으로 변환 */
function ttTimeToMin(t){
  if(!t) return 0;
  var p = t.split(':');
  return parseInt(p[0])*60 + parseInt(p[1]||0);
}

/* 매칭에서 슬롯 수집 - 대상에 따라 */
function collectTTSlots(filter){
  // filter: {type:'staff'|'stu'|'sch', id}
  // V10.0: class matches (수업협력, stuId='') 포함
  var slots = [];
  (db.mat||[]).filter(function(m){return m.st==='active'}).forEach(function(m){
    var stf = (db.stf||[]).find(function(x){return x.id===m.stfId});
    if(!stf) return;
    var isClass = (m.kind === 'class');
    var stu = isClass ? null : (db.stu||[]).find(function(x){return x.id===m.stuId});
    if(!isClass && !stu) return;
    var ci = m.classInfo || {};

    var scName = isClass ? (ci.sc||'') : (stu.sc||'');
    var stuIdKey = isClass ? ('class-'+m.id) : stu.id;
    var stuNmDisp = isClass ? ('🏫 '+(ci.scType||'')+' '+(ci.gr||'')+'-'+(ci.cls||'')+'반') : maskName(stu);
    var grade = isClass ? (ci.gr||'') : (stu.gr||'');
    var cls = isClass ? (ci.cls||'') : (stu.cls||'');

    var match = false;
    if(filter.type==='staff' && stf.id===filter.id) match = true;
    if(filter.type==='stu' && !isClass && stu.id===filter.id) match = true;
    if(filter.type==='sch' && scName===filter.id) match = true;
    if(!match) return;

    (m.slots||[]).forEach(function(sl){
      slots.push({
        d: sl.d, s: sl.s, e: sl.e,
        stfId: stf.id, stfNm: stf.nm,
        stuId: stuIdKey, stuNm: stuNmDisp,
        sc: scName, gr: grade, cls: cls,
        area: isClass ? '수업협력' : ((m.area||(stu.supportTypes && stu.supportTypes[0]))||''),
        kind: isClass ? 'class' : 'coach'
      });
    });
  });
  return slots;
}

/* 그리드 HTML 생성 */
function buildTTGrid(slots, title, subtitle, mode){
  // 요일별, 시간별 셀 구성
  var html = '<div class="tt-wrap">';
  html += '<div class="tt-title">📅 '+esc(title)+'</div>';
  html += '<div class="tt-meta"><span>📌 '+esc(subtitle||'')+'</span><span>🗓️ '+(new Date().toLocaleDateString('ko-KR'))+' 생성</span></div>';

  // 테이블 헤더
  html += '<table class="tt-grid"><thead><tr><th style="width:60px">시간</th>';
  TT_DAYS.forEach(function(d){ html += '<th>'+d+'</th>'; });
  html += '</tr></thead><tbody>';

  // 시간 슬롯별 행
  for(var h=TT_H_START; h<TT_H_END; h++){
    for(var mm=0; mm<60; mm+=TT_STEP){
      var cellStart = h*60+mm;
      var cellEnd = cellStart + TT_STEP;
      var tLabel = (mm===0) ? ('0'+h).slice(-2)+':00' : '';
      html += '<tr><td class="tt-time">'+tLabel+'</td>';

      TT_DAYS.forEach(function(dName){
        var inSlots = slots.filter(function(sl){
          if(sl.d!==dName) return false;
          var sS = ttTimeToMin(sl.s);
          var sE = ttTimeToMin(sl.e);
          return sS < cellEnd && sE > cellStart;
        });
        if(inSlots.length===0){
          html += '<td class="tt-empty"></td>';
        } else {
          // 시작 셀인 경우에만 내용 표시 (rowspan 대신 첫 셀만 표시)
          var newOnes = inSlots.filter(function(sl){
            var sS = ttTimeToMin(sl.s);
            return sS >= cellStart && sS < cellEnd;
          });
          if(newOnes.length===0){
            html += '<td class="tt-empty" style="background:#f0f4ff"></td>';
          } else {
            html += '<td>';
            newOnes.forEach(function(sl, idx){
              var colorIdx = Math.abs((mode==='staff'?sl.stuId:sl.stfId||'').toString().split('').reduce(function(a,c){return a+c.charCodeAt(0)},0)) % 9;
              var primary, secondary;
              if(mode==='staff'){
                primary = sl.stuNm;
                secondary = (sl.sc||'')+' '+(sl.gr?sl.gr+'학년':'');
              } else if(mode==='stu'){
                primary = sl.stfNm;
                secondary = sl.area||'';
              } else { // sch
                primary = sl.stuNm+' ← '+sl.stfNm;
                secondary = (sl.gr?sl.gr+'-'+sl.cls:'')+' '+(sl.area||'');
              }
              html += '<div class="tt-slot color-'+colorIdx+'" title="'+esc(sl.s+'~'+sl.e)+'">';
              html += '<div class="s-nm">'+esc(primary)+'</div>';
              if(secondary.trim()) html += '<div class="s-sub">'+esc(secondary.trim())+'</div>';
              html += '<div class="s-sub">'+esc(sl.s+'~'+sl.e)+'</div>';
              html += '</div>';
            });
            html += '</td>';
          }
        }
      });
      html += '</tr>';
    }
  }
  html += '</tbody></table>';

  // 요약
  var totalSlots = slots.length;
  var totalMin = slots.reduce(function(a,sl){return a+(ttTimeToMin(sl.e)-ttTimeToMin(sl.s))},0);
  html += '<div class="tt-summary">📊 <b>'+totalSlots+'건</b> / 주간 총 <b>'+(totalMin/60).toFixed(1)+'시간</b></div>';

  html += '</div>';
  return html;
}

/* 시간표 생성 - 메인 */
function renderTT(){
  var area = document.getElementById('tt-area');
  var html = '';

  if(TT_MODE==='staff'){
    var sel = document.getElementById('tt-sel-staff').value;
    var targets = sel==='all' ? (db.stf||[]).filter(function(s){return s.st==='active'}) : (db.stf||[]).filter(function(s){return s.id===sel});
    if(targets.length===0){ toast('생성할 지원단이 없습니다','warn'); return; }
    targets.forEach(function(stf){
      var slots = collectTTSlots({type:'staff', id:stf.id});
      var sub = '담당 '+new Set(slots.map(function(x){return x.stuId})).size+'명';
      html += buildTTGrid(slots, '[지원단] '+stf.nm+' 주간 시간표', sub, 'staff');
    });
  } else if(TT_MODE==='stu'){
    var sel = document.getElementById('tt-sel-stu').value;
    var targets = sel==='all' ? (db.stu||[]) : (db.stu||[]).filter(function(s){return s.id===sel});
    if(targets.length===0){ toast('생성할 학생이 없습니다','warn'); return; }
    targets.forEach(function(stu){
      var slots = collectTTSlots({type:'stu', id:stu.id});
      var sub = (stu.sc||'')+' '+(stu.gr?stu.gr+'학년':'')+(stu.cls?' '+stu.cls+'반':'');
      html += buildTTGrid(slots, '[학생] '+maskName(stu)+' 주간 시간표', sub, 'stu');
    });
  } else if(TT_MODE==='sch'){
    var sel = document.getElementById('tt-sel-sch').value;
    if(sel==='all'){
      var schools = Array.from(new Set((db.stu||[]).map(function(s){return s.sc}).filter(Boolean))).sort();
      schools.forEach(function(sc){
        var slots = collectTTSlots({type:'sch', id:sc});
        if(slots.length===0) return;
        var stuCount = new Set(slots.map(function(x){return x.stuId})).size;
        html += buildTTGrid(slots, '[학교] '+sc+' 주간 시간표', '대상 '+stuCount+'명', 'sch');
      });
    } else {
      var slots = collectTTSlots({type:'sch', id:sel});
      var stuCount = new Set(slots.map(function(x){return x.stuId})).size;
      html += buildTTGrid(slots, '[학교] '+sel+' 주간 시간표', '대상 '+stuCount+'명', 'sch');
    }
  }

  if(!html){ area.innerHTML = '<div class="empty-state">❌ 표시할 매칭이 없습니다. 매칭 탭에서 먼저 매칭을 생성하세요.</div>'; return; }
  area.innerHTML = html;
  toast('시간표 생성 완료 ('+ area.querySelectorAll('.tt-wrap').length +'건)','success');
}

/* 인쇄 */
function printTT(){
  var area = document.getElementById('tt-area');
  if(!area || !area.innerHTML.trim()){ toast('먼저 시간표를 생성하세요','warn'); return; }
  window.print();
}

/* 엑셀 다운로드 - 그리드형 */
function exportTTXlsx(){
  var wrap = document.querySelectorAll('#tt-area .tt-wrap');
  if(wrap.length===0){ toast('먼저 시간표를 생성하세요','warn'); return; }
  var wb = XLSX.utils.book_new();

  wrap.forEach(function(w, idx){
    var title = (w.querySelector('.tt-title')||{}).textContent||('시간표'+idx);
    var meta = (w.querySelector('.tt-meta')||{}).textContent||'';

    // AOA 구성
    var aoa = [[title],[meta],[]];
    var header = ['시간'].concat(TT_DAYS);
    aoa.push(header);

    // 각 시간대별 슬롯 정리 (셀 병합 없이 단순)
    var rows = w.querySelectorAll('.tt-grid tbody tr');
    rows.forEach(function(tr){
      var row = [];
      tr.querySelectorAll('td').forEach(function(td){
        if(td.classList.contains('tt-time')){
          row.push(td.textContent.trim());
        } else if(td.classList.contains('tt-empty')){
          row.push('');
        } else {
          var txts = [];
          td.querySelectorAll('.tt-slot').forEach(function(sl){
            var nm = (sl.querySelector('.s-nm')||{}).textContent||'';
            var subs = Array.from(sl.querySelectorAll('.s-sub')).map(function(x){return x.textContent}).join(' / ');
            txts.push((nm+' '+subs).trim());
          });
          row.push(txts.join('\n'));
        }
      });
      aoa.push(row);
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:8}].concat(TT_DAYS.map(function(){return {wch:22}}));
    // 병합: 제목/메타 행
    ws['!merges'] = [
      {s:{r:0,c:0},e:{r:0,c:7}},
      {s:{r:1,c:0},e:{r:1,c:7}}
    ];

    // 시트명 - title 앞 32자까지
    var shName = title.replace(/[\[\]\/\\*?]/g,'').slice(0,30) || ('시간표'+idx);
    // 중복 방지
    var base = shName, i = 1;
    while(wb.SheetNames.indexOf(shName) !== -1){ shName = base.slice(0,28)+'_'+(++i); }
    XLSX.utils.book_append_sheet(wb, ws, shName);
  });

  var fn = '시간표_'+TT_MODE+'_'+(new Date().toISOString().slice(0,10))+'.xlsx';
  XLSX.writeFile(wb, fn);
  toast('엑셀 다운로드 완료','success');
}

/* 엑셀 다운로드 - 명단형 (한 시트에 리스트) */
function exportTTListXlsx(){
  var wrap = document.querySelectorAll('#tt-area .tt-wrap');
  if(wrap.length===0){ toast('먼저 시간표를 생성하세요','warn'); return; }

  // 전체 슬롯 수집
  var all = [];
  if(TT_MODE==='staff'){
    var sel = document.getElementById('tt-sel-staff').value;
    var targets = sel==='all' ? (db.stf||[]).filter(function(s){return s.st==='active'}) : (db.stf||[]).filter(function(s){return s.id===sel});
    targets.forEach(function(stf){
      collectTTSlots({type:'staff', id:stf.id}).forEach(function(sl){
        all.push({'대상(지원단)':stf.nm, '요일':sl.d, '시작':sl.s, '종료':sl.e, '학생':sl.stuNm, '학교':sl.sc, '학년반':(sl.gr?sl.gr+'-'+sl.cls:''), '지원영역':sl.area});
      });
    });
  } else if(TT_MODE==='stu'){
    var sel = document.getElementById('tt-sel-stu').value;
    var targets = sel==='all' ? (db.stu||[]) : (db.stu||[]).filter(function(s){return s.id===sel});
    targets.forEach(function(stu){
      collectTTSlots({type:'stu', id:stu.id}).forEach(function(sl){
        all.push({'대상(학생)':maskName(stu), '학교':stu.sc, '학년반':(stu.gr?stu.gr+'-'+stu.cls:''), '요일':sl.d, '시작':sl.s, '종료':sl.e, '지원단':sl.stfNm, '지원영역':sl.area});
      });
    });
  } else {
    var sel = document.getElementById('tt-sel-sch').value;
    var schools = sel==='all' ? Array.from(new Set((db.stu||[]).map(function(s){return s.sc}).filter(Boolean))) : [sel];
    schools.forEach(function(sc){
      collectTTSlots({type:'sch', id:sc}).forEach(function(sl){
        all.push({'학교':sc, '학생':sl.stuNm, '학년반':(sl.gr?sl.gr+'-'+sl.cls:''), '요일':sl.d, '시작':sl.s, '종료':sl.e, '지원단':sl.stfNm, '지원영역':sl.area});
      });
    });
  }

  if(all.length===0){ toast('데이터 없음','warn'); return; }

  // 요일 순 정렬
  var dayOrder = {'월':1,'화':2,'수':3,'목':4,'금':5,'토':6,'일':7};
  all.sort(function(a,b){
    var d = (dayOrder[a['요일']]||9)-(dayOrder[b['요일']]||9);
    if(d!==0) return d;
    return (a['시작']||'').localeCompare(b['시작']||'');
  });

  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.json_to_sheet(all);
  // 컬럼 폭
  ws['!cols'] = Object.keys(all[0]).map(function(k){return {wch: Math.max(10, k.length*2+4)}});
  XLSX.utils.book_append_sheet(wb, ws, '시간표_명단');
  var fn = '시간표명단_'+TT_MODE+'_'+(new Date().toISOString().slice(0,10))+'.xlsx';
  XLSX.writeFile(wb, fn);
  toast('명단형 엑셀 다운로드 완료','success');
}



function openForm(type){
  const area = $('form-preview');
  const now = new Date();
  const ymd = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;

  if(type==='staff-appoint'){
    const list = db.stf.filter(s=>s.st==='active');
    area.innerHTML = `<div style="background:#fff; padding:40px; border:1px solid var(--border); max-width:800px; margin:0 auto">
      <h2 style="text-align:center; font-size:24px; margin-bottom:40px">위 촉 장</h2>
      <div style="line-height:2.5">
        ${list.map(s=>`<p><b>성 명:</b> ${s.nm}   <b>생년월일:</b> ${s.bd||'-'}</p>`).join('')}
      </div>
      <p style="margin:30px 0">위 사람을 ${db.cfg.org||''}의 <b>학습지원단</b>으로 위촉합니다.</p>
      <p style="text-align:center; margin-top:60px">${ymd}</p>
      <p style="text-align:center; font-size:18px; font-weight:700; margin-top:10px">${db.cfg.org||'○○교육지원청'}</p>
      <div style="margin-top:20px; text-align:center; no-print"><button class="btn btn-primary no-print" onclick="window.print()">🖨️ 인쇄</button></div>
    </div>`;
  } else if(type==='visit-log'){ toast("사용 중단된 서식입니다(V10.1)","warning"); return; } else if(type==='plan-doc'){
    area.innerHTML = `<div style="background:#fff; padding:40px; border:1px solid var(--border); max-width:800px; margin:0 auto">
      <h2 style="text-align:center; margin-bottom:20px">학습지도계획서</h2>
      <table class="pivot-tbl">
        <tr><th>지원단</th><td></td><th>학생</th><td></td></tr>
        <tr><th>지원영역</th><td colspan="3"></td></tr>
        <tr><th>지원기간</th><td colspan="3"></td></tr>
        <tr><th colspan="4">학습목표</th></tr>
        <tr><td colspan="4" style="height:100px"></td></tr>
        <tr><th colspan="4">지도계획</th></tr>
        <tr><td colspan="4" style="height:200px"></td></tr>
        <tr><th colspan="4">평가방법</th></tr>
        <tr><td colspan="4" style="height:80px"></td></tr>
      </table>
      <div style="text-align:center; margin-top:20px"><button class="btn btn-primary no-print" onclick="window.print()">🖨️ 인쇄</button></div>
    </div>`;
  } else if(type==='activity-report'){ toast("사용 중단된 서식입니다(V10.1)","warning"); return; }
}


/* ===== 09-admin.js ===== */
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


/* ===== 10-ext-v99.js ===== */
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
    forEachStatActualLog((l)=>{ if(l.kind!=='class') c++; }, {ym});
    return c;
  });
  const clsMonthly = months.map(ym=>{
    let c = 0;
    forEachStatActualLog((l)=>{ if(l.kind==='class') c++; }, {ym});
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
  const styleTags = Array.from(document.querySelectorAll('style')).map(s=>s.outerHTML).join('');
  const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l=>l.outerHTML).join('');
  const docHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
    ${styleLinks}
    ${styleTags}
    <style>
      body{background:#fff; padding:24px; font-family:"Pretendard",sans-serif}
      .print-bar{position:fixed; top:10px; right:10px; display:flex; gap:6px; z-index:1000}
      @media print{
        body{padding:0 !important; background:#fff !important;}
        body *{visibility:visible !important;}
        #mgr-book-area, #form-preview{position:static !important; left:auto !important; top:auto !important; width:auto !important;}
        .page-break{page-break-after:always}
        .print-bar,.no-print{display:none !important}
      }
    </style>
    </head><body>
    <div class="print-bar no-print">
      <button class="btn btn-primary" onclick="window.print()">🖨️ 인쇄</button>
      <button class="btn btn-outline" onclick="window.close()">닫기</button>
    </div>
    ${contentHtml}
    <scr${''}ipt>
      window.addEventListener('load', function(){
        try{ window.focus(); }catch(e){}
        setTimeout(function(){ try{ window.print(); }catch(e){} }, 250);
      });
    <\/scr${''}ipt>
    </body></html>`;

  const w = window.open('', '_blank', 'width=1000,height=800');
  if(w){
    w.document.open();
    w.document.write(docHtml);
    w.document.close();
    return true;
  }

  try{
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(docHtml);
    idoc.close();
    setTimeout(function(){
      try{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }catch(e){}
      setTimeout(function(){ try{ iframe.remove(); }catch(e){} }, 1000);
    }, 300);
    if(typeof toast==='function') toast('팝업 차단으로 대체 인쇄를 실행합니다','warning');
    return true;
  }catch(e){
    if(typeof toast==='function') toast('인쇄 창을 열 수 없습니다. 브라우저 팝업/인쇄 권한을 확인해주세요','danger');
    return false;
  }
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


/* ===== 11-ext-v10.js ===== */
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


/* ===== 12-patches.js ===== */
/* =================================================================
 * V10.1 PATCH - 실제 사용자 이슈 해결 (2026-04-24)
 * 1. 저장된 '센터장' 값 자동 '학습상담사'로 마이그레이션
 * 2. 시간표 생성 실패 시 명확한 안내 (매칭/슬롯 없음)
 * 3. 지급명세서 드롭다운 defensive refresh
 * 4. 가정방문/활동실적 기능 진입점 차단 (V10.1)
 * 5. 모든 탭 진입 시 드롭다운 강제 refresh
 * 6. 버전 뱃지 V10.1 표시
 * ================================================================= */
(function(){
  'use strict';

  /* ---------- A. confirmer 마이그레이션 (최우선) ---------- */
  function migrateConfirmer(){
    if(!window.db || !db.cfg) return;
    var badValues = ['센터장','센터 장','센터장(인)','팀장','실장','기관장',''];
    if(!db.cfg.confirmer || badValues.indexOf(db.cfg.confirmer) >= 0){
      db.cfg.confirmer = '학습상담사';
      try{
        if(typeof save === 'function'){
          save('meta', Object.assign({id:'cfg'}, db.cfg));
          console.log('[V10.1] confirmer 자동 수정: 학습상담사');
        }
      }catch(e){ console.warn('confirmer 저장 실패', e); }
    }
    var el = document.getElementById('cfg-confirmer');
    if(el) el.value = db.cfg.confirmer;
  }

  /* ---------- B. 시간표 진단 래퍼 ---------- */
  var _origRenderTT = window.renderTT;
  if(typeof _origRenderTT === 'function'){
    window.renderTT = function(){
      try {
        var mode = window.TT_MODE || 'staff';
        var activeMats = (db.mat||[]).filter(function(m){return m.st==='active'});
        var slotCount = activeMats.reduce(function(s,m){return s+((m.slots||[]).length)},0);

        if(activeMats.length === 0){
          var a = document.getElementById('tt-area');
          if(a) a.innerHTML =
            '<div style="padding:40px;text-align:center;background:#fef3c7;border:1px dashed #f59e0b;border-radius:8px">'+
            '<div style="font-size:40px">📅</div>'+
            '<h3 style="margin:12px 0;color:#92400e">활성화된 매칭이 없습니다</h3>'+
            '<p style="color:#78350f">먼저 <b>매칭 탭</b>에서 지원단-학생을 연결하거나 수업협력을 등록해주세요.</p>'+
            '</div>';
          if(typeof toast==='function') toast('매칭이 없어 시간표를 생성할 수 없습니다','warning');
          return;
        }
        if(slotCount === 0){
          var a2 = document.getElementById('tt-area');
          if(a2) a2.innerHTML =
            '<div style="padding:40px;text-align:center;background:#fef3c7;border:1px dashed #f59e0b;border-radius:8px">'+
            '<div style="font-size:40px">⏰</div>'+
            '<h3 style="margin:12px 0;color:#92400e">매칭에 시간 슬롯이 등록되지 않았습니다</h3>'+
            '<p style="color:#78350f">매칭 탭에서 각 매칭의 요일/시간을 입력하고 저장해주세요.</p>'+
            '</div>';
          if(typeof toast==='function') toast('매칭 시간(slots)이 비어있습니다','warning');
          return;
        }
        return _origRenderTT.apply(this, arguments);
      } catch(e){
        console.error('[V10.1] 시간표 생성 오류:', e);
        var a3 = document.getElementById('tt-area');
        if(a3) a3.innerHTML =
          '<div style="padding:20px;background:#fee2e2;border:1px solid #dc2626;border-radius:6px;color:#991b1b">'+
          '<b>⚠ 시간표 생성 오류</b><br>'+
          '<code style="font-size:11px">'+(e.message||e)+'</code></div>';
        if(typeof toast==='function') toast('시간표 생성 중 오류: '+(e.message||e),'danger');
      }
    };
  }

  /* ---------- C. 지급명세서 드롭다운 강화 ---------- */
  window.refreshPayStfSelect = function(){
    var sel = document.getElementById('pay-stf-sel');
    if(!sel) return;
    var active = ((window.db&&db.stf)||[]).filter(function(s){return s.st==='active'}).sort(function(a,b){return a.nm.localeCompare(b.nm)});
    if(active.length === 0){
      sel.innerHTML = '<option value="">(활동중인 지원단이 없습니다)</option>';
      return;
    }
    sel.innerHTML = '<option value="">(지원단을 선택하세요)</option>' +
      active.map(function(s){return '<option value="'+s.id+'">'+s.nm+' ('+((s.ph||'').slice(-4))+')</option>'}).join('');
  };

  /* ---------- D. 모든 탭 진입 시 드롭다운 강제 refresh ---------- */
  var _origGoTab = window.goTab;
  window.goTab = function(id, btn){
    if(_origGoTab) _origGoTab(id, btn);
    if(id === 't8'){
      try { if(typeof refreshMgrStfSelect === 'function') refreshMgrStfSelect(); } catch(e){}
      try { if(typeof fillTTSelects === 'function') fillTTSelects(); } catch(e){}
      try { if(typeof refreshPayStfSelect === 'function') refreshPayStfSelect(); } catch(e){}
      try { if(typeof refreshFormStfSelect === 'function') refreshFormStfSelect(); } catch(e){}
      ['mgr-ym','pay-ym','exec-ym'].forEach(function(mid){
        var el = document.getElementById(mid);
        if(el && !el.value){ el.value = new Date().toISOString().slice(0,7); }
      });
    }
  };

  /* ---------- E. 페이지 로드 직후 초기 작업 ---------- */
  window.addEventListener('load', function(){
    setTimeout(function(){
      migrateConfirmer();
      try { if(typeof refreshMgrStfSelect === 'function') refreshMgrStfSelect(); } catch(e){}
      try { if(typeof fillTTSelects === 'function') fillTTSelects(); } catch(e){}
      try { if(typeof refreshPayStfSelect === 'function') refreshPayStfSelect(); } catch(e){}
      try { if(typeof refreshFormStfSelect === 'function') refreshFormStfSelect(); } catch(e){}
      // 버전 뱃지
      var h = document.getElementById('hdr-sub');
      if(h){ h.textContent = h.textContent.replace(/V\d+\.\d+\s*\w*\s*Edition/, 'V12.3.2 Statistics & Print Fix Edition'); }
    }, 1500);
  });

  console.log('[V10.1] 패치 로드 완료');
})();

/* ================================================================= */

/* =================================================================
 * V10.2 PATCH - 2026-04-24 (충북종합학습클리닉 업무관리 프로그램)
 *   A. 개발자 모드에서만 테스트 데이터 영역 표시
 *   B. 학습코칭 수동매칭 (Drag & Drop: 지원단 → 학생)
 *   C. 실적 검증을 '개인별' 방식으로 전환 (탭 추가)
 *   D. 시간표/지급명세서 드롭다운/자동선택 강화
 *   E. 위촉/경력/해촉 서식 발급주체 = 해당 교육지원청 교육장
 *      확인자 = 담당 장학사 또는 과장
 * ================================================================= */
(function(){
  'use strict';

  /* ----------------------------------------------------------------
   * A. 테스트 데이터 영역 - 개발자 모드(?dev=1)에서만 표시
   * ---------------------------------------------------------------- */
  function applyDevModeVisibility(){
    try {
      var qs = new URLSearchParams(location.search);
      var isDev = qs.get('dev') === '1';
      var zone = document.getElementById('test-data-zone');
      if(zone) zone.style.display = isDev ? 'block' : 'none';
      var devZone = document.getElementById('dev-zone');
      if(devZone) devZone.style.display = isDev ? 'block' : 'none';
    } catch(e){ console.warn('[V10.2] dev mode check fail', e); }
  }

  /* ----------------------------------------------------------------
   * B. 수동매칭 (Drag & Drop)
   *    - 지원단 카드를 학생 카드에 드롭
   *    - '학생 시간으로 강제 배정' 또는 '직접 입력' 선택 모달 표시
   * ---------------------------------------------------------------- */
  function attachDragDropToMatchCols(){
    var ddWait = document.getElementById('dd-wait');
    var ddStf  = document.getElementById('dd-stf');
    if(!ddWait || !ddStf) return;

    // 지원단 카드를 draggable 로 - 순서 기반으로 id 추정
    try {
      var activeStf = (window.db && db.stf||[]).filter(function(s){return s.st==='active'});
      var stfCards = ddStf.querySelectorAll('.dd-card');
      stfCards.forEach(function(card, i){
        if(i >= activeStf.length) return;
        var stf = activeStf[i];
        card.setAttribute('draggable','true');
        card.dataset.stfId = stf.id;
        card.style.cursor = 'grab';
        card.title = '드래그해서 학생에게 배정';
        card.addEventListener('dragstart', function(ev){
          ev.dataTransfer.setData('text/stf-id', stf.id);
          ev.dataTransfer.effectAllowed = 'copy';
          card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', function(){ card.style.opacity = ''; });
      });
    } catch(e){ console.warn('[V10.2] 지원단 draggable 실패', e); }

    // 학생 카드를 drop target 으로
    try {
      var waitCards = ddWait.querySelectorAll('.dd-card');
      waitCards.forEach(function(card){
        // onclick="openManualMatch('ID')" 에서 id 추출
        var oc = card.getAttribute('onclick') || '';
        var m = oc.match(/openManualMatch\(['"]([^'"]+)['"]\)/);
        if(!m) return;
        var stuId = m[1];
        card.dataset.stuId = stuId;

        card.addEventListener('dragover', function(ev){
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
          card.style.outline = '3px dashed #10b981';
          card.style.background = '#ecfdf5';
        });
        card.addEventListener('dragleave', function(){
          card.style.outline = '';
          card.style.background = '';
        });
        card.addEventListener('drop', function(ev){
          ev.preventDefault();
          card.style.outline = '';
          card.style.background = '';
          var stfId = ev.dataTransfer.getData('text/stf-id');
          if(!stfId) return;
          openDropMatchModal(stuId, stfId);
        });
      });
      // 학생 카드에 드래그 유도 hint 뱃지 추가
      if(waitCards.length && !document.getElementById('dd-dnd-hint')){
        var hint = document.createElement('div');
        hint.id = 'dd-dnd-hint';
        hint.style.cssText = 'font-size:11px; color:#6366f1; padding:6px 10px; background:#eef2ff; border-radius:6px; margin-bottom:8px;';
        hint.innerHTML = '💡 <b>수동매칭:</b> 우측의 <b>지원단 카드를 왼쪽의 학생 카드로 드래그</b>하면 수동 배정할 수 있습니다.';
        ddWait.parentElement.insertBefore(hint, ddWait);
      }
    } catch(e){ console.warn('[V10.2] 학생 droppable 실패', e); }
  }

  // drop 시 모달 표시
  window.openDropMatchModal = function(stuId, stfId){
    var stu = (db.stu||[]).find(function(x){return x.id===stuId});
    var stf = (db.stf||[]).find(function(x){return x.id===stfId});
    if(!stu || !stf){ toast('학생/지원단 정보를 찾을 수 없습니다','danger'); return; }

    var stuScd = (stu.scd||[]);
    var firstSlot = stuScd[0] || {d:'월', s:'14:00', e:'15:00'};
    var stuSlotOpts = stuScd.map(function(sl,i){
      return '<option value="'+i+'">'+sl.d+' '+sl.s+'~'+sl.e+'</option>';
    }).join('') || '<option value="-1">(학생 희망시간 없음)</option>';

    var today = new Date().toISOString().slice(0,10);

    var bg = document.createElement('div');
    bg.className = 'modal-bg show';
    bg.innerHTML =
      '<div class="modal" style="max-width:560px">'+
        '<div class="modal-header">'+
          '<div class="modal-title">🔗 수동매칭: '+stf.nm+' → '+stu.nm+'</div>'+
          '<button class="modal-close" onclick="this.closest(\'.modal-bg\').remove()">×</button>'+
        '</div>'+
        '<div style="padding:16px">'+
          '<div style="font-size:12px; color:var(--muted); margin-bottom:10px">'+
            '학생 <b>'+stu.nm+'</b> ('+(stu.sc||'')+' '+(stu.scType||'')+(stu.gr||'')+'-'+(stu.cls||'')+') '+
            '← 지원단 <b>'+stf.nm+'</b>'+
          '</div>'+

          '<div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px">'+
            '<label style="display:flex; align-items:center; gap:6px; font-weight:600">'+
              '<input type="radio" name="dd-mode" value="student" checked> ⚡ 학생 희망시간으로 강제 배정'+
            '</label>'+
            '<select id="dd-stu-slot" style="margin-top:8px; padding:6px; width:100%; border:1px solid var(--border); border-radius:6px">'+stuSlotOpts+'</select>'+
            '<div style="font-size:11px; color:var(--muted); margin-top:4px">지원단 일정과 충돌 시에도 학생 시간으로 강제 배정됩니다.</div>'+
          '</div>'+

          '<div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px">'+
            '<label style="display:flex; align-items:center; gap:6px; font-weight:600">'+
              '<input type="radio" name="dd-mode" value="manual"> ✍️ 직접 입력'+
            '</label>'+
            '<div style="display:grid; grid-template-columns: 100px 1fr 1fr 1fr; gap:6px; margin-top:8px; align-items:center">'+
              '<label style="font-size:12px">요일</label>'+
              '<select id="dd-day" style="padding:6px; border:1px solid var(--border); border-radius:6px">'+
                ['월','화','수','목','금','토','일'].map(function(d){return '<option>'+d+'</option>'}).join('')+
              '</select>'+
              '<input type="time" id="dd-s" value="'+firstSlot.s+'" style="padding:6px; border:1px solid var(--border); border-radius:6px">'+
              '<input type="time" id="dd-e" value="'+firstSlot.e+'" style="padding:6px; border:1px solid var(--border); border-radius:6px">'+
              '<label style="font-size:12px">날짜(선택)</label>'+
              '<input type="date" id="dd-date" value="'+today+'" style="grid-column: span 3; padding:6px; border:1px solid var(--border); border-radius:6px">'+
            '</div>'+
            '<div style="font-size:11px; color:var(--muted); margin-top:4px">날짜는 선택사항이며, 주간 시간표에는 요일+시간 기준으로 반영됩니다.</div>'+
          '</div>'+

          '<div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px">'+
            '<button class="btn btn-outline btn-sm" onclick="this.closest(\'.modal-bg\').remove()">취소</button>'+
            '<button class="btn btn-primary btn-sm" onclick="confirmDropMatch(\''+stuId+'\',\''+stfId+'\', this)">✅ 매칭 확정</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    document.body.appendChild(bg);
  };

  window.confirmDropMatch = async function(stuId, stfId, btn){
    var bg = btn.closest('.modal-bg');
    var mode = (document.querySelector('input[name="dd-mode"]:checked')||{}).value || 'student';
    var slot = null;
    if(mode === 'student'){
      var stu = (db.stu||[]).find(function(x){return x.id===stuId});
      var idx = parseInt(document.getElementById('dd-stu-slot').value);
      if(isNaN(idx) || idx<0 || !(stu.scd||[])[idx]){
        // 학생 희망시간이 없으면 기본값
        slot = {d:'월', s:'14:00', e:'15:00'};
      } else {
        slot = Object.assign({}, stu.scd[idx]);
      }
    } else {
      var d = document.getElementById('dd-day').value;
      var s = document.getElementById('dd-s').value;
      var e = document.getElementById('dd-e').value;
      var dt = document.getElementById('dd-date').value;
      if(!s || !e){ toast('시간을 입력해주세요','warning'); return; }
      slot = {d:d, s:s, e:e};
      if(dt) slot.date = dt;
    }
    var newMat = {
      id: (typeof uid === 'function' ? uid() : ('m_'+Date.now())),
      stfId: stfId, stuId: stuId,
      slots: [slot],
      st:'active', logs:[], createdAt: Date.now(),
      manual: true
    };
    db.mat = db.mat || [];
    db.mat.push(newMat);
    try {
      if(typeof save === 'function') await save('mat', newMat);
    } catch(e){ console.warn('save 실패', e); }
    if(bg) bg.remove();
    if(typeof toast==='function') toast('수동매칭 완료: '+slot.d+' '+slot.s+'~'+slot.e,'success');
    try { if(typeof renMatch==='function') renMatch(); } catch(e){}
    try { if(typeof refreshDashboard==='function') refreshDashboard(); } catch(e){}
  };

  // renMatch 래핑 - 렌더 후 드래그/드롭 바인딩
  var _origRenMatch = window.renMatch;
  window.renMatch = function(){
    var r = _origRenMatch ? _origRenMatch.apply(this, arguments) : null;
    setTimeout(attachDragDropToMatchCols, 50);
    return r;
  };

  /* ----------------------------------------------------------------
   * C. 실적 검증을 '개인별'로 전환
   *    기존: 개별 로그 rows
   *    신규: 지원단 별 그룹 + 펼치기/승인
   * ---------------------------------------------------------------- */
  // 월간 검증 패널에 상단 탭 추가 (최초 1회)
  function injectVerifyModeTabs(){
    var sub = document.getElementById('sub-t5-verify');
    if(!sub || document.getElementById('ver-mode-tabs')) return;
    var header = sub.querySelector('.panel-header');
    if(!header) return;
    var tabs = document.createElement('div');
    tabs.id = 'ver-mode-tabs';
    tabs.style.cssText = 'display:flex; gap:4px; margin:8px 0 12px; border-bottom:1px solid #e5e7eb';
    tabs.innerHTML =
      '<button class="btn btn-sm" id="ver-tab-person" style="background:#6366f1; color:#fff; border-radius:6px 6px 0 0">👤 개인별 검증 (권장)</button>'+
      '<button class="btn btn-sm btn-outline" id="ver-tab-date" style="border-radius:6px 6px 0 0">📅 전체 목록 (날짜별)</button>';
    header.parentElement.insertBefore(tabs, header.nextSibling);

    document.getElementById('ver-tab-person').addEventListener('click', function(){
      window.__verMode = 'person';
      document.getElementById('ver-tab-person').classList.remove('btn-outline');
      document.getElementById('ver-tab-person').style.background = '#6366f1';
      document.getElementById('ver-tab-person').style.color = '#fff';
      document.getElementById('ver-tab-date').classList.add('btn-outline');
      document.getElementById('ver-tab-date').style.background = '';
      document.getElementById('ver-tab-date').style.color = '';
      window.loadVerify();
    });
    document.getElementById('ver-tab-date').addEventListener('click', function(){
      window.__verMode = 'date';
      document.getElementById('ver-tab-date').classList.remove('btn-outline');
      document.getElementById('ver-tab-date').style.background = '#6366f1';
      document.getElementById('ver-tab-date').style.color = '#fff';
      document.getElementById('ver-tab-person').classList.add('btn-outline');
      document.getElementById('ver-tab-person').style.background = '';
      document.getElementById('ver-tab-person').style.color = '';
      window.loadVerify();
    });
  }

  var _origLoadVerify = window.loadVerify;
  window._legacyLoadVerifyPerson = function(){
    injectVerifyModeTabs();
    var mode = window.__verMode || 'person';
    if(mode === 'date'){
      if(typeof _origLoadVerify === 'function') return _origLoadVerify.apply(this, arguments);
      return;
    }
    // 개인별 검증 모드
    var ym = (document.getElementById('ver-month')||{}).value || (new Date().toISOString().slice(0,7));
    if(document.getElementById('ver-month') && !document.getElementById('ver-month').value){
      document.getElementById('ver-month').value = ym;
    }
    var filter = (document.getElementById('ver-filter')||{}).value || 'pending';
    if(typeof buildIndex === 'function') buildIndex();

    // 지원단별 그룹화
    var byStf = {};
    (db.mat||[]).forEach(function(m){
      (m.logs||[]).forEach(function(l){
        if(typeof ensureLogFields === 'function') ensureLogFields(l, m);
        if(!(l.date||'').startsWith(ym)) return;
        if(filter !== 'all'){
          var s = l.status;
          if(filter==='pending' && s!=='conducted') return;
          if(filter==='verified' && s!=='verified' && s!=='paid') return;
          if(filter==='rejected' && s!=='rejected') return;
        }
        var key = m.stfId;
        if(!byStf[key]) byStf[key] = {logs:[], byStatus:{conducted:0, verified:0, rejected:0, canceled:0, paid:0}};
        byStf[key].logs.push({m:m, l:l});
        byStf[key].byStatus[l.status] = (byStf[key].byStatus[l.status]||0) + 1;
      });
    });

    var area = document.getElementById('ver-area');
    if(!area) return;
    var stfIds = Object.keys(byStf);
    if(stfIds.length === 0){
      area.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted)">해당 조건의 실적이 없습니다</div>';
      return;
    }

    // 지원단 이름순
    stfIds.sort(function(a,b){
      var na = (IDX.stfById[a]||{}).nm || '';
      var nb = (IDX.stfById[b]||{}).nm || '';
      return na.localeCompare(nb);
    });

    var html = '<div style="font-size:12px; color:var(--muted); margin-bottom:8px">'+
      '👤 <b>개인별 검증</b> 모드 · 지원단이 제출한 서류를 근거로 <b>사람 단위</b>로 일괄 승인/반려할 수 있습니다. ('+stfIds.length+'명)'+
      '</div>';

    stfIds.forEach(function(sid, idx){
      var stf = IDX.stfById[sid] || {nm:'?'};
      var g = byStf[sid];
      var total = g.logs.length;
      var pending = g.byStatus.conducted || 0;
      var approved = (g.byStatus.verified||0) + (g.byStatus.paid||0);
      var rejected = g.byStatus.rejected || 0;
      var canceled = g.byStatus.canceled || 0;

      var rows = g.logs.map(function(r){
        var stu = IDX.stuById[r.m.stuId];
        var stuNm = stu ? stu.nm : (r.m.kind==='class' ? '🏫 학급' : '-');
        var amt = r.l.amount || (typeof calcLogAmount==='function' ? calcLogAmount(r.l) : 0);
        var s = r.l.status;
        var stColor = s==='verified'||s==='paid'?'bg-yes':(s==='rejected'?'bg-danger':(s==='canceled'?'bg-no':'bg-info'));
        var stLbl = {conducted:'미검증',verified:'✅승인',rejected:'❌반려',canceled:'취소',paid:'지급완료'}[s]||s;
        var kindLbl = r.l.kind==='class'?'수업협력':'학습코칭';
        return '<tr>'+
          '<td class="center"><input type="checkbox" class="ver-chk ver-chk-'+sid+'" data-mat="'+r.m.id+'" data-log="'+r.l.id+'"></td>'+
          '<td>'+r.l.date+'</td>'+
          '<td>'+stuNm+'</td>'+
          '<td>'+kindLbl+'</td>'+
          '<td>'+(r.l.time||'')+'</td>'+
          '<td style="font-size:12px">'+(r.l.topic||'')+'</td>'+
          '<td class="ar">'+(s==='canceled'?'-':formatMoney(amt))+'</td>'+
          '<td><span class="badge '+stColor+'">'+stLbl+'</span></td>'+
          '<td>'+
            (s==='conducted'
              ? '<button class="btn btn-xs btn-success" onclick="verifyOne(\''+r.m.id+'\',\''+r.l.id+'\',\'verified\')">승인</button> '+
                '<button class="btn btn-xs btn-danger" onclick="verifyOne(\''+r.m.id+'\',\''+r.l.id+'\',\'rejected\')">반려</button>'
              : '<button class="btn btn-xs btn-outline" onclick="verifyOne(\''+r.m.id+'\',\''+r.l.id+'\',\'conducted\')">되돌림</button>')+
          '</td>'+
          '</tr>';
      }).join('');

      var panelId = 'ver-p-'+sid;
      html +=
        '<div style="border:1px solid #e5e7eb; border-radius:8px; margin-bottom:10px; overflow:hidden">'+
          '<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; cursor:pointer" onclick="(function(el){var p=document.getElementById(\''+panelId+'\'); p.style.display = (p.style.display===\'none\'?\'block\':\'none\'); el.querySelector(\'.arrow\').textContent = (p.style.display===\'none\'?\'▶\':\'▼\');})(this)">'+
            '<div>'+
              '<span class="arrow" style="margin-right:6px">▼</span>'+
              '<b style="font-size:14px">'+stf.nm+'</b> '+
              '<span class="badge bg-info" style="margin-left:6px">총 '+total+'건</span> '+
              (pending>0?'<span class="badge" style="background:#fde68a; color:#92400e; margin-left:4px">미검증 '+pending+'</span>':'')+
              (approved>0?'<span class="badge bg-yes" style="margin-left:4px">승인 '+approved+'</span>':'')+
              (rejected>0?'<span class="badge bg-danger" style="margin-left:4px">반려 '+rejected+'</span>':'')+
            '</div>'+
            '<div style="display:flex; gap:6px" onclick="event.stopPropagation()">'+
              '<button class="btn btn-xs" style="background:#6366f1;color:#fff" onclick="verChkAllByStf(\''+sid+'\', true)">전체선택</button>'+
              '<button class="btn btn-xs btn-outline" onclick="verChkAllByStf(\''+sid+'\', false)">해제</button>'+
              '<button class="btn btn-xs btn-success" onclick="bulkVerifyByStf(\''+sid+'\', \'verified\')">✅ 이 사람 일괄 승인</button>'+
              '<button class="btn btn-xs btn-danger" onclick="bulkVerifyByStf(\''+sid+'\', \'rejected\')">❌ 일괄 반려</button>'+
            '</div>'+
          '</div>'+
          '<div id="'+panelId+'" style="display:'+(pending>0?'block':'none')+'; padding:0">'+
            '<table class="tbl" style="margin:0">'+
              '<thead><tr>'+
                '<th style="width:30px"><input type="checkbox" onchange="verChkAllByStf(\''+sid+'\', this.checked)"></th>'+
                '<th>날짜</th><th>학생</th><th>유형</th><th>시간</th><th>지도내용</th><th>금액</th><th>상태</th><th>작업</th>'+
              '</tr></thead>'+
              '<tbody>'+rows+'</tbody>'+
            '</table>'+
          '</div>'+
        '</div>';
    });
    area.innerHTML = html;
  };

  window.verChkAllByStf = function(sid, checked){
    document.querySelectorAll('.ver-chk-'+sid).forEach(function(c){ c.checked = checked; });
  };

  window._legacyBulkVerifyByStf = async function(sid, newStatus){
    var chks = document.querySelectorAll('.ver-chk-'+sid);
    var allPending = [];
    chks.forEach(function(c){
      var matId = c.dataset.mat; var logId = c.dataset.log;
      var m = (db.mat||[]).find(function(x){return x.id===matId});
      if(!m) return;
      var l = (m.logs||[]).find(function(x){return x.id===logId});
      if(!l) return;
      if(l.status !== 'conducted') return;
      allPending.push({m:m, l:l});
    });
    if(allPending.length === 0){
      toast('해당 지원단의 미검증 실적이 없습니다','warning');
      return;
    }
    var label = newStatus==='verified' ? '승인' : '반려';
    if(!confirm(allPending.length+'건을 "'+label+'" 처리하시겠습니까?')) return;
    var done = new Set();
    for(var i=0;i<allPending.length;i++){
      var r = allPending[i];
      r.l.status = newStatus;
      if(newStatus==='verified'){
        r.l.verifiedBy = (db.cfg && db.cfg.confirmer) || '담당 장학사';
        r.l.verifiedAt = Date.now();
        if(!r.l.amount && typeof calcLogAmount==='function') r.l.amount = calcLogAmount(r.l);
      }
      if(!done.has(r.m.id)){
        try { if(typeof save==='function') await save('mat', r.m); } catch(e){}
        done.add(r.m.id);
      }
    }
    toast(allPending.length+'건 '+label+' 완료','success');
    window.loadVerify();
    if(typeof refreshDashboard==='function') refreshDashboard();
  };

  /* ----------------------------------------------------------------
   * D. 시간표 / 지급명세서 안정화
   * ---------------------------------------------------------------- */
  // T8 탭 진입 시 dropdown이 비어있으면 첫 항목 자동 선택 + 날짜 기본값
  var _origGoTab = window.goTab;
  window.goTab = function(id, btn){
    if(_origGoTab) _origGoTab(id, btn);
    if(id === 't8'){
      setTimeout(function(){
        try { if(typeof fillTTSelects==='function') fillTTSelects(); } catch(e){}
        try { if(typeof refreshPayStfSelect==='function') refreshPayStfSelect(); } catch(e){}
        try { if(typeof refreshMgrStfSelect==='function') refreshMgrStfSelect(); } catch(e){}
        try { if(typeof refreshFormStfSelect==='function') refreshFormStfSelect(); } catch(e){}

        // 날짜 입력 기본값
        var thisMonth = new Date().toISOString().slice(0,7);
        ['mgr-ym','pay-ym','exec-ym'].forEach(function(mid){
          var el = document.getElementById(mid);
          if(el && !el.value) el.value = thisMonth();
        });

        // 지급명세서 지원단 미선택 시 첫 항목 자동선택
        var ps = document.getElementById('pay-stf-sel');
        if(ps && !ps.value && ps.options.length>1){
          // 첫 실 지원단 찾기
          for(var i=0;i<ps.options.length;i++){
            if(ps.options[i].value){ ps.value = ps.options[i].value; break; }
          }
        }
      }, 150);
    }
  };

  // renderPaySlip 래핑: 미선택 시 첫 항목 자동 선택
  var _origRenderPaySlip = window.renderPaySlip;
  window.renderPaySlip = function(){
    var ps = document.getElementById('pay-stf-sel');
    var ym = document.getElementById('pay-ym');
    if(ps && !ps.value){
      for(var i=0;i<ps.options.length;i++){
        if(ps.options[i].value){ ps.value = ps.options[i].value; break; }
      }
    }
    if(ym && !ym.value) ym.value = new Date().toISOString().slice(0,7);
    if(ps && !ps.value){
      toast('등록된 활동중 지원단이 없습니다. 먼저 지원단을 등록해주세요.','warning');
      return;
    }
    if(_origRenderPaySlip) return _origRenderPaySlip.apply(this, arguments);
  };

  /* ----------------------------------------------------------------
   * E. 서식 재작성 — 교육지원청 교육장 명의 발급
   *    (위촉장 / 위촉확인서 / 경력확인서 / 해촉신청서)
   * ---------------------------------------------------------------- */
  function getIssuerInfo(){
    var org = (db.cfg && db.cfg.org) || '○○교육지원청';
    // 교육지원청 이름에서 교육장 명의 추출
    var officeName = org;
    // "청주교육지원청" 같은 이름이면 그대로, 아니면 그대로 사용
    if(!/교육지원청/.test(officeName)) officeName = officeName + ' 교육지원청';
    var superintendent = officeName.replace(/\s*교육지원청.*/,'') + '교육지원청교육장';
    var confirmer = (db.cfg && db.cfg.confirmer) || '담당 장학사';
    var admin = (db.cfg && db.cfg.admin) || '';
    return {
      officeName: officeName,
      superintendent: superintendent,
      confirmer: confirmer,
      admin: admin
    };
  }

  var _origOpenForm = window.openForm;
  window.openForm = function(type){
    // 발급주체 교체가 필요한 4종 서식만 오버라이드
    var targets = ['staff-appoint','appoint-confirm','career-confirm','resign'];
    if(targets.indexOf(type) < 0){
      if(_origOpenForm) return _origOpenForm.apply(this, arguments);
      return;
    }

    var area = document.getElementById('form-preview');
    if(!area) return;
    var now = new Date();
    var ymd = now.getFullYear()+'년 '+(now.getMonth()+1)+'월 '+now.getDate()+'일';
    var info = getIssuerInfo();
    var stfId = (document.getElementById('form-stf-sel')||{}).value;
    if(!stfId){ toast('지원단을 먼저 선택하세요','warning'); return; }
    var stf = (db.stf||[]).find(function(x){return x.id===stfId});
    if(!stf){ toast('지원단 정보를 찾을 수 없습니다','danger'); return; }

    function fmtDate(iso){
      if(!iso) return '____. __. __.';
      var d = new Date(iso);
      return d.getFullYear()+'. '+String(d.getMonth()+1).padStart(2,'0')+'. '+String(d.getDate()).padStart(2,'0')+'.';
    }

    var verifierRow =
      '<div style="margin-top:30px; text-align:right; font-size:14px">'+
        '<div style="display:inline-block; text-align:left">'+
          '담 당 자: '+(info.admin||'담당장학사')+' ______________ (인)<br>'+
          '확 인 자: '+info.confirmer+' ______________ (인)'+
        '</div>'+
      '</div>';

    var issuerBlock =
      '<div style="text-align:center; margin-top:50px">'+
        '<p style="margin:4px 0">'+ymd+'</p>'+
        '<p style="font-size:26px; font-weight:700; letter-spacing:12px; margin-top:20px">'+info.superintendent+'</p>'+
        '<div style="margin-top:8px; font-size:12px; color:#6b7280">[직인]</div>'+
      '</div>';

    if(type==='staff-appoint'){
      var apPeriod = (stf.appointStart && stf.appointEnd)
        ? fmtDate(stf.appointStart)+' ~ '+fmtDate(stf.appointEnd)
        : '별도 공문에 따름';
      area.innerHTML =
        '<div class="form-doc" style="background:#fff; padding:50px; border:2px solid #1e293b; max-width:820px; margin:0 auto">'+
          '<h1 style="text-align:center; font-size:36px; letter-spacing:40px; margin:30px 0 40px">위 촉 장</h1>'+
          '<table class="pivot-tbl" style="margin:20px 0">'+
            '<tr><th style="width:110px">성 명</th><td><b>'+stf.nm+'</b></td><th style="width:110px">생년월일</th><td>'+(stf.bd||'-')+'</td></tr>'+
            '<tr><th>위촉 분야</th><td colspan="3">'+(stf.appointArea||'학습코칭')+'</td></tr>'+
            '<tr><th>위촉 기간</th><td colspan="3">'+apPeriod+'</td></tr>'+
          '</table>'+
          '<p style="margin:40px 0; line-height:2; text-align:center; font-size:16px">'+
            '위 사람을 <b>'+info.officeName+'</b>의 <b>충북종합학습클리닉 학습지원단</b>으로 위촉합니다.'+
          '</p>'+
          issuerBlock+
          '<div style="margin-top:20px; text-align:center"><button class="btn btn-primary no-print" onclick="window.print()">🖨️ 인쇄</button></div>'+
        '</div>';
    }
    else if(type==='appoint-confirm'){
      var apPeriod2 = (stf.appointStart && stf.appointEnd)
        ? fmtDate(stf.appointStart)+' ~ '+fmtDate(stf.appointEnd)
        : '별도 공문에 따름';
      area.innerHTML =
        '<div class="form-doc" style="background:#fff; padding:40px; border:1px solid var(--border); max-width:820px; margin:0 auto">'+
          '<h1 style="text-align:center; font-size:28px; letter-spacing:18px; margin:30px 0">위촉 확인서</h1>'+
          '<table class="pivot-tbl">'+
            '<tr><th style="width:120px">성 명</th><td><b>'+stf.nm+'</b></td><th style="width:120px">생년월일</th><td>'+(stf.bd||'-')+'</td></tr>'+
            '<tr><th>연락처</th><td>'+(stf.ph||'-')+'</td><th>소 속</th><td>'+info.officeName+'</td></tr>'+
            '<tr><th>위촉 분야</th><td colspan="3"><b>'+(stf.appointArea||'학습코칭')+'</b></td></tr>'+
            '<tr><th>위촉 기간</th><td colspan="3"><b>'+apPeriod2+'</b></td></tr>'+
          '</table>'+
          '<p style="margin:30px 0; line-height:2">'+
            '위 사람은 <b>'+info.officeName+'</b>에서 위와 같이 <b>충북종합학습클리닉 학습지원단</b>으로 위촉되어 활동 중임을 확인합니다.'+
          '</p>'+
          issuerBlock+
          verifierRow+
          '<div style="margin-top:20px; text-align:center"><button class="btn btn-primary no-print" onclick="window.print()">🖨️ 인쇄</button></div>'+
        '</div>';
    }
    else if(type==='career-confirm'){
      var all = (stf.careerHistory||[]).slice();
      if(stf.appointStart && stf.appointEnd){
        all.push({start:stf.appointStart, end:stf.appointEnd, area:stf.appointArea||'학습코칭', current:true});
      }
      var careerRows = all.map(function(c,i){
        var cnt=0, hr=0;
        (db.mat||[]).filter(function(m){return m.stfId===stf.id}).forEach(function(m){
          (m.logs||[]).forEach(function(l){
            if(l.status!=='verified' && l.status!=='paid') return;
            if(!l.date) return;
            if(l.date>=c.start && l.date<=c.end){ cnt++; hr+=(l.minutes||50)/60; }
          });
        });
        var months = Math.max(1, Math.round(((new Date(c.end)-new Date(c.start))/(1000*60*60*24*30))));
        return '<tr>'+
          '<td class="center">'+(i+1)+'</td>'+
          '<td>'+(c.area||'학습코칭')+'</td>'+
          '<td>'+fmtDate(c.start)+' ~ '+fmtDate(c.end)+(c.current?' <span class="badge bg-yes">현재</span>':'')+'</td>'+
          '<td class="center">'+months+'개월</td>'+
          '<td class="center">'+cnt+'회</td>'+
          '<td class="center">'+hr.toFixed(1)+'h</td>'+
        '</tr>';
      }).join('') || '<tr><td colspan="6" class="center" style="color:#999; padding:30px">기록된 위촉 이력이 없습니다</td></tr>';
      var totalMonths = all.reduce(function(s,c){return s+Math.max(1, Math.round(((new Date(c.end)-new Date(c.start))/(1000*60*60*24*30))))},0);
      area.innerHTML =
        '<div class="form-doc" style="background:#fff; padding:40px; border:1px solid var(--border); max-width:820px; margin:0 auto">'+
          '<h1 style="text-align:center; font-size:28px; letter-spacing:18px; margin:30px 0">경력 확인서</h1>'+
          '<table class="pivot-tbl">'+
            '<tr><th style="width:120px">성 명</th><td><b>'+stf.nm+'</b></td><th style="width:120px">생년월일</th><td>'+(stf.bd||'-')+'</td></tr>'+
            '<tr><th>연락처</th><td colspan="3">'+(stf.ph||'-')+'</td></tr>'+
          '</table>'+
          '<h3 style="margin:20px 0 8px; font-size:14px">▣ 위촉 이력 (누적 '+all.length+'회 · 총 '+totalMonths+'개월)</h3>'+
          '<table class="pivot-tbl">'+
            '<thead><tr>'+
              '<th style="width:40px">No</th><th>분야</th><th>위촉 기간</th><th>기간</th><th>실시 회기</th><th>시수</th>'+
            '</tr></thead>'+
            '<tbody>'+careerRows+'</tbody>'+
          '</table>'+
          '<p style="margin:30px 0; line-height:2">'+
            '위와 같이 <b>'+info.officeName+'</b>에서의 <b>충북종합학습클리닉 학습지원단 활동 경력</b>을 확인합니다.'+
          '</p>'+
          issuerBlock+
          verifierRow+
          '<div style="margin-top:20px; text-align:center"><button class="btn btn-primary no-print" onclick="window.print()">🖨️ 인쇄</button></div>'+
        '</div>';
    }
    else if(type==='resign'){
      area.innerHTML =
        '<div class="form-doc" style="background:#fff; padding:40px; border:1px solid var(--border); max-width:820px; margin:0 auto">'+
          '<h1 style="text-align:center; font-size:28px; letter-spacing:18px; margin:30px 0">해촉 신청서</h1>'+
          '<table class="pivot-tbl">'+
            '<tr><th style="width:120px">성 명</th><td><b>'+stf.nm+'</b></td><th style="width:120px">생년월일</th><td>'+(stf.bd||'-')+'</td></tr>'+
            '<tr><th>연락처</th><td colspan="3">'+(stf.ph||'-')+'</td></tr>'+
            '<tr><th>위촉 분야</th><td>'+(stf.appointArea||'학습코칭')+'</td><th>위촉일</th><td>'+fmtDate(stf.appointStart)+'</td></tr>'+
            '<tr><th>해촉 예정일</th><td><input type="text" placeholder="YYYY. MM. DD." style="width:100%; border:none; background:transparent"></td>'+
                '<th>해촉 사유</th><td><input type="text" placeholder="사유 입력" style="width:100%; border:none; background:transparent" value="'+((stf.resignReason||'').replace(/"/g,'&quot;'))+'"></td></tr>'+
            '<tr><th colspan="4">세부 사유</th></tr>'+
            '<tr><td colspan="4" style="height:120px; vertical-align:top">&nbsp;</td></tr>'+
          '</table>'+
          '<p style="margin:30px 0; line-height:2">'+
            '위와 같은 사유로 <b>'+info.officeName+'</b>의 충북종합학습클리닉 학습지원단 활동 <b>해촉을 신청</b>합니다.'+
          '</p>'+
          '<p style="text-align:center; margin-top:40px">'+ymd+'</p>'+
          '<p style="text-align:right; margin-top:20px">신청인: <b>'+stf.nm+'</b> ________________ (인)</p>'+
          '<div style="margin-top:30px; padding:16px; background:#f8fafc; border-left:4px solid #6366f1">'+
            '<p style="margin:0 0 8px"><b>※ 접수/확인</b></p>'+
            '<p style="margin:4px 0">담 당 자: '+(info.admin||'담당장학사')+' ______________ (인) &nbsp;&nbsp; 확 인 자: '+info.confirmer+' ______________ (인)</p>'+
          '</div>'+
          '<p style="text-align:left; margin-top:30px; font-size:15px"><b>'+info.superintendent+'</b> 귀하</p>'+
          '<div style="margin-top:20px; text-align:center"><button class="btn btn-primary no-print" onclick="window.print()">🖨️ 인쇄</button></div>'+
        '</div>';
    }
  };

  /* ----------------------------------------------------------------
   * F. 초기화
   * ---------------------------------------------------------------- */
  window.addEventListener('load', function(){
    setTimeout(function(){
      applyDevModeVisibility();

      // 버전 뱃지 업데이트
      var h = document.getElementById('hdr-sub');
      if(h) h.textContent = 'V11.2 · 충북종합학습클리닉 업무관리 프로그램 · Modular Edition';

      // 설정 폼 라벨/값 동기화 (저장값 있으면 표시)
      var confirmerEl = document.getElementById('cfg-confirmer');
      if(confirmerEl && db.cfg){
        if(!db.cfg.confirmer || !String(db.cfg.confirmer).trim()){
          db.cfg.confirmer = '담당 장학사';
          try{ if(typeof save==='function') save('meta', Object.assign({id:'cfg'}, db.cfg)); }catch(e){}
        }
        confirmerEl.value = db.cfg.confirmer;
      }

      // 매칭 탭 열려 있을 시 DnD 바인딩
      try { attachDragDropToMatchCols(); } catch(e){}
    }, 1800);
  });

  // 매칭 탭 진입 시 DnD 바인딩 재시도
  var _prevGoTab = window.goTab;
  window.goTab = function(id, btn){
    if(_prevGoTab) _prevGoTab(id, btn);
    if(id === 't4'){
      setTimeout(function(){
        try { if(typeof renMatch==='function') renMatch(); } catch(e){}
      }, 120);
    }
  };

  console.log('[V11.2] 패치 로드 완료 — 충북종합학습클리닉 업무관리 프로그램');
})();

/* ================================================================= */

/* =================================================================
 * V11 Stability Patch
 * ================================================================= */
(function(){
  function safeCall(fn){ try{ return typeof fn === 'function' ? fn() : undefined; }catch(e){ console.warn(e); } }
  function activeSubT5(){
    const el = document.querySelector('#t5 .subtab-content.active');
    return el ? el.id : '';
  }

  // unified goTab to avoid long override chains
  window.goTab = function(id, btn){
    document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));
    var tab = document.getElementById(id);
    if(tab) tab.classList.add('active');
    if(btn) btn.classList.add('active');

    if(id==='t1') safeCall(refreshDashboard);
    if(id==='t2') safeCall(renStaff);
    if(id==='t3') safeCall(renStu);
    if(id==='t4') setTimeout(()=>safeCall(renMatch), 50);
    if(id==='t5'){
      const sub = activeSubT5();
      if(sub==='sub-t5-record') safeCall(loadStfRecord);
      else if(sub==='sub-t5-settle') safeCall(loadSettle);
      else safeCall(loadVerify);
    }
    if(id==='t6') safeCall(renTrn);
    if(id==='t7') safeCall(renderPivots);
    if(id==='t8'){
      setTimeout(function(){
        safeCall(refreshMgrStfSelect);
        safeCall(fillTTSelects);
        safeCall(refreshPayStfSelect);
        safeCall(refreshFormStfSelect);
        var monthVal = (typeof thisMonth==='function') ? thisMonth() : new Date().toISOString().slice(0,7);
        ['mgr-ym','pay-ym','exec-ym'].forEach(function(mid){
          var el = document.getElementById(mid);
          if(el && !el.value) el.value = monthVal;
        });
        var ps = document.getElementById('pay-stf-sel');
        if(ps && !ps.value && ps.options && ps.options.length>1){
          for(var i=0;i<ps.options.length;i++){
            if(ps.options[i].value){ ps.value = ps.options[i].value; break; }
          }
        }
      }, 50);
    }
  };

  // deterministic confirmer handling
  const _origSaveCfgV107 = window.saveCfg;
  window.saveCfg = async function(){
    const confirmerInput = document.getElementById('cfg-confirmer');
    if(confirmerInput){
      db.cfg = db.cfg || {};
      const rawConfirmer = String(confirmerInput.value || '').trim();
      db.cfg.confirmer = rawConfirmer || '담당 장학사';
      confirmerInput.value = db.cfg.confirmer;
    }
    const result = (typeof _origSaveCfgV107 === 'function')
      ? await _origSaveCfgV107.apply(this, arguments)
      : undefined;
    if(confirmerInput){
      const finalConfirmer = String(confirmerInput.value || db.cfg.confirmer || '').trim() || '담당 장학사';
      db.cfg.confirmer = finalConfirmer;
      confirmerInput.value = finalConfirmer;
      try{ await save('meta', {id:'cfg', ...db.cfg}); }catch(e){ console.warn(e); }
    }
    return result;
  };

  // stable log collector for management book/pay docs
  window.collectStfLogs = function(stfId, ym, kindFilter){
    const mats = (db.mat||[]).filter(m=>m.stfId===stfId);
    const result = [];
    mats.forEach(m=>{
      const stu = (db.stu||[]).find(x=>x.id===m.stuId);
      (m.logs||[]).forEach(l=>{
        try{ if(typeof ensureLogFields === 'function') ensureLogFields(l, m); }catch(e){}
        if(!l.date || !String(l.date).startsWith(ym)) return;
        const status = l.status || 'conducted';
        if(!['conducted','verified','paid'].includes(status)) return;
        const kind = l.kind || m.kind || 'coach';
        if(kindFilter && kind !== kindFilter) return;
        const ci = m.classInfo || {};
        result.push({
          date: l.date,
          time: l.time || '',
          topic: l.topic || l.content || l.activity || '',
          activity: l.activity || l.topic || l.content || '',
          stuNm: kind==='class' ? ((ci.scType||'')+' '+(ci.gr||'')+'-'+(ci.cls||'')+'반') : (stu ? (stu.nm||'') : '(삭제됨)'),
          scNm: kind==='class' ? (ci.sc||'') : (stu ? (stu.sc||'') : ''),
          matId: m.id,
          place: l.place || '',
          kind: kind,
          minutes: l.minutes || 0,
          status: status
        });
      });
    });
    result.sort((a,b)=> (String(a.date)+String(a.time)).localeCompare(String(b.date)+String(b.time)));
    return result;
  };

  // stable verify renderer: supporter-based monthly verification
  window.loadVerify = function(){
    const ymEl = document.getElementById('ver-month');
    const filterEl = document.getElementById('ver-filter');
    const areaEl = document.getElementById('ver-area');
    if(!areaEl) return;

    const ym = (ymEl && ymEl.value) || (typeof thisMonth==='function' ? thisMonth() : new Date().toISOString().slice(0,7));
    if(ymEl && !ymEl.value) ymEl.value = ym;
    const filter = (filterEl && filterEl.value) || 'pending';

    try { if(typeof buildIndex==='function') buildIndex(); } catch(e){}

    const byStf = {};
    let totalLogs = 0;

    (db.mat||[]).forEach(m => {
      (m.logs||[]).forEach(l => {
        try { if(typeof ensureLogFields === 'function') ensureLogFields(l, m); } catch(e){}
        if(!(l.date||'').startsWith(ym)) return;

        const s = l.status || 'conducted';
        if(filter !== 'all'){
          if(filter==='pending' && s!=='conducted') return;
          if(filter==='verified' && s!=='verified' && s!=='paid') return;
          if(filter==='rejected' && s!=='rejected') return;
        }

        if(!byStf[m.stfId]) {
          byStf[m.stfId] = { logs: [], pendingCnt: 0, verifiedCnt: 0 };
        }
        byStf[m.stfId].logs.push({m, l});
        totalLogs++;

        if(s === 'conducted') byStf[m.stfId].pendingCnt++;
        else if(s === 'verified' || s === 'paid') byStf[m.stfId].verifiedCnt++;
      });
    });

    if(totalLogs === 0){
      areaEl.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted)">해당 월에 조건과 일치하는 실적이 없습니다</div>';
      return;
    }

    const stfIds = Object.keys(byStf).sort((a,b) => {
      const na = (window.IDX && IDX.stfById && IDX.stfById[a]) ? IDX.stfById[a].nm : '';
      const nb = (window.IDX && IDX.stfById && IDX.stfById[b]) ? IDX.stfById[b].nm : '';
      return na.localeCompare(nb);
    });

    let html = `<div style="font-size:12px; color:var(--muted); margin-bottom:12px">
      👤 <b>개인별 월단위 검증</b> · 총 ${stfIds.length}명의 지원단 실적이 검색되었습니다.
    </div>`;

    stfIds.forEach(sid => {
      const stf = (window.IDX && IDX.stfById) ? IDX.stfById[sid] : null;
      const stfName = stf ? stf.nm : '알 수 없음';
      const group = byStf[sid];

      const rowsHtml = group.logs.map(r => {
        const stu = (window.IDX && IDX.stuById) ? IDX.stuById[r.m.stuId] : null;
        const amt = r.l.amount || (typeof calcLogAmount==='function' ? calcLogAmount(r.l) : 0);
        const s = r.l.status || 'conducted';
        const stColor = s==='verified'||s==='paid'?'bg-yes':(s==='rejected'?'bg-danger':(s==='canceled'?'bg-no':'bg-info'));
        const stLbl = ({conducted:'미검증',verified:'✅승인',rejected:'❌반려',canceled:'취소',paid:'지급완료'})[s] || s;
        const kindLbl = (r.l.kind||r.m.kind)==='class' ? '수업협력' : '학습코칭';
        const subject = stu ? stu.nm : (((r.m.classInfo||{}).gr||'') ? ('🏫 '+((r.m.classInfo||{}).gr||'')+'-'+((r.m.classInfo||{}).cls||'')+'반') : '-');

        return `<tr>
          <td class="center"><input type="checkbox" class="ver-chk-${sid}" data-mat="${r.m.id}" data-log="${r.l.id}"></td>
          <td>${esc(r.l.date||'')}</td>
          <td>${esc(subject)}</td>
          <td>${kindLbl}</td>
          <td>${esc(r.l.time||'')}</td>
          <td style="font-size:12px">${esc(r.l.topic||r.l.content||'')}</td>
          <td class="ar">${s==='canceled'?'-':(typeof formatMoney==='function' ? formatMoney(amt) : String(amt))}</td>
          <td><span class="badge ${stColor}">${stLbl}</span></td>
          <td>
            ${s==='conducted'
              ? `<button class="btn btn-xs btn-success" onclick="verifyOne('${r.m.id}','${r.l.id}','verified')">승인</button>
                 <button class="btn btn-xs btn-danger" onclick="verifyOne('${r.m.id}','${r.l.id}','rejected')">반려</button>`
              : `<button class="btn btn-xs btn-outline" onclick="verifyOne('${r.m.id}','${r.l.id}','conducted')">되돌림</button>`}
          </td>
        </tr>`;
      }).join('');

      const panelId = 'ver-p-' + sid;
      html += `
        <div style="border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px; overflow:hidden">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; cursor:pointer" onclick="document.getElementById('${panelId}').style.display = document.getElementById('${panelId}').style.display==='none'?'block':'none'">
            <div>
              <b style="font-size:15px; color:var(--text)">${esc(stfName)}</b>
              <span class="badge bg-info" style="margin-left:8px">총 ${group.logs.length}건</span>
              ${group.pendingCnt > 0 ? `<span class="badge" style="background:#fde68a; color:#92400e; margin-left:4px">미검증 ${group.pendingCnt}</span>` : ''}
              ${group.verifiedCnt > 0 ? `<span class="badge bg-yes" style="margin-left:4px">승인 ${group.verifiedCnt}</span>` : ''}
            </div>
            <div style="display:flex; gap:6px" onclick="event.stopPropagation()">
              <button class="btn btn-xs btn-outline" onclick="document.querySelectorAll('.ver-chk-${sid}').forEach(c=>c.checked=true)">전체선택</button>
              <button class="btn btn-xs btn-outline" onclick="document.querySelectorAll('.ver-chk-${sid}').forEach(c=>c.checked=false)">해제</button>
              <button class="btn btn-xs btn-success" onclick="window.bulkVerifyByStf('${sid}', 'verified')">✅ 선택항목 일괄 승인</button>
            </div>
          </div>
          <div id="${panelId}" style="display:${group.pendingCnt > 0 ? 'block' : 'none'}; padding:0">
            <table class="tbl" style="margin:0">
              <thead>
                <tr>
                  <th style="width:30px">선택</th>
                  <th>날짜</th><th>학생/학급</th><th>유형</th><th>시간</th><th>지도내용</th><th>금액</th><th>상태</th><th>개별작업</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>`;
    });

    areaEl.innerHTML = html;
  };

  window.bulkVerifyByStf = async function(sid, newStatus){
    const chks = document.querySelectorAll('.ver-chk-' + sid);
    const allPending = [];

    chks.forEach(c => {
      if(!c.checked) return;
      const matId = c.dataset.mat;
      const logId = c.dataset.log;
      const m = (db.mat||[]).find(x => x.id === matId);
      if(!m) return;
      const l = (m.logs||[]).find(x => x.id === logId);
      if(!l) return;
      if(l.status !== 'conducted') return;
      allPending.push({m, l});
    });

    if(allPending.length === 0){
      if(typeof toast === 'function') toast('선택된 미검증 실적이 없습니다', 'warning');
      return;
    }

    const label = newStatus === 'verified' ? '승인' : '반려';
    if(!confirm('선택된 미검증 실적 ' + allPending.length + '건을 "' + label + '" 처리하시겠습니까?')) return;

    const doneMats = new Set();
    for(let i=0; i<allPending.length; i++){
      const pair = allPending[i];
      const m = pair.m;
      const l = pair.l;
      l.status = newStatus;
      if(newStatus === 'verified'){
        l.verifiedBy = (db.cfg && db.cfg.confirmer) || '담당 장학사';
        l.verifiedAt = Date.now();
        if(!l.amount && typeof calcLogAmount === 'function') l.amount = calcLogAmount(l);
      }
      if(!doneMats.has(m.id)){
        try { if(typeof save === 'function') await save('mat', m); } catch(e){}
        doneMats.add(m.id);
      }
    }

    if(typeof toast === 'function') toast(allPending.length + '건 ' + label + ' 완료', 'success');
    window.loadVerify();
    if(typeof refreshDashboard === 'function') refreshDashboard();
  };

  // keep labels consistent after login/init
  window.addEventListener('load', function(){
    setTimeout(function(){
      var title = document.querySelector('title');
      if(title) title.textContent = '🎓 학습클리닉 통합관리 V11.2';
      var h = document.getElementById('hdr-sub');
      if(h) h.textContent = 'V11.2 · 충북종합학습클리닉 업무관리 프로그램 · Modular Edition';
      var loginSub = document.querySelector('#login-overlay p span');
      if(loginSub) loginSub.textContent = 'V12.3.2 Statistics & Print Fix Edition';
      var confirmerEl = document.getElementById('cfg-confirmer');
      if(confirmerEl && db && db.cfg){
        if(!db.cfg.confirmer || !String(db.cfg.confirmer).trim()) db.cfg.confirmer = '담당 장학사';
        confirmerEl.value = db.cfg.confirmer;
      }
    }, 30);
  });

  // final print handlers: always use popup print window for isolated forms
  window.printMgrBook = function(){
    var area = document.getElementById('mgr-book-area');
    if(!area || !area.innerHTML.trim()){ if(typeof toast==='function') toast('먼저 관리부를 생성하세요','warning'); return; }
    if(typeof openPrintWin==='function') return openPrintWin('학습지원단 관리부', area.innerHTML);
    window.print();
  };

  window.printTT = function(){
    var area = document.getElementById('tt-area');
    if(!area || !area.innerHTML.trim()){ if(typeof toast==='function') toast('먼저 시간표를 생성하세요','warning'); return; }
    if(typeof openPrintWin==='function') return openPrintWin('시간표', area.innerHTML);
    window.print();
  };

  // final deterministic config save default
  var _stableSaveCfgV112 = window.saveCfg;
  window.saveCfg = async function(){
    var confirmerInput = document.getElementById('cfg-confirmer');
    if(confirmerInput && (!String(confirmerInput.value||'').trim())) confirmerInput.value = '담당 장학사';
    var result = (typeof _stableSaveCfgV112==='function') ? await _stableSaveCfgV112.apply(this, arguments) : undefined;
    if(window.db && db.cfg){
      db.cfg.confirmer = String((confirmerInput && confirmerInput.value) || db.cfg.confirmer || '').trim() || '담당 장학사';
      if(confirmerInput) confirmerInput.value = db.cfg.confirmer;
      try{ if(typeof save==='function') await save('meta', {id:'cfg', ...db.cfg}); }catch(e){ console.warn(e); }
    }
    return result;
  };
})();

/* ================================================================= */



/* =================================================================
 * V11.4 Record Entry Patch
 * - phone-based dedupe on upload
 * - stable drag/drop with data ids
 * - supporter-based verification with date subtotals & mini calendar
 * - payslip warning / no-data labeling
 * ================================================================= */
(function(){
  'use strict';

  function normalizePhone(v){ return String(v||'').replace(/\D/g,''); }
  function dayLabelMap(logs){
    const m = {};
    (logs||[]).forEach(r=>{
      const d = (r.l && r.l.date) || '';
      if(!d) return;
      const amt = r.l.status==='canceled' ? 0 : (r.l.amount || (typeof calcLogAmount==='function' ? calcLogAmount(r.l) : 0));
      if(!m[d]) m[d] = {count:0,pending:0,amount:0};
      m[d].count += 1;
      m[d].amount += Number(amt||0);
      if((r.l.status||'conducted') === 'conducted') m[d].pending += 1;
    });
    return m;
  }
  function buildMiniCalendar(ym, logs){
    const [yy, mm] = String(ym||'').split('-').map(n=>parseInt(n,10));
    if(!yy || !mm) return '';
    const first = new Date(yy, mm-1, 1);
    const firstDow = first.getDay();
    const lastDay = new Date(yy, mm, 0).getDate();
    const byDay = {};
    (logs||[]).forEach(r=>{
      const d = parseInt(String((r.l&&r.l.date)||'').split('-')[2]||'0',10);
      if(!d) return;
      if(!byDay[d]) byDay[d] = {count:0,pending:0};
      byDay[d].count += 1;
      if((r.l.status||'conducted') === 'conducted') byDay[d].pending += 1;
    });
    let cells = '';
    const week = ['일','월','화','수','목','금','토'];
    cells += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:11px;margin-bottom:4px">'+week.map(d=>'<div style="text-align:center;color:#64748b;font-weight:600">'+d+'</div>').join('')+'</div>';
    cells += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
    for(let i=0;i<firstDow;i++) cells += '<div></div>';
    for(let d=1; d<=lastDay; d++){
      const meta = byDay[d];
      let bg = '#fff', bd = '#e5e7eb', color = '#334155';
      if(meta){
        if(meta.pending>0){ bg='#fef3c7'; bd='#f59e0b'; color='#92400e'; }
        else { bg='#dcfce7'; bd='#22c55e'; color='#166534'; }
      }
      const badge = meta ? '<div style="font-size:9px;line-height:1;margin-top:2px">'+meta.count+'건</div>' : '<div style="font-size:9px;line-height:1;margin-top:2px;color:#cbd5e1">·</div>';
      const title = meta ? (ym+'-'+String(d).padStart(2,'0')+' / '+meta.count+'건'+(meta.pending>0?' / 미검증 '+meta.pending+'건':'')) : (ym+'-'+String(d).padStart(2,'0'));
      cells += '<div title="'+title+'" style="border:1px solid '+bd+';background:'+bg+';color:'+color+';border-radius:6px;padding:4px 2px;text-align:center;min-height:34px">'
             + '<div style="font-weight:700">'+d+'</div>'+badge+'</div>';
    }
    cells += '</div>';
    return '<div style="margin:10px 14px 14px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff">'
         + '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#334155">📅 '+ym+' 활동일 미니뷰</div>'+cells+'</div>';
  }

  // optional phone column in student template
  window.dlStuTemplate = function(){
    if(typeof XLSX==='undefined'){ toast('엑셀 라이브러리 로딩 중','warning'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['이름','연락처(선택)','성별','지역','학교명','학교급(초/중)','학년','반','지원유형(콤마)','지원영역(콤마)','우선순위(1-5)','희망시간(예:월 14:00-15:00)'],
      ['학생1','010-1234-5678','남','지역1','○○초','초','3','2','방과후학습코칭','한글미해득,기초학습지원','3','월 14:00-15:00']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, '학생');
    XLSX.writeFile(wb, '학생_양식.xlsx');
  };

  // upload dedupe by phone
  window.upStaff = async function(e){
    const f = e.target.files[0]; if(!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let created=0, updated=0, fail=0;
    const errors=[];
    for(const r of rows){
      try{
        if(!r.이름){ fail++; errors.push({row:r, reason:'이름 누락'}); continue; }
        const areas = typeof resolveAreaIdsFromLabels==='function' ? resolveAreaIdsFromLabels(r['지원영역(콤마)']||'') : [];
        const scd = String(r['활동시간(예:월 14:00-16:00,수 14:00-16:00)']||'').split(',').map(x=>{
          const m = x.trim().match(/^(.)[\s]+(\d{1,2}:\d{2})[\s]*[-~][\s]*(\d{1,2}:\d{2})$/);
          return m ? {d:m[1], s:m[2], e:m[3]} : null;
        }).filter(Boolean);
        const s = {
          id: (typeof uid==='function'?uid():String(Date.now())), nm: r.이름, ph: r.연락처||r.휴대전화||r.휴대폰||'', bd: r.생년월일||'',
          st: r.상태||'active', areas, scd, ds: r.비고||'', plans:[]
        };
        const phNorm = normalizePhone(s.ph);
        const dup = phNorm ? (db.stf||[]).find(x=>normalizePhone(x.ph)===phNorm) : null;
        if(dup){
          Object.assign(dup, { nm:s.nm, ph:s.ph||dup.ph, areas:s.areas, scd:s.scd, bd:s.bd, ds:s.ds, st:s.st });
          if(typeof save==='function') await save('stf', dup);
          updated++; continue;
        }
        if((db.stf||[]).length >= 50){ fail++; errors.push({row:r, reason:'50명 초과'}); continue; }
        db.stf.push(s); if(typeof save==='function') await save('stf', s); created++;
      }catch(err){ fail++; errors.push({row:r, reason:err.message}); }
    }
    toast(`업로드 완료: 신규 ${created}건, 업데이트 ${updated}건, 실패 ${fail}건`, fail>0?'warning':'success');
    if(errors.length) console.table(errors);
    if(typeof renStaff==='function') renStaff();
    if(typeof refreshDashboard==='function') refreshDashboard();
    e.target.value='';
  };

  window.upStu = async function(e){
    const f = e.target.files[0]; if(!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let created=0, updated=0, fail=0;
    const errors=[];
    for(const r of rows){
      try{
        if(!r.이름){ fail++; errors.push({row:r, reason:'이름 누락'}); continue; }
        const areas = typeof resolveAreaIdsFromLabels==='function' ? resolveAreaIdsFromLabels(r['지원영역(콤마)']||'') : [];
        const sts = String(r['지원유형(콤마)']||'방과후학습코칭').split(',').map(x=>x.trim()).filter(Boolean);
        const ph = r['연락처(선택)'] || r.연락처 || r.휴대전화 || r.휴대전화번호 || r.휴대폰 || '';
        const scd = String(r['희망시간(예:월 14:00-15:00)']||r['희망시간']||'').split(',').map(x=>{
          const m = x.trim().match(/^(.)[\s]+(\d{1,2}:\d{2})[\s]*[-~][\s]*(\d{1,2}:\d{2})$/);
          return m ? {d:m[1], s:m[2], e:m[3]} : null;
        }).filter(Boolean);
        const s = {
          id: (typeof uid==='function'?uid():String(Date.now())), nm: r.이름, ph: ph, alias:'', gen: r.성별||'남',
          region: r.지역||'', sc: r.학교명||'', scType: r['학교급(초/중)']||'초',
          gr: parseInt(r.학년)||1, cls: parseInt(r.반)||1,
          supportTypes: sts, areas, etcDetail:'', priority: parseInt(r['우선순위(1-5)'])||3,
          diagTest:{done:false,dyslexia:false,adhd:false,borderline:false,testDate:'',testInst:''},
          therapy:{inst:'',start:'',end:''}, unsupported:{is:false,reason:''}, scd
        };
        const phNorm = normalizePhone(s.ph);
        const dup = phNorm ? (db.stu||[]).find(x=>normalizePhone(x.ph)===phNorm) : null;
        if(dup){
          Object.assign(dup, {
            nm:s.nm, ph:s.ph||dup.ph, gen:s.gen, region:s.region, sc:s.sc, scType:s.scType, gr:s.gr, cls:s.cls,
            supportTypes:s.supportTypes, areas:s.areas, priority:s.priority, scd:s.scd
          });
          if(typeof save==='function') await save('stu', dup);
          updated++; continue;
        }
        if((db.stu||[]).length >= 1500){ fail++; errors.push({row:r, reason:'1500명 초과'}); continue; }
        db.stu.push(s); if(typeof save==='function') await save('stu', s); created++;
      }catch(err){ fail++; errors.push({row:r, reason:err.message}); }
    }
    toast(`업로드 완료: 신규 ${created}건, 업데이트 ${updated}건, 실패 ${fail}건`, fail>0?'warning':'success');
    if(errors.length) console.table(errors);
    if(typeof renStu==='function') renStu();
    if(typeof refreshDashboard==='function') refreshDashboard();
    e.target.value='';
  };

  // stable renMatch with explicit ids
  window.renMatch = function(){
    if(typeof buildIndex==='function') buildIndex();
    const unmatched = (db.stu||[]).filter(s=>!(IDX.matByStu||{})[s.id] && !(s.unsupported&&s.unsupported.is) && (s.scd||[]).length>0);
    const matched = (db.mat||[]).filter(m=>m.st==='active');
    const activeStf = (db.stf||[]).filter(s=>s.st==='active');
    if(document.getElementById('cnt-wait')) document.getElementById('cnt-wait').textContent = unmatched.length;
    if(document.getElementById('cnt-mat')) document.getElementById('cnt-mat').textContent = matched.length;
    if(document.getElementById('cnt-stf')) document.getElementById('cnt-stf').textContent = activeStf.length;
    if(document.getElementById('conflict-count')) document.getElementById('conflict-count').textContent = (window.__conflictQueue||[]).length;

    const ddWait = document.getElementById('dd-wait');
    const ddMat = document.getElementById('dd-mat');
    const ddStf = document.getElementById('dd-stf');
    if(ddWait) ddWait.innerHTML = unmatched.slice(0,50).map(s=>{
      const areas = (s.areas||[]).map(a=>AREA_BY_ID[a] ? AREA_BY_ID[a].label : a).join(',');
      return `<div class="dd-card" data-stu-id="${s.id}" onclick="openManualMatch('${s.id}')">
        <b>${esc(s.nm)}</b> <span class="badge bg-purple">${esc((s.scType||'')+(s.gr||''))}</span>
        <div style="font-size:11px; color:var(--muted); margin-top:2px">${esc((s.sc||'')+' · '+areas)}</div>
        <div style="font-size:11px; color:var(--muted)">${(s.scd||[]).slice(0,2).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ')}</div>
      </div>`;
    }).join('') + (unmatched.length>50?`<div style="text-align:center; color:var(--muted); padding:8px">+ ${unmatched.length-50}명 더...</div>`:'');

    if(ddMat) ddMat.innerHTML = matched.slice(0,50).map(m=>{
      const stu = (IDX.stuById||{})[m.stuId]; const stf = (IDX.stfById||{})[m.stfId];
      if(!stu || !stf) return '';
      const slotTxt = (m.slots||[]).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ');
      return `<div class="dd-card">
        <b>${esc(stf.nm)}</b> → <b>${esc(stu.nm)}</b>
        <div style="font-size:11px; color:var(--muted)">${esc(slotTxt)}</div>
        <button class="btn btn-xs btn-danger" onclick="unmatch('${m.id}')" style="margin-top:4px">해제</button>
      </div>`;
    }).join('') + (matched.length>50?`<div style="text-align:center; color:var(--muted); padding:8px">+ ${matched.length-50}건 더...</div>`:'');

    if(ddStf) ddStf.innerHTML = activeStf.slice(0,50).map(s=>{
      const load = ((IDX.matByStf||{})[s.id]||[]).length;
      return `<div class="dd-card" draggable="true" data-stf-id="${s.id}">
        <b>${esc(s.nm)}</b> <span class="badge ${load>0?'bg-yes':'bg-no'}">${load}건</span>
        <div style="font-size:11px; color:var(--muted)">${esc((s.areas||[]).map(a=>AREA_BY_ID[a]?AREA_BY_ID[a].label:a).slice(0,2).join(','))}</div>
      </div>`;
    }).join('');

    setTimeout(attachDragDropStable, 30);
  };

  function attachDragDropStable(){
    const ddWait = document.getElementById('dd-wait');
    const ddStf = document.getElementById('dd-stf');
    if(!ddWait || !ddStf) return;
    ddStf.querySelectorAll('.dd-card[data-stf-id]').forEach(card=>{
      if(card.dataset.dndBound==='1') return;
      card.dataset.dndBound='1';
      const stfId = card.dataset.stfId;
      card.style.cursor='grab';
      card.title='드래그해서 학생에게 배정';
      card.addEventListener('dragstart', ev=>{ ev.dataTransfer.setData('text/stf-id', stfId); ev.dataTransfer.effectAllowed='copy'; card.style.opacity='0.5'; });
      card.addEventListener('dragend', ()=>{ card.style.opacity=''; });
    });
    ddWait.querySelectorAll('.dd-card[data-stu-id]').forEach(card=>{
      if(card.dataset.dropBound==='1') return;
      card.dataset.dropBound='1';
      card.addEventListener('dragover', ev=>{ ev.preventDefault(); ev.dataTransfer.dropEffect='copy'; card.style.outline='3px dashed #10b981'; card.style.background='#ecfdf5'; });
      card.addEventListener('dragleave', ()=>{ card.style.outline=''; card.style.background=''; });
      card.addEventListener('drop', ev=>{ ev.preventDefault(); card.style.outline=''; card.style.background=''; const stfId = ev.dataTransfer.getData('text/stf-id'); if(!stfId) return; window.openDropMatchModal(card.dataset.stuId, stfId); });
    });
    if(ddWait && !document.getElementById('dd-dnd-hint')){
      const hint = document.createElement('div');
      hint.id='dd-dnd-hint';
      hint.style.cssText='font-size:11px; color:#6366f1; padding:6px 10px; background:#eef2ff; border-radius:6px; margin-bottom:8px;';
      hint.innerHTML='💡 <b>수동매칭:</b> 우측의 <b>지원단 카드를 왼쪽 학생 카드로 드래그</b>하거나, 학생 카드를 눌러 강제 배정할 수 있습니다.';
      ddWait.parentElement.insertBefore(hint, ddWait);
    }
  }

  window.openManualMatch = function(stuId){
    const stu = (db.stu||[]).find(s=>s.id===stuId); if(!stu) return;
    if(typeof buildIndex==='function') buildIndex();
    const needAreas = stu.areas||[];
    const candidates = (db.stf||[]).filter(stf=>stf.st==='active' && (stf.areas||[]).some(a=>needAreas.includes(a))).map(stf=>{
      const overlap = typeof intersectSlots==='function' ? intersectSlots(stf.scd||[], stu.scd||[]) : [];
      const used = ((IDX.matByStf||{})[stf.id]||[]).flatMap(m=>m.slots||[]);
      const validSlots = overlap.filter(s=>!(typeof hasConflict==='function' ? hasConflict(s, used) : false));
      return {stf, overlap, validSlots};
    });
    const overlapCandidates = candidates.filter(x=>x.overlap.length>0);
    const listHtml = overlapCandidates.length===0
      ? '<div style="color:var(--muted); padding:16px 0">시간 교집합이 있는 지원단이 없습니다. 아래에서 강제 배정 또는 직접 입력을 사용하세요.</div>'
      : overlapCandidates.map(c=>{
          const slotTxt = c.validSlots.length>0 ? c.validSlots.map(x=>`${x.d} ${x.s}~${x.e}`).join(', ') : '<span style="color:var(--danger)">전부 점유됨</span>';
          return `<div style="padding:10px; background:#f8fafc; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:10px">
            <div>
              <b>${esc(c.stf.nm)}</b> <span class="badge bg-info">${esc((c.stf.areas||[]).map(a=>AREA_BY_ID[a]?AREA_BY_ID[a].label:a).join(','))}</span>
              <div style="font-size:12px; color:var(--muted); margin-top:4px">${slotTxt}</div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end">
              <button class="btn btn-sm btn-primary" ${c.validSlots.length===0?'disabled':''} onclick="doManualMatch('${stu.id}','${c.stf.id}')">배정</button>
              <button class="btn btn-sm btn-outline" onclick="openDropMatchModal('${stu.id}','${c.stf.id}')">강제/직접</button>
            </div>
          </div>`;
        }).join('');
    const m = document.createElement('div');
    m.className='modal-bg show';
    m.innerHTML = `<div class="modal" style="max-width:760px">
      <div class="modal-header"><div class="modal-title">🔗 수동 매칭 - ${esc(stu.nm)}</div><button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button></div>
      <div style="padding:12px">
        <div style="margin-bottom:12px"><b>${esc(stu.nm)}</b> (${esc((stu.sc||'')+' '+(stu.scType||'')+(stu.gr||'')+'-'+(stu.cls||''))})</div>
        <div style="font-size:12px; color:var(--muted); margin-bottom:8px">희망 영역: ${esc(needAreas.map(a=>AREA_BY_ID[a]?AREA_BY_ID[a].label:a).join(', '))}</div>
        <div style="font-size:12px; color:var(--muted); margin-bottom:12px">희망 시간: ${esc((stu.scd||[]).map(x=>`${x.d} ${x.s}~${x.e}`).join(', ')||'-')}</div>
        <h4 style="margin-bottom:8px">매칭 가능 지원단</h4>
        ${listHtml}
        <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #cbd5e1">
          <button class="btn btn-sm btn-warning" onclick="openDropMatchModal('${stu.id}',''); this.closest('.modal-bg').remove();">✍️ 강제 배정 / 직접 입력 열기</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(m);
    window.__manualMatchModal = m;
  };

  window.openDropMatchModal = function(stuId, stfId){
    const stu = (db.stu||[]).find(x=>x.id===stuId); if(!stu){ toast('학생 정보를 찾을 수 없습니다','danger'); return; }
    const stf = stfId ? (db.stf||[]).find(x=>x.id===stfId) : null;
    const activeStf = (db.stf||[]).filter(x=>x.st==='active').sort((a,b)=>String(a.nm||'').localeCompare(String(b.nm||'')));
    const stfOpts = ['<option value="">-- 지원단 선택 --</option>'].concat(activeStf.map(s=>`<option value="${s.id}" ${stf&&s.id===stf.id?'selected':''}>${esc(s.nm)} (${esc((s.areas||[]).map(a=>AREA_BY_ID[a]?AREA_BY_ID[a].label:a).join(','))})</option>`)).join('');
    const stuScd = stu.scd||[];
    const firstSlot = stuScd[0] || {d:'월', s:'14:00', e:'15:00'};
    const stuSlotOpts = stuScd.map((sl,i)=>`<option value="${i}">${sl.d} ${sl.s}~${sl.e}</option>`).join('') || '<option value="-1">(학생 희망시간 없음)</option>';
    const today = new Date().toISOString().slice(0,10);
    const bg = document.createElement('div');
    bg.className='modal-bg show';
    bg.innerHTML = `<div class="modal" style="max-width:620px">
      <div class="modal-header"><div class="modal-title">🔗 수동매칭/강제배정${stf?' : '+esc(stf.nm)+' → '+esc(stu.nm):''}</div><button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button></div>
      <div style="padding:16px">
        <div class="form-group" style="margin-bottom:12px"><label>지원단 선택</label><select id="dd-stf-sel" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px">${stfOpts}</select></div>
        <div style="font-size:12px; color:var(--muted); margin-bottom:10px">학생 <b>${esc(stu.nm)}</b> (${esc((stu.sc||'')+' '+(stu.scType||'')+(stu.gr||'')+'-'+(stu.cls||''))})</div>
        <div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px">
          <label style="display:flex; align-items:center; gap:6px; font-weight:600"><input type="radio" name="dd-mode" value="student" checked> ⚡ 학생 희망시간으로 강제 배정</label>
          <select id="dd-stu-slot" style="margin-top:8px; padding:6px; width:100%; border:1px solid var(--border); border-radius:6px">${stuSlotOpts}</select>
          <div style="font-size:11px; color:var(--muted); margin-top:4px">지원단 일정과 충돌 시에도 학생 시간으로 강제 배정됩니다.</div>
        </div>
        <div style="padding:10px; border:1px solid #e5e7eb; border-radius:8px">
          <label style="display:flex; align-items:center; gap:6px; font-weight:600"><input type="radio" name="dd-mode" value="manual"> ✍️ 직접 입력</label>
          <div style="display:grid; grid-template-columns: 100px 1fr 1fr 1fr; gap:6px; margin-top:8px; align-items:center">
            <label style="font-size:12px">요일</label>
            <select id="dd-day" style="padding:6px; border:1px solid var(--border); border-radius:6px">${['월','화','수','목','금','토','일'].map(d=>`<option ${d===firstSlot.d?'selected':''}>${d}</option>`).join('')}</select>
            <input type="time" id="dd-s" value="${firstSlot.s}" style="padding:6px; border:1px solid var(--border); border-radius:6px">
            <input type="time" id="dd-e" value="${firstSlot.e}" style="padding:6px; border:1px solid var(--border); border-radius:6px">
            <label style="font-size:12px">날짜(선택)</label>
            <input type="date" id="dd-date" value="${today}" style="grid-column: span 3; padding:6px; border:1px solid var(--border); border-radius:6px">
          </div>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px"><button class="btn btn-outline btn-sm" onclick="this.closest('.modal-bg').remove()">취소</button><button class="btn btn-primary btn-sm" onclick="confirmDropMatch('${stuId}','${stfId||''}', this)">✅ 매칭 확정</button></div>
      </div>
    </div>`;
    document.body.appendChild(bg);
  };

  window.confirmDropMatch = async function(stuId, stfId, btn){
    const bg = btn.closest('.modal-bg');
    const selectedStfId = stfId || ((document.getElementById('dd-stf-sel')||{}).value || '');
    if(!selectedStfId){ toast('지원단을 선택해주세요','warning'); return; }
    const mode = (document.querySelector('input[name="dd-mode"]:checked')||{}).value || 'student';
    let slot = null;
    if(mode==='student'){
      const stu = (db.stu||[]).find(x=>x.id===stuId);
      const idx = parseInt((document.getElementById('dd-stu-slot')||{}).value,10);
      if(isNaN(idx) || idx<0 || !((stu||{}).scd||[])[idx]) slot = {d:'월', s:'14:00', e:'15:00'};
      else slot = Object.assign({}, stu.scd[idx]);
    } else {
      const d = (document.getElementById('dd-day')||{}).value;
      const s = (document.getElementById('dd-s')||{}).value;
      const e = (document.getElementById('dd-e')||{}).value;
      const dt = (document.getElementById('dd-date')||{}).value;
      if(!s || !e){ toast('시간을 입력해주세요','warning'); return; }
      slot = {d:d, s:s, e:e}; if(dt) slot.date = dt;
    }
    const newMat = { id:(typeof uid==='function'?uid():'m_'+Date.now()), stfId:selectedStfId, stuId:stuId, slots:[slot], st:'active', logs:[], createdAt:Date.now(), manual:true };
    db.mat = db.mat || []; db.mat.push(newMat);
    try{ if(typeof save==='function') await save('mat', newMat); }catch(e){ console.warn(e); }
    if(bg) bg.remove();
    toast('수동매칭 완료: '+slot.d+' '+slot.s+'~'+slot.e,'success');
    if(typeof renMatch==='function') renMatch();
    if(typeof refreshDashboard==='function') refreshDashboard();
  };

  // supporter-based verification with day badges/subtotals/calendar
  window.loadVerify = function(){
    const ymEl = document.getElementById('ver-month');
    const filterEl = document.getElementById('ver-filter');
    const areaEl = document.getElementById('ver-area');
    if(!areaEl) return;
    const ym = (ymEl && ymEl.value) || (typeof thisMonth==='function' ? thisMonth() : new Date().toISOString().slice(0,7));
    if(ymEl && !ymEl.value) ymEl.value = ym;
    const filter = (filterEl && filterEl.value) || 'pending';
    try { if(typeof buildIndex==='function') buildIndex(); } catch(e){}
    const byStf = {}; let totalLogs = 0;
    (db.mat||[]).forEach(m=>{
      (m.logs||[]).forEach(l=>{
        try { if(typeof ensureLogFields==='function') ensureLogFields(l, m); } catch(e){}
        if(!(l.date||'').startsWith(ym)) return;
        const s = l.status || 'conducted';
        if(filter !== 'all'){
          if(filter==='pending' && s!=='conducted') return;
          if(filter==='verified' && s!=='verified' && s!=='paid') return;
          if(filter==='rejected' && s!=='rejected') return;
        }
        if(!byStf[m.stfId]) byStf[m.stfId] = {logs:[], pendingCnt:0, verifiedCnt:0};
        byStf[m.stfId].logs.push({m,l}); totalLogs++;
        if(s==='conducted') byStf[m.stfId].pendingCnt++;
        else if(s==='verified' || s==='paid') byStf[m.stfId].verifiedCnt++;
      });
    });
    if(totalLogs===0){ areaEl.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted)">해당 월에 조건과 일치하는 실적이 없습니다</div>'; return; }
    const stfIds = Object.keys(byStf).sort((a,b)=>{
      const na = (window.IDX&&IDX.stfById&&IDX.stfById[a]) ? IDX.stfById[a].nm : '';
      const nb = (window.IDX&&IDX.stfById&&IDX.stfById[b]) ? IDX.stfById[b].nm : '';
      return String(na).localeCompare(String(nb));
    });
    let html = `<div style="font-size:12px; color:var(--muted); margin-bottom:12px">👤 <b>개인별 월단위 검증</b> · 총 ${stfIds.length}명의 지원단 실적이 검색되었습니다.</div>`;
    stfIds.forEach(sid=>{
      const stf = (window.IDX && IDX.stfById) ? IDX.stfById[sid] : null;
      const stfName = stf ? stf.nm : '알 수 없음';
      const group = byStf[sid];
      group.logs.sort((a,b)=> (String(a.l.date)+String(a.l.time)).localeCompare(String(b.l.date)+String(b.l.time)));
      const dayMeta = dayLabelMap(group.logs);
      const activeDays = Object.keys(dayMeta).length;
      let currentDate = '';
      let rowsHtml = '';
      group.logs.forEach(r=>{
        const stu = (window.IDX && IDX.stuById) ? IDX.stuById[r.m.stuId] : null;
        const amt = r.l.amount || (typeof calcLogAmount==='function' ? calcLogAmount(r.l) : 0);
        const s = r.l.status || 'conducted';
        const stColor = s==='verified'||s==='paid'?'bg-yes':(s==='rejected'?'bg-danger':(s==='canceled'?'bg-no':'bg-info'));
        const stLbl = ({conducted:'미검증',verified:'✅승인',rejected:'❌반려',canceled:'취소',paid:'지급완료'})[s] || s;
        const kindLbl = (r.l.kind||r.m.kind)==='class' ? '수업협력' : '학습코칭';
        const subject = stu ? stu.nm : (((r.m.classInfo||{}).gr||'') ? ('🏫 '+((r.m.classInfo||{}).gr||'')+'-'+((r.m.classInfo||{}).cls||'')+'반') : '-');
        if(currentDate !== r.l.date){
          currentDate = r.l.date;
          const meta = dayMeta[currentDate] || {count:0, amount:0};
          rowsHtml += `<tr><td colspan="9" style="background:#f8fafc; font-weight:700; color:#334155">── ${esc(currentDate)} (${meta.count}건, ${typeof formatMoney==='function'?formatMoney(meta.amount):meta.amount}원) ──</td></tr>`;
        }
        rowsHtml += `<tr>
          <td class="center"><input type="checkbox" class="ver-chk-${sid}" data-mat="${r.m.id}" data-log="${r.l.id}"></td>
          <td>${esc(r.l.date||'')}</td>
          <td>${esc(subject)}</td>
          <td>${kindLbl}</td>
          <td>${esc(r.l.time||'')}</td>
          <td style="font-size:12px">${esc(r.l.topic||r.l.content||'')}</td>
          <td class="ar">${s==='canceled'?'-':(typeof formatMoney==='function' ? formatMoney(amt) : String(amt))}</td>
          <td><span class="badge ${stColor}">${stLbl}</span></td>
          <td>${s==='conducted' ? `<button class="btn btn-xs btn-success" onclick="verifyOne('${r.m.id}','${r.l.id}','verified')">승인</button> <button class="btn btn-xs btn-danger" onclick="verifyOne('${r.m.id}','${r.l.id}','rejected')">반려</button>` : `<button class="btn btn-xs btn-outline" onclick="verifyOne('${r.m.id}','${r.l.id}','conducted')">되돌림</button>`}</td>
        </tr>`;
      });
      const panelId = 'ver-p-' + sid;
      html += `<div style="border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px; overflow:hidden">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; cursor:pointer" onclick="document.getElementById('${panelId}').style.display = document.getElementById('${panelId}').style.display==='none'?'block':'none'">
          <div>
            <b style="font-size:15px; color:var(--text)">${esc(stfName)}</b>
            <span class="badge bg-info" style="margin-left:8px">총 ${group.logs.length}건</span>
            ${group.pendingCnt > 0 ? `<span class="badge" style="background:#fde68a; color:#92400e; margin-left:4px">미검증 ${group.pendingCnt}</span>` : ''}
            ${group.verifiedCnt > 0 ? `<span class="badge bg-yes" style="margin-left:4px">승인 ${group.verifiedCnt}</span>` : ''}
            <span class="badge" style="background:#e0e7ff; color:#3730a3; margin-left:4px">📅 활동일 ${activeDays}일</span>
          </div>
          <div style="display:flex; gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-xs btn-outline" onclick="document.querySelectorAll('.ver-chk-${sid}').forEach(c=>c.checked=true)">전체선택</button>
            <button class="btn btn-xs btn-outline" onclick="document.querySelectorAll('.ver-chk-${sid}').forEach(c=>c.checked=false)">해제</button>
            <button class="btn btn-xs btn-success" onclick="window.bulkVerifyByStf('${sid}','verified')">✅ 선택항목 일괄 승인</button>
          </div>
        </div>
        <div id="${panelId}" style="display:${group.pendingCnt > 0 ? 'block' : 'none'}; padding:0">
          ${buildMiniCalendar(ym, group.logs)}
          <table class="tbl" style="margin:0">
            <thead><tr><th style="width:30px">선택</th><th>날짜</th><th>학생/학급</th><th>유형</th><th>시간</th><th>지도내용</th><th>금액</th><th>상태</th><th>개별작업</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
    });
    areaEl.innerHTML = html;
  };

  window.bulkVerifyByStf = async function(sid, newStatus){
    const chks = document.querySelectorAll('.ver-chk-' + sid);
    const allPending = [];
    chks.forEach(c=>{
      if(!c.checked) return;
      const m = (db.mat||[]).find(x=>x.id===c.dataset.mat); if(!m) return;
      const l = (m.logs||[]).find(x=>x.id===c.dataset.log); if(!l) return;
      if(l.status !== 'conducted') return;
      allPending.push({m,l});
    });
    if(allPending.length===0){ toast('선택된 미검증 실적이 없습니다','warning'); return; }
    const label = newStatus === 'verified' ? '승인' : '반려';
    if(!confirm('선택된 미검증 실적 '+allPending.length+'건을 "'+label+'" 처리하시겠습니까?')) return;
    const doneMats = new Set();
    for(const pair of allPending){
      const m = pair.m, l = pair.l;
      l.status = newStatus;
      if(newStatus === 'verified'){
        l.verifiedBy = (db.cfg && db.cfg.confirmer) || '담당 장학사';
        l.verifiedAt = Date.now();
        if(!l.amount && typeof calcLogAmount==='function') l.amount = calcLogAmount(l);
      }
      if(!doneMats.has(m.id)){
        try { if(typeof save==='function') await save('mat', m); } catch(e){}
        doneMats.add(m.id);
      }
    }
    toast(allPending.length + '건 ' + label + ' 완료','success');
    window.loadVerify();
    if(typeof refreshDashboard==='function') refreshDashboard();
  };

  window.refreshPayStfSelect = function(){
    const sel = document.getElementById('pay-stf-sel');
    if(!sel) return;
    const ym = (document.getElementById('pay-ym') && document.getElementById('pay-ym').value) || (typeof thisMonth==='function' ? thisMonth() : new Date().toISOString().slice(0,7));
    if(document.getElementById('pay-ym') && !document.getElementById('pay-ym').value) document.getElementById('pay-ym').value = ym;
    const settleData = typeof buildSettleData==='function' ? buildSettleData(ym) : {};
    const active = (db.stf||[]).filter(s=>s.st==='active').sort((a,b)=>String(a.nm||'').localeCompare(String(b.nm||'')));
    sel.innerHTML = '<option value="">(지원단을 선택하세요)</option>' + active.map(s=>{
      const d = settleData[s.id];
      const hasData = !!(d && ((d.coach||[]).length + (d.cls||[]).length + (d.travel||[]).length > 0));
      return `<option value="${s.id}" ${hasData?'':'style="color:#9ca3af"'}>${esc(s.nm)}${hasData?'':' (실적없음)'}</option>`;
    }).join('');
    if(!sel.value){
      const firstWithData = active.find(s=>{ const d = settleData[s.id]; return d && ((d.coach||[]).length + (d.cls||[]).length + (d.travel||[]).length > 0); });
      if(firstWithData) sel.value = firstWithData.id;
    }
  };

  window.renderPaySlip = function(){
    const stfId = (document.getElementById('pay-stf-sel')||{}).value;
    const ym = (document.getElementById('pay-ym')||{}).value || (typeof thisMonth==='function' ? thisMonth() : new Date().toISOString().slice(0,7));
    if(!stfId || !ym){ toast('지원단과 월을 선택하세요','warning'); return; }
    const data = typeof buildSettleData==='function' ? (buildSettleData(ym)[stfId]) : null;
    if(!data || ((data.coach||[]).length + (data.cls||[]).length + (data.travel||[]).length === 0)){
      toast(`${ym} 기준 승인된 실적이 없습니다. 먼저 실적검증을 완료하세요.`, 'warning');
      return;
    }
    document.getElementById('pay-slip-area').innerHTML = buildPaySlipHtml(stfId, ym);
  };

  // keep T8 selector synced to month changes
  window.addEventListener('load', function(){
    setTimeout(function(){
      const payYm = document.getElementById('pay-ym');
      if(payYm && !payYm.dataset.boundV113){
        payYm.dataset.boundV113 = '1';
        payYm.addEventListener('change', function(){ try { window.refreshPayStfSelect(); } catch(e){} });
      }
      const title = document.querySelector('title'); if(title) title.textContent = '🎓 학습클리닉 통합관리 V11.4';
      const hdr = document.getElementById('hdr-sub'); if(hdr) hdr.textContent = 'V11.4 · 충북종합학습클리닉 업무관리 프로그램 · Modular Edition';
      const loginSub = document.querySelector('#login-overlay p span'); if(loginSub) loginSub.textContent = 'V11.4 Stability Edition';
    }, 250);
  });

})();


/* =================================================================
 * V11.4 record-entry patch
 * ================================================================= */
(function(){
  window.refreshRecStfSelect = function() {
    const sel = document.getElementById('rec-stf-sel');
    if (!sel) return;
    const active = (db.stf || []).filter(s => s.st === 'active').sort((a, b) => String(a.nm||'').localeCompare(String(b.nm||'')));
    sel.innerHTML = '<option value="">(지원단 선택)</option>' + active.map(s => `<option value="${s.id}">${esc(s.nm)}</option>`).join('');
    const m = document.getElementById('rec-month');
    if (m && !m.value) m.value = typeof thisMonth === 'function' ? thisMonth() : new Date().toISOString().slice(0, 7);
  };

  window.loadStfRecord = function() {
    const stfId = (document.getElementById('rec-stf-sel') || {}).value;
    const ym    = (document.getElementById('rec-month') || {}).value;
    const area  = document.getElementById('rec-area');
    if (!area) return;
    if (!stfId || !ym) {
      area.innerHTML = '<div style="padding:30px;text-align:center;color:var(--muted)">지원단과 월을 선택하세요.</div>';
      return;
    }
    try { if (typeof buildIndex === 'function') buildIndex(); } catch(e){}

    const stf = (db.stf || []).find(s => s.id === stfId);
    const rows = [];
    (db.mat || []).forEach(m => {
      if (m.stfId !== stfId) return;
      (m.logs || []).forEach(l => {
        try { if (typeof ensureLogFields === 'function') ensureLogFields(l, m); } catch(e){}
        if (!(l.date || '').startsWith(ym)) return;
        const stu = (window.IDX && IDX.stuById) ? IDX.stuById[m.stuId] : null;
        rows.push({ m, l, stu });
      });
    });

    rows.sort((a, b) => (String(a.l.date) + String(a.l.time)).localeCompare(String(b.l.date) + String(b.l.time)));

    if (rows.length === 0) {
      area.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted)">${ym} ${stf ? esc(stf.nm) : ''} 님의 실적이 없습니다.<br><button class="btn btn-success btn-sm" style="margin-top:12px" onclick="openAddRecModal()">+ 실적 추가</button></div>`;
      return;
    }

    const totalAmt = rows.reduce((s, r) => {
      const st = r.l.status || 'conducted';
      return s + (st === 'canceled' ? 0 : (r.l.amount || (typeof calcLogAmount === 'function' ? calcLogAmount(r.l) : 0)));
    }, 0);

    const tbody = rows.map(({ m, l, stu }) => {
      const st = l.status || 'conducted';
      const stColor = st === 'verified' || st === 'paid' ? 'bg-yes' : st === 'rejected' ? 'bg-danger' : st === 'canceled' ? 'bg-no' : 'bg-info';
      const stLbl = ({ conducted: '미검증', verified: '✅승인', rejected: '❌반려', canceled: '취소', paid: '지급완료' })[st] || st;
      const kindLbl = (l.kind || m.kind) === 'class' ? '수업협력' : '학습코칭';
      const subjectNm = stu ? stu.nm : (((m.classInfo || {}).gr) ? `🏫 ${(m.classInfo || {}).gr}-${(m.classInfo || {}).cls}반` : '-');
      const amt = st === 'canceled' ? '-' : (typeof formatMoney === 'function' ? formatMoney(l.amount || (typeof calcLogAmount === 'function' ? calcLogAmount(l) : 0)) : String(l.amount || 0));
      const canEdit = (st === 'conducted');
      return `<tr>
        <td>${esc(l.date || '')}</td>
        <td>${esc(l.time || '')}</td>
        <td>${esc(subjectNm)}</td>
        <td>${kindLbl}</td>
        <td style="font-size:12px">${esc(l.topic || l.content || '')}</td>
        <td class="ar">${amt}</td>
        <td><span class="badge ${stColor}">${stLbl}</span></td>
        <td>${canEdit ? `<button class="btn btn-xs btn-outline" onclick="openEditRecModal('${m.id}','${l.id}')">✏️ 수정</button> <button class="btn btn-xs btn-danger" onclick="deleteRec('${m.id}','${l.id}')">🗑</button>` : `<button class="btn btn-xs btn-outline" onclick="openEditRecModal('${m.id}','${l.id}')">🔍 보기</button>`}</td>
      </tr>`;
    }).join('');

    area.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:13px;color:var(--muted)">총 <b>${rows.length}</b>건 / 합계 <b style="color:var(--primary)">${typeof formatMoney === 'function' ? formatMoney(totalAmt) : totalAmt}원</b> (미검증 기준)</span>
      </div>
      <table class="tbl">
        <thead><tr><th>날짜</th><th>시간</th><th>학생/학급</th><th>유형</th><th>지도내용</th><th>금액</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
  };

  window.openAddRecModal = function() {
    const stfId = (document.getElementById('rec-stf-sel') || {}).value;
    const ym    = (document.getElementById('rec-month') || {}).value || '';
    if (!stfId) { toast('지원단을 먼저 선택하세요', 'warning'); return; }
    try { if (typeof buildIndex === 'function') buildIndex(); } catch(e){}
    const mats = (db.mat || []).filter(m => m.stfId === stfId && m.st === 'active');
    const matOpts = mats.map(m => {
      const stu = (window.IDX && IDX.stuById) ? IDX.stuById[m.stuId] : null;
      const label = m.kind === 'class' ? `[수업협력] ${(m.classInfo || {}).sc || ''} ${(m.classInfo || {}).gr || ''}-${(m.classInfo || {}).cls || ''}반` : `[학습코칭] ${stu ? stu.nm : '(알 수 없음)'}`;
      return `<option value="${m.id}">${esc(label)}</option>`;
    }).join('');
    const today = ym ? ym + '-01' : new Date().toISOString().slice(0, 10);
    const bg = document.createElement('div');
    bg.className = 'modal-bg show';
    bg.innerHTML = `<div class="modal" style="max-width:520px">
      <div class="modal-header"><div class="modal-title">📝 실적 추가</div><button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button></div>
      <div style="padding:16px; display:flex; flex-direction:column; gap:12px">
        <div class="form-group"><label>매칭 선택 *</label><select id="add-rec-mat" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"><option value="">-- 매칭 선택 --</option>${matOpts}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group"><label>날짜 *</label><input type="date" id="add-rec-date" value="${today}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div>
          <div class="form-group"><label>시간 (예: 14:00~15:00)</label><input type="text" id="add-rec-time" placeholder="14:00~15:00" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div>
        </div>
        <div class="form-group"><label>지도 내용</label><input type="text" id="add-rec-topic" placeholder="예: 한글 자모음 학습" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div>
        <div class="form-group"><label>상태</label><select id="add-rec-status" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"><option value="conducted">실시</option><option value="canceled">취소</option></select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px"><button class="btn btn-outline btn-sm" onclick="this.closest('.modal-bg').remove()">취소</button><button class="btn btn-primary btn-sm" onclick="saveAddRec(this)">💾 저장</button></div>
      </div>
    </div>`;
    document.body.appendChild(bg);
  };

  window.saveAddRec = async function(btn) {
    const matId  = (document.getElementById('add-rec-mat') || {}).value;
    const date   = (document.getElementById('add-rec-date') || {}).value;
    const time   = ((document.getElementById('add-rec-time') || {}).value || '').trim();
    const topic  = ((document.getElementById('add-rec-topic') || {}).value || '').trim();
    const status = (document.getElementById('add-rec-status') || {}).value || 'conducted';
    if (!matId || !date) { toast('매칭과 날짜는 필수입니다', 'warning'); return; }
    const m = (db.mat || []).find(x => x.id === matId);
    if (!m) { toast('매칭 정보를 찾을 수 없습니다', 'danger'); return; }
    const stu = (window.IDX && IDX.stuById) ? IDX.stuById[m.stuId] : null;
    const minutes = m.kind === 'class' ? (typeof classSessionMinutes === 'function' ? classSessionMinutes((stu || {}).scType || '초') : 40) : 50;
    const log = { id: typeof uid === 'function' ? uid() : ('l_' + Date.now()), date, time, topic: topic || (status === 'canceled' ? '(취소)' : '학습지도'), status, kind: m.kind || 'coach', minutes };
    if (status !== 'canceled' && typeof calcLogAmount === 'function') log.amount = calcLogAmount(log);
    m.logs = m.logs || [];
    m.logs.push(log);
    if (typeof save === 'function') await save('mat', m);
    btn.closest('.modal-bg').remove();
    toast('실적이 추가되었습니다', 'success');
    loadStfRecord();
    if (typeof refreshDashboard === 'function') refreshDashboard();
  };

  window.openEditRecModal = function(matId, logId) {
    const m = (db.mat || []).find(x => x.id === matId);
    const l = m ? (m.logs || []).find(x => x.id === logId) : null;
    if (!m || !l) { toast('실적 정보를 찾을 수 없습니다', 'danger'); return; }
    const canEdit = (l.status === 'conducted');
    const bg = document.createElement('div');
    bg.className = 'modal-bg show';
    bg.innerHTML = `<div class="modal" style="max-width:480px">
      <div class="modal-header"><div class="modal-title">${canEdit ? '✏️ 실적 수정' : '🔍 실적 보기'}</div><button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button></div>
      <div style="padding:16px; display:flex; flex-direction:column; gap:12px">
        ${canEdit ? `<div style="padding:8px;background:#fef3c7;border-radius:6px;font-size:12px;color:#92400e">⚠️ 미검증 상태에서만 수정 가능합니다. 승인 후에는 수정되지 않습니다.</div>` : `<div style="padding:8px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#64748b">🔒 이미 검증된 실적은 읽기 전용입니다.</div>`}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group"><label>날짜 *</label><input type="date" id="edit-rec-date" value="${esc(l.date || '')}" ${canEdit ? '' : 'disabled'} style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div>
          <div class="form-group"><label>시간</label><input type="text" id="edit-rec-time" value="${esc(l.time || '')}" placeholder="14:00~15:00" ${canEdit ? '' : 'disabled'} style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div>
        </div>
        <div class="form-group"><label>지도 내용</label><input type="text" id="edit-rec-topic" value="${esc(l.topic || l.content || '')}" ${canEdit ? '' : 'disabled'} style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px"><button class="btn btn-outline btn-sm" onclick="this.closest('.modal-bg').remove()">닫기</button>${canEdit ? `<button class="btn btn-primary btn-sm" onclick="saveEditRec('${matId}','${logId}',this)">💾 저장</button>` : ''}</div>
      </div>
    </div>`;
    document.body.appendChild(bg);
  };

  window.saveEditRec = async function(matId, logId, btn) {
    const m = (db.mat || []).find(x => x.id === matId);
    const l = m ? (m.logs || []).find(x => x.id === logId) : null;
    if (!m || !l) { toast('실적을 찾을 수 없습니다', 'danger'); return; }
    if (l.status !== 'conducted') { toast('검증된 실적은 수정할 수 없습니다', 'warning'); return; }
    const newDate  = (document.getElementById('edit-rec-date') || {}).value;
    const newTime  = ((document.getElementById('edit-rec-time') || {}).value || '').trim();
    const newTopic = ((document.getElementById('edit-rec-topic') || {}).value || '').trim();
    if (!newDate) { toast('날짜는 필수입니다', 'warning'); return; }
    l.date  = newDate; l.time = newTime; l.topic = newTopic || l.topic;
    if (typeof calcLogAmount === 'function') l.amount = calcLogAmount(l);
    if (typeof save === 'function') await save('mat', m);
    btn.closest('.modal-bg').remove();
    toast('수정되었습니다', 'success');
    loadStfRecord();
  };

  window.deleteRec = async function(matId, logId) {
    const m = (db.mat || []).find(x => x.id === matId);
    const l = m ? (m.logs || []).find(x => x.id === logId) : null;
    if (!m || !l) return;
    if (l.status !== 'conducted') { toast('검증된 실적은 삭제할 수 없습니다', 'warning'); return; }
    if (!confirm('이 실적을 삭제하시겠습니까?')) return;
    m.logs = (m.logs || []).filter(x => x.id !== logId);
    if (typeof save === 'function') await save('mat', m);
    toast('삭제되었습니다', 'success');
    loadStfRecord();
    if (typeof refreshDashboard === 'function') refreshDashboard();
  };

  const _origGoSubT5_v114 = window.goSubT5;
  window.goSubT5 = function(key, btn) {
    if (typeof _origGoSubT5_v114 === 'function') _origGoSubT5_v114(key, btn);
    if (key === 'record') {
      window.refreshRecStfSelect();
      window.loadStfRecord();
    }
  };

  const _origGoTab_v114 = window.goTab;
  window.goTab = function(id, btn) {
    if (typeof _origGoTab_v114 === 'function') _origGoTab_v114(id, btn);
    if (id === 't5') {
      setTimeout(function() {
        window.refreshRecStfSelect();
        const rm = document.getElementById('rec-month');
        if (rm && !rm.value) rm.value = typeof thisMonth === 'function' ? thisMonth() : new Date().toISOString().slice(0,7);
      }, 50);
    }
  };
})();


/* =================================================================
 * V11.6 Statistics & Edit Sync Patch
 * - slot-based verification rows including scheduled(unentered) items
 * - quick record add from verify screen
 * ================================================================= */
(function(){
  'use strict';

  window.buildMiniCalendar = window.buildMiniCalendar || function(ym, logs){
    const [yy, mm] = String(ym||'').split('-').map(n=>parseInt(n,10));
    if(!yy || !mm) return '';
    const first = new Date(yy, mm-1, 1);
    const firstDow = first.getDay();
    const lastDay = new Date(yy, mm, 0).getDate();
    const byDay = {};
    (logs||[]).forEach(r=>{
      const d = parseInt(String((r.l&&r.l.date)||'').split('-')[2]||'0',10);
      if(!d) return;
      if(!byDay[d]) byDay[d] = {count:0,pending:0};
      byDay[d].count += 1;
      const st = (r.l&&r.l.status) || 'conducted';
      if(st === 'conducted' || st === 'scheduled') byDay[d].pending += 1;
    });
    let cells = '';
    const week = ['일','월','화','수','목','금','토'];
    cells += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;font-size:11px;margin-bottom:4px">'+week.map(d=>'<div style="text-align:center;color:#64748b;font-weight:600">'+d+'</div>').join('')+'</div>';
    cells += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
    for(let i=0;i<firstDow;i++) cells += '<div></div>';
    for(let d=1; d<=lastDay; d++){
      const meta = byDay[d];
      let bg = '#fff', bd = '#e5e7eb', color = '#334155';
      if(meta){
        if(meta.pending>0){ bg='#fef3c7'; bd='#f59e0b'; color='#92400e'; }
        else { bg='#dcfce7'; bd='#22c55e'; color='#166534'; }
      }
      const badge = meta ? '<div style="font-size:9px;line-height:1;margin-top:2px">'+meta.count+'건</div>' : '<div style="font-size:9px;line-height:1;margin-top:2px;color:#cbd5e1">·</div>';
      const title = meta ? (ym+'-'+String(d).padStart(2,'0')+' / '+meta.count+'건'+(meta.pending>0?' / 미처리 '+meta.pending+'건':'')) : (ym+'-'+String(d).padStart(2,'0'));
      cells += '<div title="'+title+'" style="border:1px solid '+bd+';background:'+bg+';color:'+color+';border-radius:6px;padding:4px 2px;text-align:center;min-height:34px">'
             + '<div style="font-weight:700">'+d+'</div>'+badge+'</div>';
    }
    cells += '</div>';
    return '<div style="margin:10px 14px 14px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff">'
         + '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#334155">📅 '+ym+' 활동일 미니뷰</div>'+cells+'</div>';
  };

  window.loadVerify = function() {
    const ymEl = document.getElementById('ver-month');
    const filterEl = document.getElementById('ver-filter');
    const areaEl = document.getElementById('ver-area');
    if (!areaEl) return;
    const ym = (ymEl && ymEl.value) || (typeof thisMonth === 'function' ? thisMonth() : new Date().toISOString().slice(0, 7));
    if (ymEl && !ymEl.value) ymEl.value = ym;
    const filter = (filterEl && filterEl.value) || 'pending';
    try { if (typeof buildIndex === 'function') buildIndex(); } catch(e) {}

    const byStf = {};
    (db.mat || []).forEach(m => {
      if (m.st !== 'active') return;
      (m.slots || []).forEach(slot => {
        const dates = typeof getDatesForDayInMonth === 'function' ? getDatesForDayInMonth(ym, slot.d) : [];
        dates.forEach(date => {
          const existingLog = (m.logs || []).find(l => l.date === date && (l.time || '').includes(slot.s));
          const logEntry = existingLog
            ? (() => { if (typeof ensureLogFields === 'function') ensureLogFields(existingLog, m); return existingLog; })()
            : { id:null, date:date, time:`${slot.s}~${slot.e}`, topic:'', status:'scheduled', kind:m.kind || 'coach', minutes:m.kind === 'class' ? (typeof classSessionMinutes === 'function' ? classSessionMinutes(((IDX.stuById||{})[m.stuId] || {}).scType || '초') : 40) : 50 };
          const s = logEntry.status;
          if (filter !== 'all') {
            if (filter === 'pending' && s !== 'conducted' && s !== 'scheduled') return;
            if (filter === 'verified' && s !== 'verified' && s !== 'paid') return;
            if (filter === 'rejected' && s !== 'rejected') return;
          }
          if (!byStf[m.stfId]) byStf[m.stfId] = { rows: [], pendingCnt: 0, verifiedCnt: 0 };
          byStf[m.stfId].rows.push({ m, l: logEntry, slot, isScheduled: !existingLog });
          if (s === 'conducted' || s === 'scheduled') byStf[m.stfId].pendingCnt++;
          else if (s === 'verified' || s === 'paid') byStf[m.stfId].verifiedCnt++;
        });
      });
    });

    const totalRows = Object.values(byStf).reduce((s, g) => s + g.rows.length, 0);
    if (totalRows === 0) {
      areaEl.innerHTML = '<div style="padding:30px; text-align:center; color:var(--muted)">해당 월에 조건과 일치하는 매칭 일정이 없습니다</div>';
      return;
    }

    const stfIds = Object.keys(byStf).sort((a, b) => {
      const na = (IDX.stfById && IDX.stfById[a]) ? IDX.stfById[a].nm : '';
      const nb = (IDX.stfById && IDX.stfById[b]) ? IDX.stfById[b].nm : '';
      return String(na).localeCompare(String(nb));
    });

    let html = `<div style="font-size:12px; color:var(--muted); margin-bottom:12px">👤 <b>지원단별 월단위 검증</b> · ${stfIds.length}명 · 슬롯 기준 예정일 전체 표시</div>`;

    stfIds.forEach(sid => {
      const stf = IDX.stfById && IDX.stfById[sid];
      const group = byStf[sid];
      group.rows.sort((a, b) => (String(a.l.date) + String(a.l.time)).localeCompare(String(b.l.date) + String(b.l.time)));
      const activeDays = new Set(group.rows.map(r => r.l.date)).size;
      let currentDate = '';
      let rowsHtml = '';
      group.rows.forEach(r => {
        const m = r.m, l = r.l, isScheduled = r.isScheduled;
        const stu = IDX.stuById && IDX.stuById[m.stuId];
        const s = l.status;
        const amt = (s === 'canceled' || s === 'scheduled') ? '-' : (typeof formatMoney === 'function' ? formatMoney(l.amount || (typeof calcLogAmount === 'function' ? calcLogAmount(l) : 0)) : String(l.amount || 0));
        const stColor = s === 'verified' || s === 'paid' ? 'bg-yes' : s === 'rejected' ? 'bg-danger' : s === 'canceled' ? 'bg-no' : s === 'scheduled' ? '' : 'bg-info';
        const stLbl = ({ conducted: '미검증', verified: '✅승인', rejected: '❌반려', canceled: '취소', paid: '지급완료', scheduled: '📅미입력' })[s] || s;
        const kindLbl = (l.kind || m.kind) === 'class' ? '수업협력' : '학습코칭';
        const subject = stu ? stu.nm : (((m.classInfo || {}).gr) ? `🏫 ${(m.classInfo || {}).gr}-${(m.classInfo || {}).cls}반` : '-');
        if (currentDate !== l.date) {
          currentDate = l.date;
          rowsHtml += `<tr><td colspan="9" style="background:#f8fafc; font-weight:700; color:#334155; padding:6px 12px">── ${esc(l.date)} (${['일','월','화','수','목','금','토'][new Date(l.date).getDay()]}요일) ──</td></tr>`;
        }
        let actionHtml = '';
        if (isScheduled) actionHtml = `<button class="btn btn-xs btn-primary" onclick="openQuickRecFromVerify('${m.id}','${l.date}','${l.time}')">+ 실적 등록</button>`;
        else if (s === 'conducted') actionHtml = `<button class="btn btn-xs btn-outline" onclick="openEditRecModal('${m.id}','${l.id}')">✏️</button> <button class="btn btn-xs btn-success" onclick="verifyOne('${m.id}','${l.id}','verified')">승인</button> <button class="btn btn-xs btn-danger" onclick="verifyOne('${m.id}','${l.id}','rejected')">반려</button>`;
        else actionHtml = `<button class="btn btn-xs btn-outline" onclick="verifyOne('${m.id}','${l.id}','conducted')">되돌림</button>`;
        const chkHtml = l.id ? `<input type="checkbox" class="ver-chk-${sid}" data-mat="${m.id}" data-log="${l.id}">` : `<input type="checkbox" disabled title="실적 미입력">`;
        rowsHtml += `<tr style="${isScheduled ? 'opacity:0.5' : ''}"><td class="center">${chkHtml}</td><td>${esc(l.date || '')}</td><td>${esc(subject)}</td><td>${kindLbl}</td><td>${esc(l.time || '')}</td><td style="font-size:12px">${esc(l.topic || l.content || (isScheduled ? '(미입력)' : ''))}</td><td class="ar">${amt}</td><td><span class="badge ${stColor}" style="${s==='scheduled'?'background:#e5e7eb;color:#6b7280':''}">${stLbl}</span></td><td>${actionHtml}</td></tr>`;
      });
      const panelId = 'ver-p-' + sid;
      html += `<div style="border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px; overflow:hidden"><div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; cursor:pointer" onclick="var p=document.getElementById('${panelId}'); p.style.display=p.style.display==='none'?'block':'none'"><div><b style="font-size:15px">${esc(stf ? stf.nm : '알 수 없음')}</b><span class="badge bg-info" style="margin-left:8px">총 ${group.rows.length}건</span>${group.pendingCnt > 0 ? `<span class="badge" style="background:#fde68a;color:#92400e;margin-left:4px">미처리 ${group.pendingCnt}</span>` : ''}${group.verifiedCnt > 0 ? `<span class="badge bg-yes" style="margin-left:4px">승인 ${group.verifiedCnt}</span>` : ''}<span class="badge" style="background:#e0e7ff;color:#3730a3;margin-left:4px">📅 ${activeDays}일</span></div><div style="display:flex; gap:6px" onclick="event.stopPropagation()"><button class="btn btn-xs btn-outline" onclick="document.querySelectorAll('.ver-chk-${sid}').forEach(c=>c.checked=true)">전체선택</button><button class="btn btn-xs btn-outline" onclick="document.querySelectorAll('.ver-chk-${sid}').forEach(c=>c.checked=false)">해제</button><button class="btn btn-xs btn-success" onclick="window.bulkVerifyByStf('${sid}','verified')">✅ 일괄 승인</button></div></div><div id="${panelId}" style="display:${group.pendingCnt > 0 ? 'block' : 'none'}; padding:0">${typeof window.buildMiniCalendar === 'function' ? window.buildMiniCalendar(ym, group.rows.map(r => ({m:r.m, l:r.l}))) : ''}<table class="tbl" style="margin:0"><thead><tr><th style="width:30px">선택</th><th>날짜</th><th>학생/학급</th><th>유형</th><th>시간</th><th>지도내용</th><th>금액</th><th>상태</th><th>관리</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
    });
    areaEl.innerHTML = html;
  };

  window.openQuickRecFromVerify = function(matId, date, time) {
    const m = (db.mat || []).find(x => x.id === matId);
    if (!m) return;
    const bg = document.createElement('div');
    bg.className = 'modal-bg show';
    bg.innerHTML = `<div class="modal" style="max-width:440px"><div class="modal-header"><div class="modal-title">📝 실적 등록</div><button class="modal-close" onclick="this.closest('.modal-bg').remove()">×</button></div><div style="padding:16px; display:flex; flex-direction:column; gap:12px"><div style="display:grid; grid-template-columns:1fr 1fr; gap:10px"><div class="form-group"><label>날짜</label><input type="date" id="qrec-date" value="${date}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div><div class="form-group"><label>시간</label><input type="text" id="qrec-time" value="${time}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div></div><div class="form-group"><label>지도 내용</label><input type="text" id="qrec-topic" placeholder="예: 한글 자모음 학습" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"></div><div class="form-group"><label>상태</label><select id="qrec-status" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"><option value="conducted">실시</option><option value="canceled">취소</option></select></div><div style="display:flex; gap:8px; justify-content:flex-end"><button class="btn btn-outline btn-sm" onclick="this.closest('.modal-bg').remove()">취소</button><button class="btn btn-primary btn-sm" onclick="saveQuickRecFromVerify('${matId}', this)">💾 저장</button></div></div></div>`;
    document.body.appendChild(bg);
  };

  window.saveQuickRecFromVerify = async function(matId, btn) {
    const m = (db.mat || []).find(x => x.id === matId);
    const date = (document.getElementById('qrec-date') || {}).value;
    const time = ((document.getElementById('qrec-time') || {}).value || '').trim();
    const topic = ((document.getElementById('qrec-topic') || {}).value || '').trim();
    const status = (document.getElementById('qrec-status') || {}).value || 'conducted';
    if (!m || !date) { toast('날짜는 필수입니다', 'warning'); return; }
    try { if (typeof buildIndex === 'function') buildIndex(); } catch(e) {}
    const stu = (IDX.stuById || {})[m.stuId];
    const minutes = m.kind === 'class' ? (typeof classSessionMinutes === 'function' ? classSessionMinutes((stu || {}).scType || '초') : 40) : 50;
    const log = { id: typeof uid === 'function' ? uid() : ('l_' + Date.now()), date, time, topic: topic || (status === 'canceled' ? '(취소)' : '학습지도'), status, kind: m.kind || 'coach', minutes };
    if (status !== 'canceled' && typeof calcLogAmount === 'function') log.amount = calcLogAmount(log);
    m.logs = m.logs || [];
    m.logs.push(log);
    if (typeof save === 'function') await save('mat', m);
    btn.closest('.modal-bg').remove();
    toast('실적 등록 완료', 'success');
    window.loadVerify();
    if (typeof refreshDashboard === 'function') refreshDashboard();
  };
})();



window.doLogin = doLogin;
window.resetLoginPassword = resetLoginPassword;
window.doLogout = doLogout;
/* V12.3.2 compatibility namespace */
window.ClinicApp = window.ClinicApp || {};
Object.assign(window.ClinicApp, {
  get state(){ return db; },
  set state(v){ db = v; },
  get indexes(){ return IDX; },
  set indexes(v){ IDX = v; },
  buildIndex,
  save,
  saveAll,
  removeItem,
  loadData,
  loadFromLS,
  toast,
  esc,
  uid,
  $, 
  maskName,
  updateStorageBadge,
  sha256,
  toMin,
  toHHMM,
  intersectSlots,
  hasConflict,
  refreshDashboard,
  renderPivots,
  loadVerify,
  openQuickRecFromVerify,
  saveQuickRecFromVerify,
  getDatesForDayInMonth,
  calcLogAmount: (typeof calcLogAmount !== 'undefined' ? calcLogAmount : undefined),
  classSessionMinutes: (typeof classSessionMinutes !== 'undefined' ? classSessionMinutes : undefined),
  formatMoney: (typeof formatMoney !== 'undefined' ? formatMoney : undefined),
  forEachVerifiedLog: (typeof forEachVerifiedLog !== 'undefined' ? forEachVerifiedLog : undefined),
  forEachStatActualLog: (typeof forEachStatActualLog !== 'undefined' ? forEachStatActualLog : undefined),
  inferRegionFromClassInfo: (typeof inferRegionFromClassInfo !== 'undefined' ? inferRegionFromClassInfo : undefined),
  renderRecordView: (typeof loadStfRecord !== 'undefined' ? loadStfRecord : undefined),
  openEditRecModal: (typeof openEditRecModal !== 'undefined' ? openEditRecModal : undefined),
  saveEditRec: (typeof saveEditRec !== 'undefined' ? saveEditRec : undefined),
});
