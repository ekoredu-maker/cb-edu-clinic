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
      if(h){ h.textContent = h.textContent.replace(/V\d+\.\d+\s*\w*\s*Edition/, 'V10.1 Complete Edition'); }
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
          if(el && !el.value) el.value = thisMonth;
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
      if(h) h.textContent = 'V11 · 충북종합학습클리닉 업무관리 프로그램 · Modular Edition';

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

  console.log('[V10.2] 패치 로드 완료 — 충북종합학습클리닉 업무관리 프로그램');
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
      if(sub==='sub-t5-today') safeCall(loadTodayRec);
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
      if(title) title.textContent = '🎓 학습클리닉 통합관리 V11';
      var h = document.getElementById('hdr-sub');
      if(h) h.textContent = 'V11 · 충북종합학습클리닉 업무관리 프로그램 · Modular Edition';
      var loginSub = document.querySelector('#login-overlay p span');
      if(loginSub) loginSub.textContent = 'V11 Stable Edition';
      var confirmerEl = document.getElementById('cfg-confirmer');
      if(confirmerEl && db && db.cfg){
        if(!db.cfg.confirmer || !String(db.cfg.confirmer).trim()) db.cfg.confirmer = '담당 장학사';
        confirmerEl.value = db.cfg.confirmer;
      }
    }, 30);
  });
})();

/* ================================================================= */

