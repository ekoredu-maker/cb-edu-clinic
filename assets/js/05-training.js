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

