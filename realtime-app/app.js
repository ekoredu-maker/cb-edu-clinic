'use strict';

const CFG = window.APP_CONFIG || {};
const $app = document.getElementById('app');

const state = {
  demo: !!CFG.demoMode || !CFG.supabaseUrl || !CFG.supabaseAnonKey,
  client: null,
  user: null,
  profile: null,
  role: 'supporter',
  view: 'home',
  plans: [],
  sessions: [],
  assignments: [],
  notices: [],
  requests: [],
  settings: null,
  realtime: null
};

const ROLE_LABEL = {
  supporter: '학습지원단',
  counselor: '학습상담사',
  admin: '행정',
  supervisor: '장학/총괄'
};

const DEMO = {
  profile: {
    id: 'demo-user',
    display_name: '김지원',
    phone: '010-0000-1234',
    roles: ['supporter','counselor','admin','supervisor'],
    identity_verified: true,
    legacy_staff_id: 'demo-stf-01',
    mobile_id_no: 'JCEC-LS-DEMO-0001',
    mobile_id_issued_at: new Date().toISOString(),
    mobile_id_expires_on: null,
    mobile_id_active: true
  },
  assignments: [
    {id:'a1',kind:'coach',student:{id:'s1',full_name:'이민서',alias:'민서',grade:4,class_no:2,school:{name:'의림초등학교'}}},
    {id:'a2',kind:'coach',student:{id:'s2',full_name:'박서준',alias:'서준',grade:5,class_no:1,school:{name:'남당초등학교'}}},
    {id:'a3',kind:'coach',student:{id:'s3',full_name:'최지우',alias:'지우',grade:3,class_no:3,school:{name:'홍광초등학교'}}}
  ],
  plans: [],
  sessions: [],
  notices: [
    {id:'n1',title:'10월 학습지원단 운영 안내',body:'수업 시작·종료는 현장에서 입력해 주세요.',published_at:new Date().toISOString()},
    {id:'n2',title:'지도기록 작성 안내',body:'지도내용은 핵심 내용 위주로 간단하게 기록하면 됩니다.',published_at:new Date(Date.now()-86400000).toISOString()}
  ],
  requests: [
    {id:'r1',request_type:'schedule',reason:'학생 방과후 일정 변경',status:'pending',created_at:new Date().toISOString()}
  ],
  settings: {
    org_name:'제천교육지원청',
    coach_rate:40000,
    class_rate:30000,
    tax_pct:3.3,
    default_location_radius_m:250
  }
};

function seoulDate(date=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function seoulTime(date=new Date()){
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
function isoDow(){
  const d = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})).getDay();
  return d === 0 ? 7 : d;
}
function esc(v=''){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function money(v){ return new Intl.NumberFormat('ko-KR').format(Math.round(Number(v||0)))+'원'; }
function minutesBetween(a,b){
  if(!a||!b) return 0;
  return Math.max(0,Math.round((new Date(b)-new Date(a))/60000));
}
function statusBadge(text,type='neutral'){ return '<span class="status s-'+type+'">'+esc(text)+'</span>'; }
function toast(msg){
  const old=document.querySelector('.toast'); if(old) old.remove();
  const el=document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.appendChild(el);
  setTimeout(()=>el.remove(),2600);
}

function ensureDemoData(){
  if(DEMO.plans.length) return;
  const today=seoulDate(), dow=isoDow();
  DEMO.plans=[
    {id:'p1',assignment_id:'a1',weekday:dow,specific_date:null,planned_start:'14:00',planned_end:'14:50',place:'학습지원실',school:{name:'의림초등학교'},assignment:DEMO.assignments[0]},
    {id:'p2',assignment_id:'a2',weekday:dow,specific_date:null,planned_start:'15:10',planned_end:'16:00',place:'상담실',school:{name:'남당초등학교'},assignment:DEMO.assignments[1]},
    {id:'p3',assignment_id:'a3',weekday:dow===7?1:dow+1,specific_date:null,planned_start:'14:30',planned_end:'15:20',place:'도서실',school:{name:'홍광초등학교'},assignment:DEMO.assignments[2]}
  ];
  DEMO.sessions=[
    {
      id:'sess-demo-done',schedule_plan_id:'p2',assignment_id:'a2',supporter_id:'demo-user',
      student_id:'s2',work_date:today,planned_start_at:today+'T15:10:00+09:00',planned_end_at:today+'T16:00:00+09:00',
      start_at:today+'T15:08:00+09:00',end_at:today+'T16:01:00+09:00',session_status:'completed',
      verification_state:'auto_verified',settlement_state:'pending',verification_reason:'자동검증 통과'
    }
  ];
}

function getRoles(){
  return (state.profile?.roles?.length ? state.profile.roles : ['supporter']).filter(r=>ROLE_LABEL[r]);
}
function navForRole(role){
  const common=[['home','홈','⌂'],['notices','공지','●']];
  if(role==='supporter') return [['home','홈','⌂'],['today','오늘','◷'],['schedule','시간표','▦'],['students','학생','◎'],['records','기록','✎'],['notices','공지','●'],['my','내정보','▣']];
  if(role==='counselor') return [['home','현황','⌂'],['exceptions','예외','!'],['counseling','상담','✎'],['requests','변경요청','⇄'],...common.slice(1)];
  if(role==='admin') return [['home','현황','⌂'],['settlement','정산','₩'],['approvals','승인','✓'],['exceptions','예외','!'],['notices','공지','●'],['settings','설정','⚙']];
  return [['home','현황','⌂'],['stats','통계','▥'],['exceptions','예외','!'],['notices','공지','●'],['settings','설정','⚙']];
}

async function init(){
  ensureDemoData();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  if(state.demo){
    state.profile=structuredClone(DEMO.profile);
    state.user={id:state.profile.id,email:'demo@local'};
    state.assignments=DEMO.assignments;
    state.plans=DEMO.plans;
    state.sessions=DEMO.sessions;
    state.notices=DEMO.notices;
    state.requests=DEMO.requests;
    state.settings=DEMO.settings;
    state.role=localStorage.getItem('clinic-demo-role') || 'supporter';
    renderShell();
    return;
  }

  state.client=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  const {data:{session}}=await state.client.auth.getSession();
  if(!session){ renderLogin(); return; }
  state.user=session.user;
  await loadProfile();
  subscribeRealtime();
  renderShell();
}

function renderLogin(){
  $app.innerHTML='<div class="login"><h2>학습지원단 실시간 운영</h2><p class="muted">교육지원청에서 발급한 계정으로 로그인하세요.</p>'
    +'<div class="field"><label>이메일</label><input id="login-email" type="email" autocomplete="username"></div>'
    +'<div class="field"><label>비밀번호</label><input id="login-password" type="password" autocomplete="current-password"></div>'
    +'<button class="btn btn-primary" style="width:100%" onclick="signIn()">로그인</button><div id="login-msg" class="notice hidden"></div></div>';
}
async function signIn(){
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  const msg=document.getElementById('login-msg');
  const {data,error}=await state.client.auth.signInWithPassword({email,password});
  if(error){msg.textContent=error.message;msg.classList.remove('hidden');return;}
  state.user=data.user; await loadProfile(); subscribeRealtime(); renderShell();
}
async function signOut(){
  if(!state.demo) await state.client.auth.signOut();
  location.reload();
}

async function loadProfile(){
  const {data,error}=await state.client.from('profiles').select('*').eq('id',state.user.id).single();
  if(error) throw error;
  state.profile=data;
  state.role=(data.roles||[])[0]||'supporter';
  await refreshData();
}
async function refreshData(){
  if(state.demo){
    state.sessions=DEMO.sessions; state.plans=DEMO.plans; state.assignments=DEMO.assignments;
    state.notices=DEMO.notices; state.requests=DEMO.requests; state.settings=DEMO.settings;
    return;
  }
  const role=state.role;
  const today=seoulDate();

  const noticesQ=await state.client.from('notices').select('*').eq('published',true).order('published_at',{ascending:false}).limit(20);
  state.notices=noticesQ.data||[];

  if(role==='supporter'){
    const planQ=await state.client.from('schedule_plans')
      .select('id,assignment_id,specific_date,weekday,planned_start,planned_end,place,school:schools(id,name),assignment:assignments!inner(id,kind,supporter_id,student:students(id,full_name,alias,grade,class_no,school:schools(name)))')
      .eq('active',true).eq('assignment.supporter_id',state.user.id);
    state.plans=planQ.data||[];
    const assQ=await state.client.from('assignments')
      .select('id,kind,status,student:students(id,full_name,alias,grade,class_no,school:schools(name))')
      .eq('supporter_id',state.user.id).eq('status','active');
    state.assignments=assQ.data||[];
    const sessQ=await state.client.from('sessions').select('*').eq('supporter_id',state.user.id).gte('work_date',today.slice(0,7)+'-01').order('work_date',{ascending:false});
    state.sessions=sessQ.data||[];
  }else{
    const month=today.slice(0,7);
    const sessQ=await state.client.from('sessions')
      .select('*,assignment:assignments(kind,supporter_id,supporter:profiles!assignments_supporter_id_fkey(display_name)),student:students(full_name),plan:schedule_plans(place,school:schools(name))')
      .gte('work_date',month+'-01').order('work_date',{ascending:false});
    state.sessions=sessQ.data||[];
    const reqQ=await state.client.from('change_requests').select('*').order('created_at',{ascending:false}).limit(100);
    state.requests=reqQ.data||[];
    const setQ=await state.client.from('program_settings').select('*').eq('id',1).maybeSingle();
    state.settings=setQ.data||null;
  }
}
function subscribeRealtime(){
  if(state.demo||!state.client) return;
  if(state.realtime) state.client.removeChannel(state.realtime);
  state.realtime=state.client.channel('v14-ops')
    .on('postgres_changes',{event:'*',schema:'public',table:'sessions'},async()=>{await refreshData();renderPage();})
    .on('postgres_changes',{event:'*',schema:'public',table:'notices'},async()=>{await refreshData();renderPage();})
    .subscribe();
}

function renderShell(){
  const roles=getRoles();
  const roleOptions=roles.map(r=>'<option value="'+r+'" '+(r===state.role?'selected':'')+'>'+ROLE_LABEL[r]+'</option>').join('');
  const demo=state.demo?'<span class="chip">DEMO</span>':'<span class="chip">실시간 연결</span>';
  $app.innerHTML='<div class="top"><div class="topin"><div class="brand">학습지원단 실시간 운영</div>'+demo+'<div class="spacer"></div>'
    +'<select class="role-switch" onchange="switchRole(this.value)">'+roleOptions+'</select></div></div>'
    +'<div class="shell"><main id="page"></main></div><div class="bottom"><div class="bottomin" id="bottom-nav"></div></div>';
  renderNav();
  renderPage();
}
function renderNav(){
  const nav=navForRole(state.role);
  const wrap=document.getElementById('bottom-nav');
  if(!wrap) return;
  wrap.innerHTML=nav.slice(0,6).map(([id,label,icon])=>'<button class="navbtn '+(state.view===id?'active':'')+'" onclick="go(\''+id+'\')"><b>'+icon+'</b>'+label+'</button>').join('');
}
async function switchRole(role){
  if(!getRoles().includes(role)) return;
  state.role=role; state.view='home';
  if(state.demo) localStorage.setItem('clinic-demo-role',role);
  await refreshData(); renderShell();
}
function go(view){ state.view=view; renderNav(); renderPage(); }

async function renderPage(){
  const p=document.getElementById('page'); if(!p) return;
  const key=state.role+':'+state.view;
  const pages={
    'supporter:home':pageSupporterHome,'supporter:today':pageToday,'supporter:schedule':pageSchedule,
    'supporter:students':pageStudents,'supporter:records':pageRecords,'supporter:notices':pageNotices,'supporter:my':pageMy,
    'counselor:home':pageOfficeHome,'counselor:exceptions':pageExceptions,'counselor:counseling':pageCounseling,'counselor:requests':pageRequests,'counselor:notices':pageNotices,
    'admin:home':pageOfficeHome,'admin:settlement':pageSettlement,'admin:approvals':pageApprovals,'admin:exceptions':pageExceptions,'admin:notices':pageNotices,'admin:settings':pageSettings,
    'supervisor:home':pageOfficeHome,'supervisor:stats':pageStats,'supervisor:exceptions':pageExceptions,'supervisor:notices':pageNotices,'supervisor:settings':pageSettings
  };
  const fn=pages[key]||pages[state.role+':home'];
  p.innerHTML='<div class="empty">불러오는 중...</div>';
  try{ p.innerHTML=await fn(); }catch(e){console.error(e);p.innerHTML='<div class="empty">데이터를 불러오지 못했습니다.<br><span class="tiny">'+esc(e.message||e)+'</span></div>';}
}

function todayPlans(){
  const today=seoulDate(), dow=isoDow();
  return state.plans.filter(p=>{
    if(p.specific_date) return p.specific_date===today;
    return Number(p.weekday)===dow;
  }).sort((a,b)=>String(a.planned_start).localeCompare(String(b.planned_start)));
}
function todaySession(planId){ return state.sessions.find(s=>s.schedule_plan_id===planId && s.work_date===seoulDate()); }
function displayStudent(plan){
  return plan.assignment?.student?.alias || plan.assignment?.student?.full_name || '학생';
}
function displaySchool(plan){
  return plan.school?.name || plan.assignment?.student?.school?.name || '학교';
}
function verificationLabel(v){
  if(v==='auto_verified') return statusBadge('자동검증','good');
  if(v==='confirmed') return statusBadge('확인완료','good');
  if(v==='review_required') return statusBadge('확인필요','warn');
  if(v==='rejected') return statusBadge('반려','bad');
  return statusBadge('대기','neutral');
}
function formatDateOnly(v){
  if(!v) return '';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v).slice(0,10);
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function mobileIdState(){
  const p=state.profile||{};
  if(!p.mobile_id_active) return {label:'발급 대기',type:'warn'};
  if(!p.identity_verified) return {label:'본인확인 대기',type:'warn'};
  if(p.mobile_id_expires_on && p.mobile_id_expires_on < seoulDate()) return {label:'유효기간 만료',type:'bad'};
  return {label:'사용 가능',type:'good'};
}

async function pageSupporterHome(){
  const plans=todayPlans();
  const done=plans.filter(p=>todaySession(p.id)?.session_status==='completed').length;
  const running=plans.filter(p=>todaySession(p.id)?.session_status==='in_progress').length;
  const month=seoulDate().slice(0,7);
  const mine=state.sessions.filter(s=>s.work_date?.startsWith(month)&&s.session_status==='completed');
  const mins=mine.reduce((a,s)=>a+minutesBetween(s.start_at,s.end_at),0);
  return '<section class="hero"><h1>'+esc(state.profile.display_name)+' 선생님</h1><p>오늘의 수업과 기록을 여기서 바로 처리할 수 있습니다.</p></section>'
    +'<div class="grid"><div class="card"><div class="label">오늘 예정</div><div class="kpi">'+plans.length+'회</div></div>'
    +'<div class="card"><div class="label">완료 / 진행</div><div class="kpi">'+done+' / '+running+'</div></div>'
    +'<div class="card"><div class="label">이번 달 실제 활동</div><div class="kpi">'+(mins/60).toFixed(1)+'시간</div></div>'
    +'<div class="card wide"><div class="section-title">다음 수업</div>'+lessonList(plans.slice(0,3))+'</div>'
    +'<div class="card"><div class="section-title">교육지원청 알림</div>'+noticeMini()+'</div></div>';
}

function lessonList(plans){
  if(!plans.length) return '<div class="empty">오늘 예정된 수업이 없습니다.</div>';
  return '<div class="list">'+plans.map(p=>{
    const s=todaySession(p.id);
    let st=statusBadge('예정','neutral'), act='<button class="btn btn-primary" onclick="startLesson(\''+p.id+'\')">수업 시작</button>';
    if(s?.session_status==='in_progress'){st=statusBadge('수업중','good');act='<button class="btn btn-danger" onclick="endLesson(\''+s.id+'\')">수업 종료</button>';}
    if(s?.session_status==='completed'){st=verificationLabel(s.verification_state);act='<button class="btn btn-ghost" onclick="go(\'records\')">지도기록</button>';}
    return '<div class="item"><div class="row between"><div><h3>'+esc(displayStudent(p))+' · '+esc(displaySchool(p))+'</h3>'
      +'<div class="meta">'+esc(p.planned_start)+'~'+esc(p.planned_end)+' · '+esc(p.place||'')+'</div></div>'+st+'</div><div class="actions">'+act+'</div></div>';
  }).join('')+'</div>';
}

async function pageToday(){
  return '<div class="section-title">오늘 수업</div><div class="notice">시작·종료 시각은 서버에서 기록하며, 위치는 버튼을 누르는 시점에만 확인합니다.</div>'+lessonList(todayPlans());
}

async function pageSchedule(){
  const dayNames=['','월','화','수','목','금','토','일'];
  const list=state.plans.slice().sort((a,b)=>(a.weekday||9)-(b.weekday||9)||String(a.planned_start).localeCompare(String(b.planned_start)));
  if(!list.length) return '<div class="section-title">주간 시간표</div><div class="empty">등록된 시간표가 없습니다.</div>';
  return '<div class="section-title">주간 시간표</div><div class="list">'+list.map(p=>'<div class="item"><div class="row between"><div><h3>'
    +esc(p.specific_date||dayNames[p.weekday]||'')+' '+esc(p.planned_start)+'~'+esc(p.planned_end)+'</h3><div class="meta">'
    +esc(displayStudent(p))+' · '+esc(displaySchool(p))+' · '+esc(p.place||'')+'</div></div><button class="btn btn-ghost" onclick="requestScheduleChange(\''+p.id+'\')">변경요청</button></div></div>').join('')+'</div>';
}

async function pageStudents(){
  if(!state.assignments.length) return '<div class="section-title">담당 학생</div><div class="empty">현재 매칭된 학생이 없습니다.</div>';
  return '<div class="section-title">담당 학생</div><div class="list">'+state.assignments.map(a=>'<div class="item"><h3>'+esc(a.student?.alias||a.student?.full_name||'학생')+'</h3><div class="meta">'
    +esc(a.student?.school?.name||'')+' · '+esc(a.student?.grade||'')+'학년 '+esc(a.student?.class_no||'')+'반</div>'
    +'<div class="actions"><button class="btn btn-ghost" onclick="addCounseling(\''+a.id+'\',\''+a.student?.id+'\')">상담/협의 기록</button></div></div>').join('')+'</div>';
}

async function pageRecords(){
  const month=seoulDate().slice(0,7);
  const done=state.sessions.filter(s=>s.work_date?.startsWith(month)&&s.session_status==='completed');
  if(!done.length) return '<div class="section-title">지도기록</div><div class="empty">이번 달 완료 수업이 없습니다.</div>';
  let records={};
  if(!state.demo){
    const ids=done.map(x=>x.id);
    const q=await state.client.from('lesson_records').select('*').in('session_id',ids);
    (q.data||[]).forEach(x=>records[x.session_id]=x);
  }
  return '<div class="section-title">지도기록</div><div class="list">'+done.map(s=>{
    const plan=state.plans.find(p=>p.id===s.schedule_plan_id);
    const r=records[s.id];
    return '<div class="item"><div class="row between"><div><h3>'+esc(s.work_date)+' · '+esc(plan?displayStudent(plan):'학생')+'</h3><div class="meta">'
      +esc(seoulTime(new Date(s.start_at)))+'~'+esc(seoulTime(new Date(s.end_at)))+' · '+minutesBetween(s.start_at,s.end_at)+'분</div></div>'+verificationLabel(s.verification_state)+'</div>'
      +(r?'<div class="notice">'+esc(r.topic||r.content||'기록 있음')+'</div>':'')
      +'<div class="actions"><button class="btn btn-ghost" onclick="saveLessonRecord(\''+s.id+'\',\''+(s.student_id||'')+'\')">'+(r?'수정':'지도내용 입력')+'</button></div></div>';
  }).join('')+'</div>';
}

function noticeMini(){
  if(!state.notices.length) return '<div class="empty">새 공지가 없습니다.</div>';
  return state.notices.slice(0,3).map(n=>'<div class="item"><h3>'+esc(n.title)+'</h3><div class="meta">'+esc((n.body||'').slice(0,70))+'</div></div>').join('');
}
async function pageNotices(){
  if(!state.notices.length) return '<div class="section-title">공지</div><div class="empty">등록된 공지가 없습니다.</div>';
  return '<div class="section-title">교육지원청 공지</div><div class="list">'+state.notices.map(n=>'<div class="item"><h3>'+esc(n.title)+'</h3><div class="meta">'+esc(n.published_at?new Date(n.published_at).toLocaleString('ko-KR'):'')+'</div><p>'+esc(n.body)+'</p></div>').join('')+'</div>';
}
async function pageMy(){
  const p=state.profile||{};
  const idState=mobileIdState();
  const issued=p.mobile_id_issued_at?formatDateOnly(p.mobile_id_issued_at):'미발급';
  const expires=p.mobile_id_expires_on?formatDateOnly(p.mobile_id_expires_on):'운영기간 중';
  const initials=(p.display_name||'지원단').trim().slice(0,1);
  let photoUrl='';
  if(!state.demo && state.user?.id){
    const signed=await state.client.storage
      .from('supporter-id-photos')
      .createSignedUrl(state.user.id+'/profile',600);
    photoUrl=signed.data?.signedUrl||'';
  }
  const avatar=photoUrl
    ? '<div class="id-avatar photo"><img src="'+esc(photoUrl)+'" alt="학습지원단 사진"></div>'
    : '<div class="id-avatar">'+esc(initials)+'</div>';
  return '<div class="section-title">학습지원단 모바일 신분증</div>'
    +'<div class="idcard">'
      +'<div class="idcard-head"><div><div class="id-eyebrow">'+esc(state.settings?.org_name||'교육지원청')+'</div><div class="id-title">학습지원단</div></div>'
      +'<div class="id-state">'+statusBadge(idState.label,idState.type)+'</div></div>'
      +'<div class="id-body">'+avatar+'<div class="id-main">'
      +'<div class="id-name">'+esc(p.display_name||'사용자')+'</div><div class="id-role">학습지원단원</div>'
      +'<div class="id-no">'+esc(p.mobile_id_no||'발급번호 대기')+'</div></div></div>'
      +'<div class="id-grid"><div><span>발급일</span><b>'+esc(issued)+'</b></div><div><span>유효</span><b>'+esc(expires)+'</b></div></div>'
      +'<div class="id-foot">제천교육지원청 학습지원단 내부 활동 확인용 · 법정 신분증이 아닙니다.</div>'
    +'</div>'
    +'<div class="card full" style="margin-top:14px">'
      +'<div class="label">신분증 사진</div><p class="muted">본인이 직접 등록·교체합니다. JPEG·PNG·WebP, 3MB 이하</p>'
      +'<label class="btn btn-ghost" for="id-photo-input">'+(photoUrl?'사진 교체':'사진 등록')+'</label>'
      +'<input id="id-photo-input" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onchange="uploadMyIdPhoto(this)">'
      +'<div class="label" style="margin-top:16px">본인확인</div><p>'+(p.identity_verified?'확인 완료':'확인 대기')+'</p>'
      +'<div class="label">계정 역할</div><p>'+getRoles().map(r=>ROLE_LABEL[r]).join(', ')+'</p>'
      +'<button class="btn btn-danger" onclick="signOut()">로그아웃</button></div>';
}

function officeMetrics(){
  const completed=state.sessions.filter(s=>s.session_status==='completed');
  const auto=completed.filter(s=>s.verification_state==='auto_verified'||s.verification_state==='confirmed');
  const review=completed.filter(s=>s.verification_state==='review_required');
  const approved=completed.filter(s=>s.settlement_state==='approved'||s.settlement_state==='paid');
  const rates=state.settings||DEMO.settings;
  const provisional=auto.reduce((sum,s)=>sum+((s.assignment?.kind||'coach')==='class'?rates.class_rate:rates.coach_rate),0);
  const confirmed=approved.reduce((sum,s)=>sum+((s.assignment?.kind||'coach')==='class'?rates.class_rate:rates.coach_rate),0);
  return {completed,auto,review,approved,provisional,confirmed};
}
async function pageOfficeHome(){
  const m=officeMetrics();
  return '<section class="hero"><h1>'+ROLE_LABEL[state.role]+' 대시보드</h1><p>정상 활동은 자동검증하고 예외만 사람이 확인합니다.</p></section><div class="grid">'
    +'<div class="card"><div class="label">이번 달 완료</div><div class="kpi">'+m.completed.length+'회</div></div>'
    +'<div class="card"><div class="label">자동검증</div><div class="kpi">'+m.auto.length+'회</div></div>'
    +'<div class="card"><div class="label">확인 필요</div><div class="kpi">'+m.review.length+'회</div></div>'
    +'<div class="card"><div class="label">지급 예정</div><div class="kpi" style="font-size:24px">'+money(m.provisional)+'</div></div>'
    +'<div class="card"><div class="label">지급 승인</div><div class="kpi" style="font-size:24px">'+money(m.confirmed)+'</div></div>'
    +'<div class="card wide"><div class="section-title">최근 활동</div>'+sessionRows(m.completed.slice(0,8))+'</div></div>';
}
function sessionRows(rows){
  if(!rows.length) return '<div class="empty">표시할 활동이 없습니다.</div>';
  return '<div class="list">'+rows.map(s=>{
    const staff=s.assignment?.supporter?.display_name||'지원단';
    const stu=s.student?.full_name||'학생';
    return '<div class="item"><div class="row between"><div><h3>'+esc(staff)+' · '+esc(stu)+'</h3><div class="meta">'+esc(s.work_date)+' · '+minutesBetween(s.start_at,s.end_at)+'분</div></div>'
      +verificationLabel(s.verification_state)+'</div></div>';
  }).join('')+'</div>';
}
async function pageExceptions(){
  const rows=state.sessions.filter(s=>s.verification_state==='review_required');
  if(!rows.length) return '<div class="section-title">활동 확인 예외</div><div class="notice">정상 활동은 자동으로 처리되었습니다.</div><div class="empty">현재 확인할 예외가 없습니다.</div>';
  return '<div class="section-title">활동 확인 예외</div><div class="notice">이 화면의 건만 사람이 확인하면 됩니다.</div><div class="list">'
    +rows.map(s=>'<div class="item"><div class="row between"><div><h3>'+esc(s.assignment?.supporter?.display_name||'지원단')+' · '+esc(s.student?.full_name||'학생')+'</h3><div class="meta">'
      +esc(s.work_date)+' · '+minutesBetween(s.start_at,s.end_at)+'분 · '+esc(s.verification_reason||'확인 필요')+'</div></div>'+verificationLabel(s.verification_state)+'</div>'
      +'<div class="actions"><button class="btn btn-good" onclick="confirmSession(\''+s.id+'\')">확인 완료</button><button class="btn btn-danger" onclick="rejectSession(\''+s.id+'\')">반려</button></div></div>').join('')+'</div>';
}
async function pageApprovals(){
  const rows=state.sessions.filter(s=>(s.verification_state==='auto_verified'||s.verification_state==='confirmed')&&s.settlement_state==='pending');
  if(!rows.length) return '<div class="section-title">지급 승인</div><div class="empty">승인 대기 실적이 없습니다.</div>';
  return '<div class="row between"><div class="section-title">지급 승인</div><button class="btn btn-good" onclick="approveAll()">자동검증 전체 승인</button></div><div class="list">'
    +rows.map(s=>'<div class="item"><div class="row between"><div><h3>'+esc(s.assignment?.supporter?.display_name||'지원단')+' · '+esc(s.work_date)+'</h3><div class="meta">'
      +esc(s.student?.full_name||'학생')+' · '+minutesBetween(s.start_at,s.end_at)+'분</div></div>'+verificationLabel(s.verification_state)+'</div>'
      +'<div class="actions"><button class="btn btn-good" onclick="approveSession(\''+s.id+'\')">지급 승인</button></div></div>').join('')+'</div>';
}
async function pageSettlement(){
  const m=officeMetrics(), rates=state.settings||DEMO.settings;
  return '<div class="section-title">실시간 정산</div><div class="notice">지급 예정은 자동검증 실적, 지급 확정은 행정 승인 실적 기준입니다.</div><div class="grid">'
    +'<div class="card"><div class="label">학습코칭 1회</div><div class="kpi" style="font-size:24px">'+money(rates.coach_rate)+'</div></div>'
    +'<div class="card"><div class="label">지급 예정</div><div class="kpi" style="font-size:24px">'+money(m.provisional)+'</div></div>'
    +'<div class="card"><div class="label">지급 확정</div><div class="kpi" style="font-size:24px">'+money(m.confirmed)+'</div></div>'
    +'<div class="card full"><div class="section-title">승인된 활동</div>'+sessionRows(m.approved)+'</div></div>';
}
async function pageStats(){
  const m=officeMetrics();
  const mins=m.completed.reduce((a,s)=>a+minutesBetween(s.start_at,s.end_at),0);
  const staff=new Set(m.completed.map(s=>s.supporter_id)).size;
  const students=new Set(m.completed.map(s=>s.student_id)).size;
  return '<div class="section-title">운영 통계</div><div class="grid"><div class="card"><div class="label">활동 지원단</div><div class="kpi">'+staff+'명</div></div>'
    +'<div class="card"><div class="label">지원 학생</div><div class="kpi">'+students+'명</div></div>'
    +'<div class="card"><div class="label">실제 활동시간</div><div class="kpi">'+(mins/60).toFixed(1)+'h</div></div>'
    +'<div class="card"><div class="label">자동검증률</div><div class="kpi">'+(m.completed.length?Math.round(m.auto.length/m.completed.length*100):0)+'%</div></div>'
    +'<div class="card"><div class="label">확인 필요</div><div class="kpi">'+m.review.length+'건</div></div>'
    +'<div class="card"><div class="label">지급 확정</div><div class="kpi" style="font-size:24px">'+money(m.confirmed)+'</div></div></div>';
}
async function pageRequests(){
  if(!state.requests.length) return '<div class="section-title">변경요청</div><div class="empty">대기 요청이 없습니다.</div>';
  return '<div class="section-title">변경요청</div><div class="list">'+state.requests.map(r=>'<div class="item"><div class="row between"><div><h3>'+esc(r.request_type)+'</h3><div class="meta">'
    +esc(r.reason||'')+'</div></div>'+statusBadge(r.status,r.status==='pending'?'warn':'good')+'</div></div>').join('')+'</div>';
}
async function pageCounseling(){
  let rows=[];
  if(!state.demo){
    const q=await state.client.from('counseling_records').select('*,student:students(full_name),author:profiles!counseling_records_author_id_fkey(display_name)').order('occurred_at',{ascending:false}).limit(50);
    rows=q.data||[];
  }
  return '<div class="section-title">상담·협의</div>'+(rows.length?'<div class="list">'+rows.map(r=>'<div class="item"><h3>'+esc(r.student?.full_name||'학생')+' · '+esc(r.counseling_type)+'</h3><div class="meta">'+esc(r.author?.display_name||'')+' · '+esc(new Date(r.occurred_at).toLocaleString('ko-KR'))+'</div><p>'+esc(r.content)+'</p></div>').join('')+'</div>':'<div class="empty">등록된 상담·협의 기록이 없습니다.</div>');
}
async function pageSettings(){
  const s=state.settings||DEMO.settings;
  let schools=[];
  if(state.demo){
    schools=[{id:'demo-school',name:'V14 테스트학교',latitude:null,longitude:null,radius_m:null}];
  }else{
    const q=await state.client.from('schools')
      .select('id,name,latitude,longitude,radius_m,active')
      .eq('active',true)
      .order('name',{ascending:true});
    if(q.error) throw q.error;
    schools=q.data||[];
  }
  const schoolHtml=schools.length
    ? '<div class="list">'+schools.map(sc=>{
        const registered=sc.latitude!==null&&sc.latitude!==undefined&&sc.longitude!==null&&sc.longitude!==undefined;
        const status=registered?statusBadge('기준 위치 등록됨','good'):statusBadge('위치 미등록','warn');
        const radius=sc.radius_m||s.default_location_radius_m||250;
        return '<div class="item"><div class="row between"><div><h3>'+esc(sc.name)+'</h3><div class="meta">확인 반경 '+esc(radius)+'m · 좌표값은 화면에 표시하지 않습니다.</div></div>'+status+'</div>'
          +'<div class="actions"><button class="btn btn-ghost" onclick="setSchoolCurrentLocation(\''+sc.id+'\',\''+esc(sc.name).replace(/&#39;/g,"\\'")+'\')">현재 위치를 기준 위치로 등록</button></div></div>';
      }).join('')+'</div>'
    : '<div class="empty">등록된 학교가 없습니다.</div>';

  return '<div class="section-title">운영 설정</div>'
    +'<div class="card full"><div class="field"><label>기관</label><input value="'+esc(s.org_name||'')+'" disabled></div>'
    +'<div class="field"><label>학습코칭 단가</label><input value="'+esc(s.coach_rate||0)+'" disabled></div>'
    +'<div class="field"><label>기본 위치 확인 반경(m)</label><input value="'+esc(s.default_location_radius_m||250)+'" disabled></div>'
    +'<p class="muted">단가·반경 등 일반 설정은 아직 조회 전용입니다.</p></div>'
    +'<div class="section-title" style="margin-top:18px">학교 기준 위치</div>'
    +'<div class="notice">관리자가 학교 현장에서 버튼을 눌러 기준 위치를 등록합니다. 이 기능은 버튼을 누른 순간의 위치만 저장하며 상시 위치추적을 하지 않습니다.</div>'
    +schoolHtml;
}

function getLocation(){
  if(state.demo) return Promise.resolve({latitude:37.13,longitude:128.19,accuracy:18});
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('위치정보를 사용할 수 없습니다.'));return;}
    navigator.geolocation.getCurrentPosition(
      p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
      e=>reject(new Error('위치 권한을 확인해 주세요: '+e.message)),
      {enableHighAccuracy:true,timeout:12000,maximumAge:0}
    );
  });
}

async function setSchoolCurrentLocation(schoolId,schoolName){
  if(!confirm(schoolName+'의 기준 위치를 현재 스마트폰 위치로 등록하시겠습니까?\\n\\n이 위치는 수업 시작·종료 확인의 기준점으로만 사용합니다.')) return;
  try{
    const loc=await getLocation();
    if(Number(loc.accuracy||0)>100){
      const ok=confirm('현재 GPS 정확도가 약 '+Math.round(loc.accuracy)+'m입니다.\\n가능하면 창가나 실외에서 다시 측정하는 것을 권장합니다. 그래도 등록하시겠습니까?');
      if(!ok) return;
    }
    if(state.demo){
      toast('기준 위치가 등록되었습니다. (데모)');
      renderPage();
      return;
    }
    const {data,error}=await state.client.rpc('set_school_baseline_location',{
      p_school_id:schoolId,
      p_latitude:loc.latitude,
      p_longitude:loc.longitude,
      p_accuracy_m:loc.accuracy
    });
    if(error) throw error;
    if(!data?.registered) throw new Error('학교 기준 위치 저장을 확인하지 못했습니다.');
    toast('학교 기준 위치 저장을 확인했습니다.');
    renderPage();
  }catch(e){
    toast(e.message||String(e));
  }
}
async function startLesson(planId){
  try{
    const loc=await getLocation();
    if(state.demo){
      let s=DEMO.sessions.find(x=>x.schedule_plan_id===planId&&x.work_date===seoulDate());
      if(!s){
        const p=DEMO.plans.find(x=>x.id===planId), a=p.assignment;
        s={id:'sess-'+Date.now(),schedule_plan_id:planId,assignment_id:a.id,supporter_id:'demo-user',student_id:a.student.id,work_date:seoulDate(),planned_start_at:seoulDate()+'T'+p.planned_start+':00+09:00',planned_end_at:seoulDate()+'T'+p.planned_end+':00+09:00',start_at:new Date().toISOString(),end_at:null,session_status:'in_progress',verification_state:'pending',settlement_state:'pending'};
        DEMO.sessions.push(s);
      }else{s.start_at=s.start_at||new Date().toISOString();s.session_status='in_progress';}
      await refreshData(); toast('수업 시작이 기록되었습니다.'); renderPage(); return;
    }
    const {error}=await state.client.rpc('start_session',{p_schedule_plan_id:planId,p_latitude:loc.latitude,p_longitude:loc.longitude,p_accuracy_m:loc.accuracy});
    if(error) throw error;
    await refreshData();toast('서버시각으로 수업 시작을 기록했습니다.');renderPage();
  }catch(e){toast(e.message||String(e));}
}
async function endLesson(sessionId){
  try{
    const loc=await getLocation();
    if(state.demo){
      const s=DEMO.sessions.find(x=>x.id===sessionId); if(!s) return;
      s.end_at=new Date().toISOString();s.session_status='completed';s.verification_state='auto_verified';s.verification_reason='서버시각·위치·수업시간 자동검증 통과';
      await refreshData();toast('수업 종료 및 자동검증이 완료되었습니다.');renderPage();return;
    }
    const {data,error}=await state.client.rpc('end_session',{p_session_id:sessionId,p_latitude:loc.latitude,p_longitude:loc.longitude,p_accuracy_m:loc.accuracy});
    if(error) throw error;
    await refreshData();toast(data==='auto_verified'?'자동검증이 완료되었습니다.':'수업은 저장되었고 확인이 필요한 항목이 있습니다.');renderPage();
  }catch(e){toast(e.message||String(e));}
}

async function uploadMyIdPhoto(input){
  const file=input?.files?.[0];
  if(!file) return;
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type)){
    toast('JPEG, PNG, WebP 사진만 등록할 수 있습니다.');
    input.value='';
    return;
  }
  if(file.size>3*1024*1024){
    toast('사진은 3MB 이하로 등록해 주세요.');
    input.value='';
    return;
  }
  if(state.demo){
    toast('사진 등록이 완료되었습니다. (데모)');
    input.value='';
    return;
  }
  try{
    const path=state.user.id+'/profile';
    const {error}=await state.client.storage
      .from('supporter-id-photos')
      .upload(path,file,{upsert:true,contentType:file.type,cacheControl:'0'});
    if(error) throw error;
    toast('모바일 신분증 사진을 등록했습니다.');
    input.value='';
    await renderPage();
  }catch(e){
    toast(e.message||String(e));
    input.value='';
  }
}

async function saveLessonRecord(sessionId,studentId){
  const topic=prompt('오늘의 핵심 지도내용을 입력하세요.'); if(topic===null) return;
  const content=prompt('간단한 지도 메모를 입력하세요.',''); if(content===null) return;
  if(state.demo){toast('지도기록이 저장되었습니다. (데모)');return;}
  const row={session_id:sessionId,supporter_id:state.user.id,student_id:studentId,topic,content,updated_at:new Date().toISOString()};
  const {error}=await state.client.from('lesson_records').upsert(row,{onConflict:'session_id'});
  if(error){toast(error.message);return;} toast('지도기록을 저장했습니다.');renderPage();
}
async function addCounseling(assignmentId,studentId){
  const type=prompt('상담/협의 유형을 입력하세요. (student/guardian/teacher/school/other)','student'); if(!type) return;
  const content=prompt('상담·협의 내용을 간단히 입력하세요.'); if(!content) return;
  if(state.demo){toast('상담·협의 기록이 저장되었습니다. (데모)');return;}
  const {error}=await state.client.from('counseling_records').insert({student_id:studentId,assignment_id:assignmentId,author_id:state.user.id,counseling_type:type,content});
  if(error){toast(error.message);return;} toast('상담·협의 기록을 저장했습니다.');
}
async function requestScheduleChange(planId){
  const reason=prompt('시간표 변경 사유를 입력하세요.'); if(!reason) return;
  if(state.demo){DEMO.requests.unshift({id:'r'+Date.now(),request_type:'schedule',reason,status:'pending',created_at:new Date().toISOString()});toast('변경요청을 등록했습니다.');return;}
  const plan=state.plans.find(p=>p.id===planId);
  const {error}=await state.client.from('change_requests').insert({requester_id:state.user.id,assignment_id:plan?.assignment_id||null,schedule_plan_id:planId,request_type:'schedule',reason});
  if(error){toast(error.message);return;}toast('변경요청을 등록했습니다.');
}
async function reverifySession(id){
  if(state.demo){
    const s=DEMO.sessions.find(x=>x.id===id);
    if(s){s.verification_state='auto_verified';s.verification_reason='관리자 재검증: 자동검증 통과';}
    await refreshData();renderPage();return;
  }
  const {data,error}=await state.client.rpc('reverify_session',{p_session_id:id});
  if(error){toast(error.message);return;}
  await refreshData();
  toast(data==='auto_verified'?'자동 재검증을 통과했습니다.':'재검증 결과 확인이 필요합니다.');
  renderPage();
}
async function confirmSession(id){
  if(state.demo){const s=DEMO.sessions.find(x=>x.id===id);if(s)s.verification_state='confirmed';await refreshData();renderPage();return;}
  const {error}=await state.client.from('sessions').update({verification_state:'confirmed',verification_reason:'담당자 확인 완료'}).eq('id',id);
  if(error){toast(error.message);return;}await refreshData();renderPage();
}
async function rejectSession(id){
  const reason=prompt('반려 사유를 입력하세요.');if(!reason)return;
  if(state.demo){const s=DEMO.sessions.find(x=>x.id===id);if(s){s.verification_state='rejected';s.verification_reason=reason;}await refreshData();renderPage();return;}
  const {error}=await state.client.from('sessions').update({verification_state:'rejected',verification_reason:reason}).eq('id',id);
  if(error){toast(error.message);return;}await refreshData();renderPage();
}
async function approveSession(id){
  if(state.demo){const s=DEMO.sessions.find(x=>x.id===id);if(s)s.settlement_state='approved';await refreshData();renderPage();return;}
  const {error}=await state.client.rpc('approve_session_payment',{p_session_id:id});
  if(error){toast(error.message);return;}await refreshData();renderPage();
}
async function approveAll(){
  const ids=state.sessions.filter(s=>(s.verification_state==='auto_verified'||s.verification_state==='confirmed')&&s.settlement_state==='pending').map(s=>s.id);
  if(!ids.length)return;
  if(!confirm(ids.length+'건을 지급 승인하시겠습니까?'))return;
  if(state.demo){DEMO.sessions.forEach(s=>{if(ids.includes(s.id))s.settlement_state='approved';});await refreshData();renderPage();return;}
  for(const id of ids){
    const {error}=await state.client.rpc('approve_session_payment',{p_session_id:id});
    if(error){toast(error.message);return;}
  }
  await refreshData();toast('지급 승인이 완료되었습니다.');renderPage();
}

window.signIn=signIn; window.signOut=signOut; window.switchRole=switchRole; window.go=go;
window.startLesson=startLesson; window.endLesson=endLesson; window.saveLessonRecord=saveLessonRecord; window.setSchoolCurrentLocation=setSchoolCurrentLocation; window.uploadMyIdPhoto=uploadMyIdPhoto;
window.addCounseling=addCounseling; window.requestScheduleChange=requestScheduleChange;
window.reverifySession=reverifySession; window.confirmSession=confirmSession; window.rejectSession=rejectSession; window.approveSession=approveSession; window.approveAll=approveAll;

init().catch(e=>{$app.innerHTML='<div class="login"><h2>초기화 오류</h2><p>'+esc(e.message||e)+'</p></div>';});
