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
  invitations: [],
  lastInvite: null,
  rosterPreview: null,
  bulkInviteResults: [],
  studentRosterPreview: null,
  studentImportResult: null,
  matchingSupporters: [],
  matchingStudents: [],
  matchingAssignments: [],
  scheduleAdminPlans: [],
  activeSchools: [],
  settings: null,
  realtime: null,
  demoPhotoUrl: null
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
  const end=new Date(today+'T12:00:00Z'); end.setUTCDate(end.getUTCDate()+90);
  const effectiveTo=end.toISOString().slice(0,10);
  DEMO.plans=[
    {id:'p1',assignment_id:'a1',weekday:dow,specific_date:null,planned_start:'14:00',planned_end:'14:50',place:'학습지원실',effective_from:today,effective_to:effectiveTo,active:true,school:{id:'demo-school-1',name:'의림초등학교'},assignment:DEMO.assignments[0]},
    {id:'p2',assignment_id:'a2',weekday:dow,specific_date:null,planned_start:'15:10',planned_end:'16:00',place:'상담실',effective_from:today,effective_to:effectiveTo,active:true,school:{id:'demo-school-2',name:'남당초등학교'},assignment:DEMO.assignments[1]},
    {id:'p3',assignment_id:'a3',weekday:dow===7?1:dow+1,specific_date:null,planned_start:'14:30',planned_end:'15:20',place:'도서실',effective_from:today,effective_to:effectiveTo,active:true,school:{id:'demo-school-3',name:'홍광초등학교'},assignment:DEMO.assignments[2]}
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
  if(role==='supporter') return [['home','홈','⌂'],['today','오늘','◷'],['schedule','시간표','▦'],['students','학생','◎'],['records','기록','✎'],['my','내정보','▣']];
  if(role==='counselor') return [['home','현황','⌂'],['exceptions','예외','!'],['counseling','상담','✎'],['requests','변경요청','⇄'],...common.slice(1)];
  if(role==='admin') return [['home','현황','⌂'],['settlement','정산','₩'],['approvals','승인','✓'],['exceptions','예외','!'],['notices','공지','●'],['settings','설정','⚙']];
  return [['home','현황','⌂'],['stats','통계','▥'],['exceptions','예외','!'],['notices','공지','●'],['settings','설정','⚙']];
}

async function init(){
  ensureDemoData();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  const inviteToken=new URLSearchParams(location.search).get('invite');
  if(state.demo && inviteToken){
    renderInviteRegistration(inviteToken);
    return;
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
    await refreshData();
    renderShell();
    return;
  }

  state.client=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  const {data:{session}}=await state.client.auth.getSession();
  if(inviteToken && !session){ renderInviteRegistration(inviteToken); return; }
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
function renderInviteRegistration(inviteToken){
  const safeToken=/^[a-f0-9]{48}$/i.test(inviteToken||'')?inviteToken:'';
  if(!safeToken){
    $app.innerHTML='<div class="login"><h2>초대 링크 확인</h2><p class="muted">초대 링크가 올바르지 않습니다. 담당자에게 새 링크를 요청해 주세요.</p></div>';
    return;
  }
  $app.innerHTML='<div class="login"><h2>학습지원단 등록</h2>'
    +'<p class="muted">카카오톡으로 받은 초대 링크입니다. 담당자에게 별도로 안내받은 6자리 승인번호를 입력해 주세요.</p>'
    +'<div class="notice">승인번호는 카카오톡 초대문에 포함되지 않습니다. 5회 잘못 입력하면 초대가 잠깁니다.</div>'
    +'<div class="field"><label>승인번호</label><input id="invite-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6자리"></div>'
    +'<div class="field"><label>사용할 비밀번호</label><input id="invite-password" type="password" autocomplete="new-password" placeholder="10자 이상"></div>'
    +'<div class="field"><label>비밀번호 확인</label><input id="invite-password2" type="password" autocomplete="new-password"></div>'
    +'<button class="btn btn-primary" style="width:100%" onclick="redeemInvite(\''+safeToken+'\')">등록 완료</button>'
    +'<div id="invite-msg" class="notice hidden"></div></div>';
}
async function redeemInvite(inviteToken){
  const code=document.getElementById('invite-code').value.trim();
  const password=document.getElementById('invite-password').value;
  const password2=document.getElementById('invite-password2').value;
  const msg=document.getElementById('invite-msg');
  if(!/^\d{6}$/.test(code)){
    msg.textContent='승인번호 6자리를 입력해 주세요.';msg.classList.remove('hidden');return;
  }
  if(password.length<10){
    msg.textContent='비밀번호는 10자 이상으로 설정해 주세요.';msg.classList.remove('hidden');return;
  }
  if(password!==password2){
    msg.textContent='비밀번호 확인이 일치하지 않습니다.';msg.classList.remove('hidden');return;
  }
  if(state.demo){
    msg.textContent='등록 화면 검증이 완료되었습니다. (데모)';msg.classList.remove('hidden');return;
  }
  try{
    const res=await fetch(CFG.supabaseUrl+'/functions/v1/redeem-supporter-invite',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':CFG.supabaseAnonKey},
      body:JSON.stringify({invite_token:inviteToken,approval_code:code,password})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok) throw new Error(data.message||'등록하지 못했습니다.');
    const signed=await state.client.auth.signInWithPassword({email:data.email,password});
    if(signed.error) throw signed.error;
    state.user=signed.data.user;
    history.replaceState({},'',location.pathname);
    await loadProfile();
    subscribeRealtime();
    renderShell();
    toast('학습지원단 등록이 완료되었습니다.');
  }catch(e){
    msg.textContent=e.message||String(e);msg.classList.remove('hidden');
  }
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
    state.invitations=state.invitations||[];
    if(!DEMO.matchingSupporters){
      DEMO.matchingSupporters=[
        {id:'demo-user',display_name:'김지원',roles:['supporter'],active:true,identity_verified:true},
        {id:'demo-supporter-2',display_name:'이지원',roles:['supporter'],active:true,identity_verified:true}
      ];
      DEMO.matchingStudents=[
        ...DEMO.assignments.map(a=>({...a.student,preferred_support_type:'coach',active:true})),
        {id:'s4',full_name:'윤하늘',alias:'하늘',grade:4,class_no:1,preferred_support_type:'coach',active:true,school:{id:'demo-school-4',name:'V14 테스트학교'}},
        {id:'s5',full_name:'정다온',alias:'다온',grade:5,class_no:2,preferred_support_type:'class',active:true,school:{id:'demo-school-5',name:'V14 테스트학교'}},
        {id:'s6',full_name:'한별',alias:'별',grade:3,class_no:1,preferred_support_type:'counseling',active:true,school:{id:'demo-school-6',name:'V14 테스트학교'}}
      ];
      DEMO.matchingAssignments=DEMO.assignments.map((a,i)=>({
        id:a.id,
        legacy_matching_id:'JCEC-MAT-DEMO-0000'+(i+1),
        supporter_id:i===1?'demo-supporter-2':'demo-user',
        student_id:a.student.id,
        kind:a.kind,
        status:'active',
        started_on:seoulDate(),
        ended_on:null,
        supporter:i===1?DEMO.matchingSupporters[1]:DEMO.matchingSupporters[0],
        student:{...a.student,preferred_support_type:'coach'}
      }));
    }
    if(!DEMO.activeSchools){
      DEMO.activeSchools=[
        {id:'demo-school-1',name:'의림초등학교',active:true},
        {id:'demo-school-2',name:'남당초등학교',active:true},
        {id:'demo-school-3',name:'홍광초등학교',active:true},
        {id:'demo-school-4',name:'V14 테스트학교',active:true}
      ];
    }
    state.matchingSupporters=DEMO.matchingSupporters;
    state.matchingStudents=DEMO.matchingStudents;
    state.matchingAssignments=DEMO.matchingAssignments;
    state.activeSchools=DEMO.activeSchools;
    state.scheduleAdminPlans=DEMO.plans.map(p=>({
      ...p,
      school:p.school||DEMO.activeSchools.find(s=>s.id===p.school_id)||null,
      assignment:DEMO.matchingAssignments.find(a=>a.id===p.assignment_id)||p.assignment
    }));
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
    if(role==='admin'||role==='supervisor'){
      const invQ=await state.client.from('supporter_invitations')
        .select('id,invitee_name,email,status,expires_at,failed_attempts,max_attempts,created_at,redeemed_at')
        .order('created_at',{ascending:false}).limit(100);
      if(invQ.error) throw invQ.error;
      state.invitations=invQ.data||[];

      const supporterQ=await state.client.from('profiles')
        .select('id,display_name,roles,active,identity_verified,mobile_id_active')
        .eq('active',true)
        .contains('roles',['supporter'])
        .order('display_name',{ascending:true});
      if(supporterQ.error) throw supporterQ.error;
      state.matchingSupporters=supporterQ.data||[];

      const studentQ=await state.client.from('students')
        .select('id,full_name,alias,school_type,grade,class_no,preferred_support_type,active,school:schools(id,name)')
        .eq('active',true)
        .order('full_name',{ascending:true});
      if(studentQ.error) throw studentQ.error;
      state.matchingStudents=studentQ.data||[];

      const matchingQ=await state.client.from('assignments')
        .select('id,legacy_matching_id,supporter_id,student_id,kind,status,started_on,ended_on,supporter:profiles!assignments_supporter_id_fkey(id,display_name),student:students(id,full_name,alias,grade,class_no,preferred_support_type,school:schools(id,name))')
        .order('created_at',{ascending:false})
        .limit(300);
      if(matchingQ.error) throw matchingQ.error;
      state.matchingAssignments=matchingQ.data||[];

      const schoolQ=await state.client.from('schools')
        .select('id,name,active')
        .eq('active',true)
        .order('name',{ascending:true});
      if(schoolQ.error) throw schoolQ.error;
      state.activeSchools=schoolQ.data||[];

      const scheduleQ=await state.client.from('schedule_plans')
        .select('id,assignment_id,school_id,specific_date,weekday,planned_start,planned_end,place,effective_from,effective_to,active,created_at,school:schools(id,name),assignment:assignments!inner(id,kind,status,supporter_id,student_id,supporter:profiles!assignments_supporter_id_fkey(id,display_name),student:students(id,full_name,alias,grade,class_no,school:schools(id,name)))')
        .order('created_at',{ascending:false})
        .limit(500);
      if(scheduleQ.error) throw scheduleQ.error;
      state.scheduleAdminPlans=scheduleQ.data||[];
    }else{
      state.invitations=[];
      state.matchingSupporters=[];
      state.matchingStudents=[];
      state.matchingAssignments=[];
      state.activeSchools=[];
      state.scheduleAdminPlans=[];
    }
  }
}
function subscribeRealtime(){
  if(state.demo||!state.client) return;
  if(state.realtime) state.client.removeChannel(state.realtime);
  state.realtime=state.client.channel('v14-ops')
    .on('postgres_changes',{event:'*',schema:'public',table:'sessions'},async()=>{await refreshData();renderPage();})
    .on('postgres_changes',{event:'*',schema:'public',table:'assignments'},async()=>{await refreshData();renderPage();})
    .on('postgres_changes',{event:'*',schema:'public',table:'students'},async()=>{await refreshData();renderPage();})
    .on('postgres_changes',{event:'*',schema:'public',table:'schedule_plans'},async()=>{await refreshData();renderPage();})
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
    'admin:home':pageOfficeHome,'admin:invites':pageInvites,'admin:student-import':pageStudentImport,'admin:matching':pageMatching,'admin:schedule-admin':pageScheduleAdmin,'admin:v13-handoff':pageV13Handoff,'admin:settlement':pageSettlement,'admin:approvals':pageApprovals,'admin:exceptions':pageExceptions,'admin:notices':pageNotices,'admin:settings':pageSettings,
    'supervisor:home':pageOfficeHome,'supervisor:invites':pageInvites,'supervisor:student-import':pageStudentImport,'supervisor:matching':pageMatching,'supervisor:schedule-admin':pageScheduleAdmin,'supervisor:v13-handoff':pageV13Handoff,'supervisor:stats':pageStats,'supervisor:exceptions':pageExceptions,'supervisor:notices':pageNotices,'supervisor:settings':pageSettings
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
  let photoUrl=state.demo ? (state.demoPhotoUrl||'') : '';
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
function rosterStatusBadge(status){
  if(status==='valid') return statusBadge('초대 가능','good');
  if(status==='registered') return statusBadge('등록됨','neutral');
  if(status==='pending_invite') return statusBadge('기존 초대','warn');
  if(status==='duplicate_file') return statusBadge('파일 중복','bad');
  return statusBadge('확인 필요','bad');
}
function parseSimpleCsv(text){
  const rows=[];
  let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(ch===',' && !quoted){
      row.push(cell);cell='';
    }else if((ch==='\n'||ch==='\r') && !quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(v=>String(v).trim()!==''))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);
  if(row.some(v=>String(v).trim()!==''))rows.push(row);
  return rows;
}
async function parseDemoSupporterRoster(file){
  if(!file.name.toLowerCase().endsWith('.csv')){
    throw new Error('데모 검증에서는 CSV를 사용해 주세요.');
  }
  const raw=parseSimpleCsv(await file.text());
  if(raw.length<2) throw new Error('헤더와 1명 이상의 자료가 필요합니다.');
  const headers=raw[0].map(v=>String(v||'').trim().toLowerCase().replace(/[\s_.-]+/g,''));
  const nameCol=headers.findIndex(v=>['성명','이름','name','displayname'].includes(v));
  const emailCol=headers.findIndex(v=>['이메일','메일','email'].includes(v));
  if(nameCol<0||emailCol<0) throw new Error("첫 행에 '성명'과 '이메일' 열이 필요합니다.");
  const rows=raw.slice(1,201);
  const counts={};
  rows.forEach(r=>{const e=String(r[emailCol]||'').trim().toLowerCase();if(e)counts[e]=(counts[e]||0)+1;});
  const out=rows.map((r,i)=>{
    const name=String(r[nameCol]||'').trim();
    const email=String(r[emailCol]||'').trim().toLowerCase();
    let status='valid',message='초대 가능';
    if(!name){status='error';message='성명 누락';}
    else if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){status='error';message='이메일 형식 오류';}
    else if((counts[email]||0)>1){status='duplicate_file';message='파일 내 이메일 중복';}
    return {row_number:i+2,name,email,status,message};
  });
  return {ok:true,filename:file.name,total:out.length,valid:out.filter(x=>x.status==='valid').length,invalid:out.filter(x=>x.status!=='valid').length,truncated:raw.length-1>200,rows:out};
}
async function validateSupporterRoster(input){
  const file=input?.files?.[0];
  if(!file)return;
  state.rosterPreview=null;
  state.bulkInviteResults=[];
  try{
    let data;
    if(state.demo){
      data=await parseDemoSupporterRoster(file);
    }else{
      const {data:{session}}=await state.client.auth.getSession();
      if(!session?.access_token) throw new Error('로그인 세션을 확인해 주세요.');
      const form=new FormData();
      form.append('file',file);
      const res=await fetch(CFG.supabaseUrl+'/functions/v1/validate-supporter-roster',{
        method:'POST',
        headers:{Authorization:'Bearer '+session.access_token,apikey:CFG.supabaseAnonKey},
        body:form
      });
      data=await res.json().catch(()=>({}));
      if(!res.ok||!data.ok)throw new Error(data.message||'명부를 검증하지 못했습니다.');
    }
    state.rosterPreview=data;
    input.value='';
    await renderPage();
    toast('명부 검증이 완료되었습니다.');
  }catch(e){
    input.value='';
    toast(e.message||String(e));
  }
}
function downloadSupporterRosterTemplate(){
  const csv='성명,이메일\r\n김지원,supporter@example.kr\r\n';
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='학습지원단_초대명부_양식.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function createBulkInvitations(){
  const rows=(state.rosterPreview?.rows||[]).filter(x=>x.status==='valid');
  if(!rows.length){toast('초대 가능한 대상이 없습니다.');return;}
  if(!confirm(rows.length+'명의 초대를 생성하시겠습니까?'))return;
  const results=[];
  const base=location.origin+location.pathname;
  for(let i=0;i<rows.length;i+=5){
    const batch=rows.slice(i,i+5);
    const batchResults=await Promise.all(batch.map(async(row,offset)=>{
      if(state.demo){
        const n=i+offset+1;
        return {ok:true,name:row.name,email:row.email,approvalCode:String(610000+n),inviteUrl:base+'?invite='+('a'.repeat(47)+(n%10)),expiresAt:new Date(Date.now()+48*3600000).toISOString()};
      }
      const {data,error}=await state.client.rpc('create_supporter_invitation',{
        p_name:row.name,p_email:row.email,p_expires_hours:48
      });
      if(error)return {ok:false,name:row.name,email:row.email,error:error.message};
      const x=Array.isArray(data)?data[0]:data;
      if(!x)return {ok:false,name:row.name,email:row.email,error:'초대 결과 없음'};
      return {ok:true,name:row.name,email:row.email,approvalCode:x.approval_code,inviteUrl:base+'?invite='+encodeURIComponent(x.invite_token),expiresAt:x.expires_at};
    }));
    results.push(...batchResults);
  }
  state.bulkInviteResults=results;
  if(!state.demo)await refreshData();
  await renderPage();
  toast('일괄 초대 생성을 완료했습니다.');
}
async function copyBulkKakaoInvite(index){
  const x=state.bulkInviteResults?.[index];
  if(!x?.ok)return;
  const text='[제천교육지원청 학습지원단 등록 안내]\n'+x.name+' 선생님, 아래 링크로 접속해 등록해 주세요.\n'+x.inviteUrl+'\n\n승인번호는 보안을 위해 카카오톡으로 전달하지 않습니다. 별도로 안내받은 번호를 입력해 주세요.';
  try{await navigator.clipboard.writeText(text);toast('카카오톡 안내문을 복사했습니다.');}
  catch(e){prompt('아래 내용을 복사해 카카오톡으로 보내세요.',text);}
}

function invitationStatusBadge(status,expiresAt){
  if(status==='pending' && expiresAt && new Date(expiresAt).getTime()<=Date.now()) return statusBadge('만료','bad');
  if(status==='pending') return statusBadge('대기','warn');
  if(status==='redeemed') return statusBadge('등록완료','good');
  if(status==='locked') return statusBadge('잠김','bad');
  if(status==='revoked') return statusBadge('폐기','neutral');
  if(status==='expired') return statusBadge('만료','bad');
  return statusBadge(status||'','neutral');
}
async function pageInvites(){
  const last=state.lastInvite;
  const preview=state.rosterPreview;
  const bulk=state.bulkInviteResults||[];
  const previewHtml=preview
    ? '<div class="card full" style="margin-top:14px"><div class="row between"><div class="section-title">명부 검증 결과</div><div>'+preview.valid+'명 초대 가능 / '+preview.invalid+'명 확인</div></div>'
      +(preview.truncated?'<div class="notice">한 번에 200명까지만 검증했습니다.</div>':'')
      +'<div class="list">'+preview.rows.map(x=>'<div class="item"><div class="row between"><div><h3>'+esc(x.row_number)+'행 · '+esc(x.name||'성명 없음')+'</h3><div class="meta">'+esc(x.email||'이메일 없음')+' · '+esc(x.message)+'</div></div>'+rosterStatusBadge(x.status)+'</div></div>').join('')+'</div>'
      +(preview.valid?'<div class="actions"><button class="btn btn-good" onclick="createBulkInvitations()">유효 '+preview.valid+'명 일괄 초대 생성</button></div>':'')
      +'</div>' : '';
  const bulkHtml=bulk.length
    ? '<div class="card full" style="margin-top:14px"><div class="section-title">일괄 초대 결과</div><div class="notice">승인번호는 이 화면에서만 확인하고 카카오톡에는 링크만 보내세요.</div>'
      +'<div class="list">'+bulk.map((x,i)=>'<div class="item">'+(x.ok
        ? '<div class="row between"><div><h3>'+esc(x.name)+' · '+esc(x.email)+'</h3><div class="meta">오프라인 승인번호 <b>'+esc(x.approvalCode)+'</b></div></div>'+statusBadge('생성완료','good')+'</div><div class="actions"><button class="btn btn-primary" onclick="copyBulkKakaoInvite('+i+')">카카오톡 안내문 복사</button></div>'
        : '<div class="row between"><div><h3>'+esc(x.name)+' · '+esc(x.email)+'</h3><div class="meta">'+esc(x.error||'생성 실패')+'</div></div>'+statusBadge('실패','bad')+'</div>')+'</div>').join('')+'</div></div>' : '';
  const lastHtml=last
    ? '<div class="card full" style="margin-bottom:14px"><div class="section-title">방금 생성한 초대</div>'
      +'<div class="notice"><b>승인번호는 지금만 확인할 수 있습니다.</b><br>카카오톡에는 초대 링크만 보내고 승인번호는 전화·대면 등 별도 경로로 알려주세요.</div>'
      +'<div class="label">대상</div><p>'+esc(last.name)+' · '+esc(last.email)+'</p>'
      +'<div class="label">오프라인 승인번호</div><div class="kpi" style="letter-spacing:5px">'+esc(last.approvalCode)+'</div>'
      +'<div class="actions"><button class="btn btn-primary" onclick="copyKakaoInvite()">카카오톡 안내문 복사</button></div></div>'
    : '';
  const rows=state.invitations||[];
  const list=rows.length
    ? '<div class="list">'+rows.map(x=>'<div class="item"><div class="row between"><div><h3>'+esc(x.invitee_name)+'</h3>'
      +'<div class="meta">'+esc(x.email)+' · 만료 '+esc(new Date(x.expires_at).toLocaleString('ko-KR'))+'</div>'
      +'<div class="tiny">실패 '+esc(x.failed_attempts)+'/'+esc(x.max_attempts)+'</div></div>'+invitationStatusBadge(x.status,x.expires_at)+'</div>'
      +(x.status==='pending'?'<div class="actions"><button class="btn btn-danger" onclick="revokeInvitation(\''+x.id+'\')">초대 폐기</button></div>':'')+'</div>').join('')+'</div>'
    : '<div class="empty">생성된 초대가 없습니다.</div>';
  return '<div class="section-title">학습지원단 초대</div>'
    +'<div class="notice">초대 링크는 카카오톡으로 전달하고, 6자리 승인번호는 별도 오프라인 경로로 안내합니다. 기본 유효시간은 48시간입니다.</div>'
    +'<div class="card full"><div class="section-title">명부 일괄 가져오기</div><p class="muted">XLSX 또는 CSV의 첫 행에 성명, 이메일 열이 필요합니다. 최대 200명, 2MB까지 검증합니다.</p>'
    +'<div class="actions"><button class="btn btn-ghost" onclick="downloadSupporterRosterTemplate()">명부 양식 받기</button><label class="btn btn-primary" for="supporter-roster-input">엑셀/CSV 명부 선택</label></div>'
    +'<input id="supporter-roster-input" class="hidden" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onchange="validateSupporterRoster(this)"></div>'
    +previewHtml+bulkHtml
    +'<div class="section-title" style="margin-top:18px">개별 초대</div>'
    +'<div class="card full"><div class="field"><label>성명</label><input id="invite-name" placeholder="예: 김지원"></div>'
    +'<div class="field"><label>로그인 이메일</label><input id="invite-email" type="email" placeholder="example@korea.kr"></div>'
    +'<div class="field"><label>유효시간</label><select id="invite-hours"><option value="24">24시간</option><option value="48" selected>48시간</option><option value="72">72시간</option></select></div>'
    +'<button class="btn btn-primary" onclick="createInvitation()">초대 생성</button></div>'
    +lastHtml+'<div class="section-title" style="margin-top:18px">초대 현황</div>'+list;
}
async function createInvitation(){
  const name=document.getElementById('invite-name').value.trim();
  const email=document.getElementById('invite-email').value.trim();
  const hours=Number(document.getElementById('invite-hours').value||48);
  if(!name||!email){toast('성명과 이메일을 입력해 주세요.');return;}
  if(state.demo){
    const token='0123456789abcdef0123456789abcdef0123456789abcdef';
    state.lastInvite={
      id:'demo-invite',name,email,
      approvalCode:'482731',
      inviteUrl:location.origin+location.pathname+'?invite='+token,
      expiresAt:new Date(Date.now()+hours*3600000).toISOString()
    };
    state.invitations=[{
      id:'demo-invite',invitee_name:name,email,status:'pending',
      expires_at:state.lastInvite.expiresAt,failed_attempts:0,max_attempts:5
    }];
    renderPage();toast('초대가 생성되었습니다. (데모)');return;
  }
  const {data,error}=await state.client.rpc('create_supporter_invitation',{
    p_name:name,p_email:email,p_expires_hours:hours
  });
  if(error){toast(error.message);return;}
  const row=Array.isArray(data)?data[0]:data;
  if(!row){toast('초대를 생성하지 못했습니다.');return;}
  const base=location.origin+location.pathname;
  state.lastInvite={
    id:row.invitation_id,name,email,
    approvalCode:row.approval_code,
    inviteUrl:base+'?invite='+encodeURIComponent(row.invite_token),
    expiresAt:row.expires_at
  };
  await refreshData();
  renderPage();
  toast('초대가 생성되었습니다.');
}
async function copyKakaoInvite(){
  const x=state.lastInvite;
  if(!x) return;
  const text='[제천교육지원청 학습지원단 등록 안내]\n'+x.name+' 선생님, 아래 링크로 접속해 등록해 주세요.\n'+x.inviteUrl+'\n\n승인번호는 보안을 위해 카카오톡으로 전달하지 않습니다. 별도로 안내받은 번호를 입력해 주세요.';
  try{await navigator.clipboard.writeText(text);toast('카카오톡 안내문을 복사했습니다.');}
  catch(e){prompt('아래 내용을 복사해 카카오톡으로 보내세요.',text);}
}
async function revokeInvitation(id){
  if(!confirm('이 초대를 폐기하시겠습니까?')) return;
  if(state.demo){
    state.invitations=(state.invitations||[]).map(x=>x.id===id?{...x,status:'revoked'}:x);
    if(state.lastInvite?.id===id) state.lastInvite=null;
    renderPage();toast('초대를 폐기했습니다. (데모)');return;
  }
  const {error}=await state.client.from('supporter_invitations')
    .update({status:'revoked'}).eq('id',id).eq('status','pending');
  if(error){toast(error.message);return;}
  if(state.lastInvite?.id===id) state.lastInvite=null;
  await refreshData();renderPage();toast('초대를 폐기했습니다.');
}

function supportTypeLabel(v){
  return ({coach:'학습코칭',class:'수업지원',counseling:'학습상담'})[v]||v||'';
}
function studentRosterBadge(status){
  if(status==='valid') return statusBadge('등록 가능','good');
  if(status==='duplicate'||status==='duplicate_file') return statusBadge('중복 후보','warn');
  if(status==='school_missing'||status==='school_ambiguous') return statusBadge('학교 확인','bad');
  return statusBadge('오류','bad');
}
function demoSchoolType(v){
  const s=String(v||'').trim().replace(/\s+/g,'').toLowerCase();
  if(['초','초등','초등학교'].includes(s))return '초';
  if(['중','중등','중학교'].includes(s))return '중';
  if(['고','고등','고등학교'].includes(s))return '고';
  if(['특수','특수학교'].includes(s))return '특수';
  if(['기타'].includes(s))return '기타';
  return null;
}
function demoSupportType(v){
  const s=String(v||'').trim().replace(/\s+/g,'').toLowerCase();
  if(!s)return 'coach';
  if(['coach','코칭','학습코칭','학습지원','학습지원단'].includes(s))return 'coach';
  if(['class','수업','수업지원','교실지원'].includes(s))return 'class';
  if(['counseling','counselor','상담','학습상담'].includes(s))return 'counseling';
  return null;
}
function demoActive(v){
  const s=String(v||'').trim().replace(/\s+/g,'').toLowerCase();
  if(!s)return true;
  if(['y','yes','true','1','활성','사용','재학'].includes(s))return true;
  if(['n','no','false','0','비활성','중지','종료'].includes(s))return false;
  return null;
}
async function parseDemoStudentRoster(file){
  if(!file.name.toLowerCase().endsWith('.csv')) throw new Error('데모 검증에서는 CSV를 사용해 주세요.');
  const raw=parseSimpleCsv(await file.text());
  if(raw.length<2) throw new Error('헤더와 1명 이상의 학생 자료가 필요합니다.');
  const h=raw[0].map(v=>String(v||'').trim().toLowerCase().replace(/[\s_.()\[\]-]+/g,''));
  const col=(aliases)=>h.findIndex(v=>aliases.includes(v));
  const schoolCol=col(['학교','학교명','학교코드','school','schoolname','schoolcode']);
  const typeCol=col(['학교급','학교유형','schooltype']);
  const gradeCol=col(['학년','grade']);
  const classCol=col(['반','학급','class','classno']);
  const nameCol=col(['학생명','성명','이름','학생이름','fullname','name']);
  const aliasCol=col(['별칭','학생별칭','alias']);
  const legacyCol=col(['학생id','학생코드','기존학생id','legacystudentid']);
  const supportCol=col(['희망지원유형','지원유형','지원형태','preferredsupporttype']);
  const activeCol=col(['활성','활성상태','상태','active']);
  if([schoolCol,typeCol,gradeCol,classCol,nameCol].some(x=>x<0)) throw new Error('학교, 학교급, 학년, 반, 학생명 열이 필요합니다.');
  const demoSchools={
    '의림초등학교':'demo-school-1',
    '남당초등학교':'demo-school-2',
    '홍광초등학교':'demo-school-3',
    'V14 테스트학교':'127a0924-5de0-4a66-bdfe-de86dabf361a'
  };
  const existing=new Set(DEMO.assignments.map(a=>[
    a.student.school?.name||a.student?.school?.name||'',
    a.student.full_name,a.student.grade,a.student.class_no
  ].join('|')));
  const rows=raw.slice(1,201).map((r,i)=>{
    const school=String(r[schoolCol]||'').trim();
    const schoolId=demoSchools[school]||null;
    const st=demoSchoolType(r[typeCol]);
    const grade=Number(String(r[gradeCol]||'').trim());
    const classNo=Number(String(r[classCol]||'').trim());
    const fullName=String(r[nameCol]||'').trim();
    const alias=aliasCol>=0?String(r[aliasCol]||'').trim():'';
    const legacy=legacyCol>=0?String(r[legacyCol]||'').trim():'';
    const support=supportCol>=0?demoSupportType(r[supportCol]):'coach';
    const active=activeCol>=0?demoActive(r[activeCol]):true;
    let status='valid',message='등록 가능';
    if(!schoolId){status='school_missing';message='등록된 학교를 찾을 수 없음';}
    else if(!st){status='error';message='학교급 값 오류';}
    else if(!Number.isInteger(grade)||grade<1||(st==='초'&&grade>6)||(['중','고'].includes(st)&&grade>3)){status='error';message='학년 범위 오류';}
    else if(!Number.isInteger(classNo)||classNo<1||classNo>99){status='error';message='반 범위 오류';}
    else if(!fullName){status='error';message='학생명 누락';}
    else if(!support){status='error';message='희망 지원유형 오류';}
    else if(active===null){status='error';message='활성상태 값 오류';}
    else if(existing.has([school,fullName,grade,classNo].join('|'))){status='duplicate';message='기존 동일 학생 후보';}
    return {row_number:i+2,school,school_id:schoolId,school_type:st,grade,class_no:classNo,full_name:fullName,alias:alias||null,legacy_student_id:legacy||null,preferred_support_type:support,active,status,message};
  });
  const keyCounts={};
  rows.forEach(x=>{if(x.school_id&&x.full_name&&x.grade&&x.class_no){const k=[x.school_id,x.full_name,x.grade,x.class_no].join('|');keyCounts[k]=(keyCounts[k]||0)+1;}});
  rows.forEach(x=>{const k=[x.school_id,x.full_name,x.grade,x.class_no].join('|');if(x.status==='valid'&&(keyCounts[k]||0)>1){x.status='duplicate_file';x.message='파일 내 동일 학생 후보';}});
  return {ok:true,filename:file.name,total:rows.length,valid:rows.filter(x=>x.status==='valid').length,invalid:rows.filter(x=>x.status!=='valid').length,truncated:raw.length-1>200,rows};
}
async function validateStudentRoster(input){
  const file=input?.files?.[0];
  if(!file)return;
  state.studentRosterPreview=null;
  state.studentImportResult=null;
  try{
    let data;
    if(state.demo){
      data=await parseDemoStudentRoster(file);
    }else{
      const {data:{session}}=await state.client.auth.getSession();
      if(!session?.access_token)throw new Error('로그인 세션을 확인해 주세요.');
      const form=new FormData();
      form.append('file',file);
      const res=await fetch(CFG.supabaseUrl+'/functions/v1/validate-student-roster',{
        method:'POST',
        headers:{Authorization:'Bearer '+session.access_token,apikey:CFG.supabaseAnonKey},
        body:form
      });
      data=await res.json().catch(()=>({}));
      if(!res.ok||!data.ok)throw new Error(data.message||'학생 명부를 검증하지 못했습니다.');
    }
    state.studentRosterPreview=data;
    input.value='';
    await renderPage();
    toast('학생 명부 검증이 완료되었습니다.');
  }catch(e){
    input.value='';
    toast(e.message||String(e));
  }
}
function downloadStudentRosterTemplate(){
  const csv='학교,학교급,학년,반,학생명,별칭,학생ID,희망지원유형,활성상태\r\nV14 테스트학교,초,4,1,홍길동,길동,STU-001,학습코칭,Y\r\n';
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='학생_등록명부_양식.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function registerValidStudents(){
  const rows=(state.studentRosterPreview?.rows||[]).filter(x=>x.status==='valid');
  if(!rows.length){toast('등록 가능한 학생이 없습니다.');return;}
  if(rows.length>200){toast('한 번에 200명까지만 등록할 수 있습니다.');return;}
  if(!confirm(rows.length+'명의 학생을 등록하시겠습니까?'))return;
  const payload=rows.map(x=>({
    school_id:x.school_id,
    full_name:x.full_name,
    alias:x.alias||null,
    school_type:x.school_type,
    grade:x.grade,
    class_no:x.class_no,
    legacy_student_id:x.legacy_student_id||null,
    preferred_support_type:x.preferred_support_type||'coach',
    active:x.active!==false
  }));
  if(state.demo){
    state.studentImportResult={ok:true,inserted:payload.length,skipped:0,results:payload.map((x,i)=>({ok:true,id:'demo-student-'+i,full_name:x.full_name}))};
    await renderPage();toast('학생 등록이 완료되었습니다. (데모)');return;
  }
  const {data,error}=await state.client.rpc('bulk_register_students',{p_rows:payload});
  if(error){toast(error.message);return;}
  state.studentImportResult=data;
  await renderPage();
  toast('학생 등록이 완료되었습니다.');
}
async function pageStudentImport(){
  const preview=state.studentRosterPreview;
  const result=state.studentImportResult;
  const previewHtml=preview
    ? '<div class="card full" style="margin-top:14px"><div class="row between"><div class="section-title">학생 명부 검증 결과</div><div>'+preview.valid+'명 등록 가능 / '+preview.invalid+'명 확인</div></div>'
      +(preview.truncated?'<div class="notice">한 번에 200명까지만 검증할 수 있습니다. 파일을 나누어 등록해 주세요.</div>':'')
      +'<div class="list">'+preview.rows.map(x=>'<div class="item"><div class="row between"><div><h3>'+esc(x.row_number)+'행 · '+esc(x.full_name||'학생명 없음')+'</h3>'
        +'<div class="meta">'+esc(x.school||'학교 없음')+' · '+esc(x.school_type||'-')+' '+esc(x.grade||'-')+'학년 '+esc(x.class_no||'-')+'반 · '+esc(supportTypeLabel(x.preferred_support_type))+'</div>'
        +'<div class="tiny">'+esc(x.message)+'</div></div>'+studentRosterBadge(x.status)+'</div></div>').join('')+'</div>'
      +(preview.valid?'<div class="actions"><button class="btn btn-good" onclick="registerValidStudents()">유효 '+Math.min(preview.valid,200)+'명 학생 등록</button></div>':'')
      +'</div>' : '';
  const resultHtml=result
    ? '<div class="card full" style="margin-top:14px"><div class="section-title">등록 결과</div><div class="grid"><div class="card"><div class="label">등록</div><div class="kpi">'+esc(result.inserted||0)+'명</div></div><div class="card"><div class="label">중복 제외</div><div class="kpi">'+esc(result.skipped||0)+'명</div></div></div></div>' : '';
  return '<div class="section-title">학생 명부 일괄등록</div>'
    +'<div class="notice">학교 기본정보에 등록된 학교만 학생을 등록합니다. 학교 오타나 미등록 학교는 자동 생성하지 않습니다.</div>'
    +'<div class="card full"><p class="muted">필수: 학교, 학교급, 학년, 반, 학생명 · 선택: 별칭, 학생ID, 희망지원유형, 활성상태</p>'
    +'<div class="actions"><button class="btn btn-ghost" onclick="downloadStudentRosterTemplate()">학생 명부 양식 받기</button><label class="btn btn-primary" for="student-roster-input">XLSX/CSV 명부 선택</label></div>'
    +'<input id="student-roster-input" class="hidden" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onchange="validateStudentRoster(this)"></div>'
    +previewHtml+resultHtml;
}

function assignmentKindLabel(v){
  return v==='class'?'수업지원':'학습코칭';
}
function expectedMatchingKind(student){
  if(student?.preferred_support_type==='class') return 'class';
  if(student?.preferred_support_type==='counseling') return null;
  return 'coach';
}
function matchingLoad(supporterId){
  return (state.matchingAssignments||[]).filter(a=>a.status==='active'&&a.supporter_id===supporterId).length;
}
async function pageMatching(){
  const supporters=(state.matchingSupporters||[]).filter(x=>x.active!==false);
  const students=(state.matchingStudents||[]).filter(x=>x.active!==false);
  const assignments=state.matchingAssignments||[];
  const active=assignments.filter(x=>x.status==='active');
  const eligible=students.filter(s=>s.preferred_support_type!=='counseling');
  const counselingCount=students.length-eligible.length;
  const unassigned=eligible.filter(s=>{
    const kind=expectedMatchingKind(s);
    return !active.some(a=>a.student_id===s.id&&a.kind===kind);
  });

  const supporterOptions=supporters.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.display_name)+' · 현재 '+matchingLoad(s.id)+'명'+(s.identity_verified?'':' · 본인확인 대기')+'</option>').join('');
  const studentOptions=eligible.map(s=>{
    const pref=expectedMatchingKind(s)||'coach';
    const assigned=active.find(a=>a.student_id===s.id&&a.kind===pref);
    const label=(s.school?.name||'학교 미지정')+' · '+(s.grade||'-')+'학년 '+(s.class_no||'-')+'반 · '+(s.alias||s.full_name)+' · 희망 '+assignmentKindLabel(pref)+(assigned?' · 배정됨':'');
    return '<option value="'+esc(s.id)+'" data-kind="'+pref+'" '+(assigned?'disabled':'')+'>'+esc(label)+'</option>';
  }).join('');

  const activeHtml=active.length
    ? '<div class="list">'+active.map(a=>'<div class="item"><div class="row between"><div><h3>'+esc(a.student?.alias||a.student?.full_name||'학생')+' · '+esc(a.supporter?.display_name||'지원단')+'</h3>'
      +'<div class="meta">'+esc(a.student?.school?.name||'학교')+' · '+assignmentKindLabel(a.kind)+' · 시작 '+esc(a.started_on||'')+'</div>'
      +'<div class="tiny">'+esc(a.legacy_matching_id||'')+'</div></div>'+statusBadge('활성','good')+'</div>'
      +'<div class="actions"><button class="btn btn-danger" onclick="endStudentMatch(\''+a.id+'\')">배정 종료</button></div></div>').join('')+'</div>'
    : '<div class="empty">활성 배정이 없습니다.</div>';

  const history=assignments.filter(x=>x.status!=='active').slice(0,20);
  const historyHtml=history.length
    ? '<div class="list">'+history.map(a=>'<div class="item"><div class="row between"><div><h3>'+esc(a.student?.alias||a.student?.full_name||'학생')+' · '+esc(a.supporter?.display_name||'지원단')+'</h3>'
      +'<div class="meta">'+assignmentKindLabel(a.kind)+' · '+esc(a.started_on||'')+'~'+esc(a.ended_on||'')+'</div></div>'+statusBadge('종료','neutral')+'</div></div>').join('')+'</div>'
    : '<div class="empty">종료된 배정 이력이 없습니다.</div>';

  return '<div class="section-title">학습지원단 ↔ 학생 매칭</div>'
    +'<div class="notice">같은 학생에게 같은 지원유형의 활성 배정은 1건만 허용합니다. 학습상담 희망 학생은 상담사 관리에서 별도로 배정합니다.</div>'
    +'<div class="grid"><div class="card"><div class="label">활성 지원단</div><div class="kpi">'+supporters.length+'명</div></div>'
    +'<div class="card"><div class="label">활성 배정</div><div class="kpi">'+active.length+'건</div></div>'
    +'<div class="card"><div class="label">미배정 학생</div><div class="kpi">'+unassigned.length+'명</div></div>'
    +'<div class="card"><div class="label">상담 별도관리</div><div class="kpi">'+counselingCount+'명</div></div></div>'
    +'<div class="card full" style="margin-top:14px"><div class="section-title">새 배정</div>'
    +'<div class="field"><label>지원단원</label><select id="matching-supporter">'+(supporterOptions||'<option value="">활성 지원단원 없음</option>')+'</select></div>'
    +'<div class="field"><label>학생</label><select id="matching-student" onchange="syncMatchingKind()">'+(studentOptions||'<option value="">배정 가능한 학생 없음</option>')+'</select></div>'
    +'<div class="field"><label>지원유형</label><select id="matching-kind"><option value="coach">학습코칭</option><option value="class">수업지원</option></select></div>'
    +'<div class="field"><label>배정 시작일</label><input id="matching-started-on" type="date" max="'+seoulDate()+'" value="'+seoulDate()+'"></div>'
    +'<button class="btn btn-good" onclick="createStudentMatch()">배정 확정</button></div>'
    +'<div class="section-title" style="margin-top:18px">현재 배정</div>'+activeHtml
    +'<div class="section-title" style="margin-top:18px">종료 이력</div>'+historyHtml;
}
function syncMatchingKind(){
  const studentSelect=document.getElementById('matching-student');
  const kindSelect=document.getElementById('matching-kind');
  if(!studentSelect||!kindSelect)return;
  const option=studentSelect.options[studentSelect.selectedIndex];
  if(option?.dataset?.kind)kindSelect.value=option.dataset.kind;
}
async function createStudentMatch(){
  const supporterId=document.getElementById('matching-supporter')?.value||'';
  const studentId=document.getElementById('matching-student')?.value||'';
  const kind=document.getElementById('matching-kind')?.value||'coach';
  const startedOn=document.getElementById('matching-started-on')?.value||seoulDate();
  if(!supporterId||!studentId){toast('지원단원과 학생을 선택해 주세요.');return;}
  const supporter=(state.matchingSupporters||[]).find(x=>x.id===supporterId);
  const student=(state.matchingStudents||[]).find(x=>x.id===studentId);
  if(!confirm((supporter?.display_name||'지원단')+' 선생님에게 '+(student?.alias||student?.full_name||'학생')+' 학생을 '+assignmentKindLabel(kind)+'으로 배정하시겠습니까?'))return;

  if(state.demo){
    const duplicate=(DEMO.matchingAssignments||[]).find(a=>a.status==='active'&&a.student_id===studentId&&a.kind===kind);
    if(duplicate){
      toast(duplicate.supporter_id===supporterId?'이미 같은 배정이 있습니다.':'이미 다른 지원단원에게 배정된 학생입니다.');
      return;
    }
    const row={
      id:'demo-match-'+Date.now(),
      legacy_matching_id:'JCEC-MAT-DEMO-'+String((DEMO.matchingAssignments||[]).length+1).padStart(5,'0'),
      supporter_id:supporterId,student_id:studentId,kind,status:'active',started_on:startedOn,ended_on:null,
      supporter,student
    };
    DEMO.matchingAssignments.push(row);
    await refreshData();renderPage();toast('배정이 완료되었습니다. (데모)');return;
  }

  const {data,error}=await state.client.rpc('match_supporter_student',{
    p_supporter_id:supporterId,
    p_student_id:studentId,
    p_kind:kind,
    p_started_on:startedOn
  });
  if(error){toast(error.message);return;}
  await refreshData();renderPage();
  toast(data?.existing?'이미 등록된 동일 배정입니다.':'학생 배정이 완료되었습니다.');
}
async function endStudentMatch(id){
  const assignment=(state.matchingAssignments||[]).find(x=>x.id===id);
  if(!assignment)return;
  if(!confirm((assignment.student?.alias||assignment.student?.full_name||'학생')+' 학생의 '+assignmentKindLabel(assignment.kind)+' 배정을 종료하시겠습니까?\n연결된 활성 시간표도 함께 비활성화됩니다.'))return;
  if(state.demo){
    assignment.status='ended';assignment.ended_on=seoulDate();
    await refreshData();renderPage();toast('배정을 종료했습니다. (데모)');return;
  }
  const {error}=await state.client.rpc('end_student_assignment',{
    p_assignment_id:id,
    p_ended_on:seoulDate()
  });
  if(error){toast(error.message);return;}
  await refreshData();renderPage();toast('배정을 종료했습니다.');
}

const WEEKDAY_LABEL={1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};
function addDateDays(dateStr,days){
  const d=new Date(dateStr+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function dateIsoDow(dateStr){
  const d=new Date(dateStr+'T12:00:00Z').getUTCDay();
  return d===0?7:d;
}
function scheduleTimeOverlap(a,b){
  const as=String(a.planned_start||'').slice(0,5), ae=String(a.planned_end||'').slice(0,5);
  const bs=String(b.planned_start||'').slice(0,5), be=String(b.planned_end||'').slice(0,5);
  return as<be && ae>bs;
}
function scheduleDateOverlap(a,b){
  const as=a.specific_date||null, bs=b.specific_date||null;
  if(as&&bs)return as===bs;
  if(as&&!bs){
    return Number(b.weekday)===dateIsoDow(as)
      && as>=String(b.effective_from||'0000-01-01')
      && as<=String(b.effective_to||'9999-12-31');
  }
  if(!as&&bs){
    return Number(a.weekday)===dateIsoDow(bs)
      && bs>=String(a.effective_from||'0000-01-01')
      && bs<=String(a.effective_to||'9999-12-31');
  }
  return Number(a.weekday)===Number(b.weekday)
    && String(a.effective_from||'0000-01-01')<=String(b.effective_to||'9999-12-31')
    && String(b.effective_from||'0000-01-01')<=String(a.effective_to||'9999-12-31');
}
function existingScheduleConflicts(){
  const rows=(state.scheduleAdminPlans||[]).filter(p=>p.active!==false&&p.assignment?.status!=='ended');
  const conflicts=[];
  for(let i=0;i<rows.length;i++){
    for(let j=i+1;j<rows.length;j++){
      const a=rows[i],b=rows[j];
      const sameSupporter=a.assignment?.supporter_id&&a.assignment?.supporter_id===b.assignment?.supporter_id;
      const sameStudent=a.assignment?.student_id&&a.assignment?.student_id===b.assignment?.student_id;
      if(!(sameSupporter||sameStudent))continue;
      if(!scheduleTimeOverlap(a,b)||!scheduleDateOverlap(a,b))continue;
      conflicts.push({a,b,sameSupporter,sameStudent});
    }
  }
  return conflicts;
}
function schedulePlanLabel(p){
  const time=String(p.planned_start||'').slice(0,5)+'~'+String(p.planned_end||'').slice(0,5);
  if(p.specific_date)return p.specific_date+' · '+time;
  return '매주 '+(WEEKDAY_LABEL[Number(p.weekday)]||'?')+'요일 · '+time+' · '+esc(p.effective_from||'')+'~'+esc(p.effective_to||'');
}
function syncScheduleMode(){
  const mode=document.getElementById('schedule-mode')?.value||'recurring';
  document.getElementById('schedule-recurring-fields')?.classList.toggle('hidden',mode!=='recurring');
  document.getElementById('schedule-specific-fields')?.classList.toggle('hidden',mode!=='specific');
}
function syncScheduleAssignment(){
  const assignmentId=document.getElementById('schedule-assignment')?.value||'';
  const assignment=(state.matchingAssignments||[]).find(a=>a.id===assignmentId);
  const schoolId=assignment?.student?.school?.id;
  const schoolSelect=document.getElementById('schedule-school');
  if(schoolId&&schoolSelect&&[...schoolSelect.options].some(o=>o.value===schoolId))schoolSelect.value=schoolId;
}
async function pageScheduleAdmin(){
  const assignments=(state.matchingAssignments||[]).filter(a=>a.status==='active');
  const plans=state.scheduleAdminPlans||[];
  const activePlans=plans.filter(p=>p.active!==false);
  const inactivePlans=plans.filter(p=>p.active===false).slice(0,20);
  const conflicts=existingScheduleConflicts();
  const firstAssignment=assignments[0]||null;
  const defaultSchoolId=firstAssignment?.student?.school?.id||state.activeSchools?.[0]?.id||'';
  const assignmentOptions=assignments.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.supporter?.display_name||'지원단')+' · '+esc(a.student?.alias||a.student?.full_name||'학생')+' · '+assignmentKindLabel(a.kind)+'</option>').join('');
  const schoolOptions=(state.activeSchools||[]).map(s=>'<option value="'+esc(s.id)+'" '+(s.id===defaultSchoolId?'selected':'')+'>'+esc(s.name)+'</option>').join('');
  const activeHtml=activePlans.length
    ? '<div class="list">'+activePlans.map(p=>'<div class="item"><div class="row between"><div><h3>'+esc(p.assignment?.supporter?.display_name||'지원단')+' · '+esc(p.assignment?.student?.alias||p.assignment?.student?.full_name||'학생')+'</h3>'
      +'<div class="meta">'+schedulePlanLabel(p)+' · '+esc(p.school?.name||'학교')+' · '+esc(p.place||'')+'</div></div>'+statusBadge('활성','good')+'</div>'
      +'<div class="actions"><button class="btn btn-danger" onclick="deactivateSchedulePlan(\''+p.id+'\')">시간표 비활성화</button></div></div>').join('')+'</div>'
    : '<div class="empty">활성 시간표가 없습니다.</div>';
  const inactiveHtml=inactivePlans.length
    ? '<div class="list">'+inactivePlans.map(p=>'<div class="item"><div class="row between"><div><h3>'+esc(p.assignment?.supporter?.display_name||'지원단')+' · '+esc(p.assignment?.student?.alias||p.assignment?.student?.full_name||'학생')+'</h3>'
      +'<div class="meta">'+schedulePlanLabel(p)+' · '+esc(p.place||'')+'</div></div>'+statusBadge('비활성','neutral')+'</div></div>').join('')+'</div>'
    : '<div class="empty">비활성 시간표가 없습니다.</div>';
  const conflictHtml=conflicts.length
    ? '<div class="notice" style="margin-top:14px"><b>기존 시간표 충돌 '+conflicts.length+'건</b><br>'+conflicts.slice(0,5).map(x=>{
        const who=x.sameSupporter&&x.sameStudent?'동일 지원단·학생':x.sameSupporter?'지원단 일정':'학생 일정';
        return esc(who+' · '+(x.a.assignment?.supporter?.display_name||'지원단')+' · '+String(x.a.planned_start).slice(0,5)+'~'+String(x.a.planned_end).slice(0,5)+' ↔ '+String(x.b.planned_start).slice(0,5)+'~'+String(x.b.planned_end).slice(0,5));
      }).join('<br>')+(conflicts.length>5?'<br>외 '+(conflicts.length-5)+'건':'')+'</div>'
    : '<div class="notice" style="margin-top:14px">현재 활성 시간표에서 지원단·학생 중복시간 충돌이 발견되지 않았습니다.</div>';
  return '<div class="section-title">시간표 관리</div>'
    +'<div class="notice">반복 시간표 한 건을 만들면 적용기간 동안 해당 요일의 일정으로 사용됩니다. 새 시간표는 DB에서 지원단·학생 중복시간을 다시 검사합니다.</div>'
    +'<div class="grid"><div class="card"><div class="label">활성 배정</div><div class="kpi">'+assignments.length+'건</div></div>'
    +'<div class="card"><div class="label">활성 시간표</div><div class="kpi">'+activePlans.length+'건</div></div>'
    +'<div class="card"><div class="label">기존 충돌</div><div class="kpi">'+conflicts.length+'건</div></div></div>'
    +conflictHtml
    +'<div class="card full" style="margin-top:14px"><div class="section-title">새 시간표</div>'
    +'<div class="field"><label>배정</label><select id="schedule-assignment" onchange="syncScheduleAssignment()">'+(assignmentOptions||'<option value="">활성 배정 없음</option>')+'</select></div>'
    +'<div class="field"><label>시간표 유형</label><select id="schedule-mode" onchange="syncScheduleMode()"><option value="recurring">반복 시간표</option><option value="specific">특정일 시간표</option></select></div>'
    +'<div id="schedule-recurring-fields"><div class="field"><label>요일</label><select id="schedule-weekday">'+Object.entries(WEEKDAY_LABEL).map(([k,v])=>'<option value="'+k+'" '+(Number(k)===isoDow()?'selected':'')+'>'+v+'요일</option>').join('')+'</select></div>'
    +'<div class="field"><label>적용 시작일</label><input id="schedule-effective-from" type="date" value="'+seoulDate()+'"></div>'
    +'<div class="field"><label>적용 종료일</label><input id="schedule-effective-to" type="date" value="'+addDateDays(seoulDate(),90)+'"></div></div>'
    +'<div id="schedule-specific-fields" class="hidden"><div class="field"><label>특정일</label><input id="schedule-specific-date" type="date" value="'+seoulDate()+'"></div></div>'
    +'<div class="field"><label>시작시간</label><input id="schedule-start" type="time" value="14:00"></div>'
    +'<div class="field"><label>종료시간</label><input id="schedule-end" type="time" value="14:50"></div>'
    +'<div class="field"><label>학교</label><select id="schedule-school">'+(schoolOptions||'<option value="">활성 학교 없음</option>')+'</select></div>'
    +'<div class="field"><label>장소</label><input id="schedule-place" placeholder="예: 학습지원실"></div>'
    +'<button class="btn btn-good" onclick="createSchedulePlan()">시간표 생성</button></div>'
    +'<div class="section-title" style="margin-top:18px">현재 시간표</div>'+activeHtml
    +'<div class="section-title" style="margin-top:18px">비활성 시간표</div>'+inactiveHtml;
}
function demoScheduleConflict(candidate){
  const rows=(state.scheduleAdminPlans||[]).filter(p=>p.active!==false);
  for(const p of rows){
    const sameSupporter=p.assignment?.supporter_id===candidate.assignment?.supporter_id;
    const sameStudent=p.assignment?.student_id===candidate.assignment?.student_id;
    if(!(sameSupporter||sameStudent))continue;
    if(scheduleTimeOverlap(p,candidate)&&scheduleDateOverlap(p,candidate)){
      const who=sameSupporter&&sameStudent?'같은 지원단원과 학생':sameSupporter?'지원단원':'학생';
      return '시간표 충돌: '+who+'의 기존 일정이 겹칩니다. ('+String(p.planned_start).slice(0,5)+'~'+String(p.planned_end).slice(0,5)+')';
    }
  }
  return '';
}
async function createSchedulePlan(){
  const assignmentId=document.getElementById('schedule-assignment')?.value||'';
  const mode=document.getElementById('schedule-mode')?.value||'recurring';
  const start=document.getElementById('schedule-start')?.value||'';
  const end=document.getElementById('schedule-end')?.value||'';
  const place=document.getElementById('schedule-place')?.value.trim()||'';
  const schoolId=document.getElementById('schedule-school')?.value||'';
  const weekday=Number(document.getElementById('schedule-weekday')?.value||0);
  const specificDate=document.getElementById('schedule-specific-date')?.value||null;
  const effectiveFrom=document.getElementById('schedule-effective-from')?.value||null;
  const effectiveTo=document.getElementById('schedule-effective-to')?.value||null;
  if(!assignmentId||!schoolId){toast('배정과 학교를 선택해 주세요.');return;}
  if(!start||!end||end<=start){toast('시작·종료시간을 확인해 주세요.');return;}
  if(!place){toast('수업 장소를 입력해 주세요.');return;}
  if(mode==='specific'&&!specificDate){toast('특정일을 선택해 주세요.');return;}
  if(mode==='recurring'&&(!weekday||!effectiveFrom||!effectiveTo||effectiveTo<effectiveFrom)){toast('반복 요일과 적용기간을 확인해 주세요.');return;}
  const assignment=(state.matchingAssignments||[]).find(a=>a.id===assignmentId);
  const studentSchoolId=assignment?.student?.school?.id;
  if(studentSchoolId&&studentSchoolId!==schoolId){
    if(!confirm('학생 소속학교와 다른 학교가 선택되었습니다. 그래도 이 장소에서 수업합니까?'))return;
  }
  if(state.demo){
    const school=(state.activeSchools||[]).find(s=>s.id===schoolId)||null;
    const row={
      id:'demo-plan-'+Date.now(),assignment_id:assignmentId,school_id:schoolId,
      specific_date:mode==='specific'?specificDate:null,
      weekday:mode==='recurring'?weekday:null,
      planned_start:start,planned_end:end,place,
      effective_from:mode==='specific'?specificDate:effectiveFrom,
      effective_to:mode==='specific'?specificDate:effectiveTo,
      active:true,school,assignment
    };
    const conflict=demoScheduleConflict(row);
    if(conflict){toast(conflict);return;}
    DEMO.plans.push(row);
    await refreshData();renderPage();toast('시간표를 생성했습니다. (데모)');return;
  }
  const {error}=await state.client.rpc('create_schedule_plan_checked',{
    p_assignment_id:assignmentId,
    p_mode:mode,
    p_planned_start:start,
    p_planned_end:end,
    p_place:place,
    p_school_id:schoolId,
    p_weekday:mode==='recurring'?weekday:null,
    p_specific_date:mode==='specific'?specificDate:null,
    p_effective_from:mode==='recurring'?effectiveFrom:null,
    p_effective_to:mode==='recurring'?effectiveTo:null
  });
  if(error){toast(error.message);return;}
  await refreshData();renderPage();toast('시간표를 생성했습니다.');
}
async function deactivateSchedulePlan(id){
  const plan=(state.scheduleAdminPlans||[]).find(p=>p.id===id);
  if(!plan)return;
  if(!confirm((plan.assignment?.student?.alias||plan.assignment?.student?.full_name||'학생')+' 학생의 시간표를 비활성화하시겠습니까?\n이미 저장된 수업 실적은 삭제되지 않습니다.'))return;
  if(state.demo){
    const p=DEMO.plans.find(x=>x.id===id);if(p)p.active=false;
    await refreshData();renderPage();toast('시간표를 비활성화했습니다. (데모)');return;
  }
  const {error}=await state.client.rpc('deactivate_schedule_plan',{p_schedule_plan_id:id});
  if(error){toast(error.message);return;}
  await refreshData();renderPage();toast('시간표를 비활성화했습니다.');
}

function monthLastDay(ym){
  const m=String(ym||'').match(/^(\d{4})-(\d{2})$/);
  if(!m)return '';
  const y=Number(m[1]), month=Number(m[2]);
  return y+'-'+String(month).padStart(2,'0')+'-'+String(new Date(Date.UTC(y,month,0)).getUTCDate()).padStart(2,'0');
}
async function pageV13Handoff(){
  const ym=seoulDate().slice(0,7);
  return '<div class="section-title">V13 포터블 연계</div>'
    +'<div class="notice">완료된 V14 실적을 V13 Python 엔진으로 전달하는 내부 연계파일입니다. GPS 좌표는 포함하지 않습니다.</div>'
    +'<div class="card full"><div class="field"><label>대상 월</label><input id="v13-handoff-month" type="month" value="'+ym+'"></div>'
    +'<p class="muted">자동검증·관리자확인·지급상태가 함께 전달됩니다. 승인 전 실적은 V13 정산에 포함되지 않으며, 이후 다시 내보내면 같은 세션 ID가 갱신됩니다.</p>'
    +'<button class="btn btn-primary" onclick="exportV13Handoff()">V13 연계파일 만들기</button></div>'
    +'<div class="card full" style="margin-top:14px"><div class="section-title">V13에서 가져오는 방법</div>'
    +'<p>V13 포터블 프로그램을 열고 상단의 <b>☁️ V14 실적 가져오기</b>를 눌러 방금 받은 JSON 파일을 선택합니다.</p>'
    +'<p class="tiny">V13 Python 엔진이 매칭ID를 대조하여 실적을 투영하고, Browser 저장소와 SQLite를 함께 갱신합니다. 같은 파일을 다시 불러와도 세션 ID 기준으로 중복되지 않습니다.</p></div>';
}
async function exportV13Handoff(){
  const ym=document.getElementById('v13-handoff-month')?.value||seoulDate().slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(ym)){toast('대상 월을 확인해 주세요.');return;}
  if(state.demo){
    toast('실제 로그인 환경에서 연계파일을 만들 수 있습니다.','warning');
    return;
  }
  const from=ym+'-01', to=monthLastDay(ym);
  const {data,error}=await state.client
    .from('v13_session_projection')
    .select('*')
    .gte('work_date',from)
    .lte('work_date',to)
    .order('work_date',{ascending:true})
    .order('start_at',{ascending:true});
  if(error){toast(error.message);return;}
  const sessions=data||[];
  if(!sessions.length){toast('선택한 월의 완료 실적이 없습니다.','warning');return;}
  const payload={
    schema:'cb-edu-clinic-v14-v13-projection-v1',
    exported_at:new Date().toISOString(),
    org_name:state.settings?.org_name||'제천교육지원청',
    month:ym,
    sessions
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='V14_V13_실적연계_'+ym+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('V13 연계파일 '+sessions.length+'건을 만들었습니다.','success');
}

async function pageOfficeHome(){
  const m=officeMetrics();
  const officeActions=(state.role==='admin'||state.role==='supervisor')
    ? '<div class="actions"><button class="btn btn-primary" onclick="go(\'invites\')">학습지원단 초대</button><button class="btn btn-ghost" onclick="go(\'student-import\')">학생 명부</button><button class="btn btn-good" onclick="go(\'matching\')">매칭 관리</button><button class="btn btn-ghost" onclick="go(\'schedule-admin\')">시간표 관리</button><button class="btn btn-ghost" onclick="go(\'v13-handoff\')">V13 연계</button></div>' : '';
  return '<section class="hero"><h1>'+ROLE_LABEL[state.role]+' 대시보드</h1><p>정상 활동은 자동검증하고 예외만 사람이 확인합니다.</p>'+officeActions+'</section><div class="grid">'
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
  const editable=state.sessions.filter(s=>s.session_status==='completed'&&s.settlement_state==='pending'&&['pending','review_required','confirmed','rejected'].includes(s.verification_state));
  const waiting=editable.filter(s=>s.verification_state==='pending'||s.verification_state==='review_required');
  const decided=editable.filter(s=>s.verification_state==='confirmed'||s.verification_state==='rejected');

  const waitingHtml=waiting.length
    ? '<div class="list">'+waiting.map(s=>'<div class="item"><div class="row between"><div><h3>'+esc(s.assignment?.supporter?.display_name||'지원단')+' · '+esc(s.student?.full_name||'학생')+'</h3><div class="meta">'
      +esc(s.work_date)+' · '+minutesBetween(s.start_at,s.end_at)+'분 · '+esc(s.verification_reason||'확인 필요')+'</div></div>'+verificationLabel(s.verification_state)+'</div>'
      +'<div class="actions"><button class="btn btn-ghost" onclick="reverifySession(\''+s.id+'\')">자동 재검증</button><button class="btn btn-good" onclick="confirmSession(\''+s.id+'\')">확인 완료</button><button class="btn btn-danger" onclick="rejectSession(\''+s.id+'\')">반려</button></div></div>').join('')+'</div>'
    : '<div class="empty">현재 확인할 예외가 없습니다.</div>';

  const decidedHtml=decided.length
    ? '<div class="list">'+decided.map(s=>'<div class="item"><div class="row between"><div><h3>'+esc(s.assignment?.supporter?.display_name||'지원단')+' · '+esc(s.student?.full_name||'학생')+'</h3><div class="meta">'
      +esc(s.work_date)+' · '+minutesBetween(s.start_at,s.end_at)+'분 · '+esc(s.verification_reason||'')+'</div></div>'+verificationLabel(s.verification_state)+'</div>'
      +'<div class="actions"><button class="btn btn-ghost" onclick="returnSessionToReview(\''+s.id+'\')">다시 검토</button></div></div>').join('')+'</div>'
    : '<div class="empty">지급승인 전 수정 가능한 처리 건이 없습니다.</div>';

  return '<div class="section-title">활동 확인 예외</div>'
    +'<div class="notice">지급 승인 전까지 검증상태를 수정할 수 있습니다. 자동 재검증은 현재 저장된 학교 기준위치·GPS·수업시간으로 다시 계산합니다.</div>'
    +'<div class="section-title" style="margin-top:18px">확인 필요</div>'+waitingHtml
    +'<div class="section-title" style="margin-top:18px">처리 완료 · 수정 가능</div>'+decidedHtml;
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
    const reader=new FileReader();
    reader.onload=async()=>{
      state.demoPhotoUrl=String(reader.result||'');
      toast('사진 등록이 완료되었습니다. (데모)');
      input.value='';
      await renderPage();
    };
    reader.onerror=()=>{
      toast('사진을 읽지 못했습니다.');
      input.value='';
    };
    reader.readAsDataURL(file);
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
async function resolveSessionVerification(id,action,reason){
  if(state.demo){
    const s=DEMO.sessions.find(x=>x.id===id);
    if(!s)return;
    if(action==='confirm'){s.verification_state='confirmed';s.verification_reason=reason||'담당자 확인 완료';}
    if(action==='reject'){s.verification_state='rejected';s.verification_reason=reason||'반려';}
    if(action==='review'){s.verification_state='review_required';s.verification_reason=reason||'담당자 재검토로 전환';}
    await refreshData();renderPage();return true;
  }
  const {data,error}=await state.client.rpc('resolve_session_verification',{
    p_session_id:id,
    p_action:action,
    p_reason:reason||null
  });
  if(error){toast(error.message);return false;}
  await refreshData();
  const label=data?.verification_state==='confirmed'?'확인 완료':data?.verification_state==='rejected'?'반려':'다시 검토';
  toast('검증상태를 '+label+'로 변경했습니다.');
  renderPage();
  return true;
}
async function confirmSession(id){
  if(!confirm('이 실적을 확인 완료 처리하시겠습니까?'))return;
  await resolveSessionVerification(id,'confirm','담당자 확인 완료');
}
async function rejectSession(id){
  const reason=prompt('반려 사유를 입력하세요.');if(!reason)return;
  await resolveSessionVerification(id,'reject',reason);
}
async function returnSessionToReview(id){
  if(!confirm('이 실적을 다시 검토 상태로 되돌리시겠습니까?'))return;
  await resolveSessionVerification(id,'review','담당자 재검토로 전환');
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

window.signIn=signIn; window.signOut=signOut; window.redeemInvite=redeemInvite; window.switchRole=switchRole; window.go=go;
window.createInvitation=createInvitation; window.copyKakaoInvite=copyKakaoInvite; window.revokeInvitation=revokeInvitation;
window.validateSupporterRoster=validateSupporterRoster; window.downloadSupporterRosterTemplate=downloadSupporterRosterTemplate; window.createBulkInvitations=createBulkInvitations; window.copyBulkKakaoInvite=copyBulkKakaoInvite;
window.validateStudentRoster=validateStudentRoster; window.downloadStudentRosterTemplate=downloadStudentRosterTemplate; window.registerValidStudents=registerValidStudents;
window.syncMatchingKind=syncMatchingKind; window.createStudentMatch=createStudentMatch; window.endStudentMatch=endStudentMatch;
window.syncScheduleMode=syncScheduleMode; window.syncScheduleAssignment=syncScheduleAssignment; window.createSchedulePlan=createSchedulePlan; window.deactivateSchedulePlan=deactivateSchedulePlan;
window.exportV13Handoff=exportV13Handoff;
window.startLesson=startLesson; window.endLesson=endLesson; window.saveLessonRecord=saveLessonRecord; window.setSchoolCurrentLocation=setSchoolCurrentLocation; window.uploadMyIdPhoto=uploadMyIdPhoto;
window.addCounseling=addCounseling; window.requestScheduleChange=requestScheduleChange;
window.reverifySession=reverifySession; window.confirmSession=confirmSession; window.rejectSession=rejectSession; window.returnSessionToReview=returnSessionToReview; window.approveSession=approveSession; window.approveAll=approveAll;

init().catch(e=>{$app.innerHTML='<div class="login"><h2>초기화 오류</h2><p>'+esc(e.message||e)+'</p></div>';});
