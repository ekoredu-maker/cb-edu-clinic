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

