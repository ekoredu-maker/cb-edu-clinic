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

