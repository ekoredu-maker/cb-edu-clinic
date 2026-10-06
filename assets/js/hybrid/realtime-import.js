import { PythonBridge } from './python-bridge.js';

const HANDOFF_SCHEMA = 'cb-edu-clinic-v14-v13-projection-v1';

function toast(message, type='info'){
  if(typeof window.toast === 'function') window.toast(message, type);
  else window.alert(message);
}

export function validateRealtimeHandoff(payload){
  if(!payload || typeof payload !== 'object'){
    throw new Error('연계파일 형식이 올바르지 않습니다.');
  }
  if(payload.schema !== HANDOFF_SCHEMA){
    throw new Error('지원하지 않는 V14 연계파일입니다.');
  }
  if(!Array.isArray(payload.sessions)){
    throw new Error('연계파일에 sessions 배열이 없습니다.');
  }
  for(const row of payload.sessions){
    if(!row || typeof row !== 'object') throw new Error('실적 행 형식이 올바르지 않습니다.');
    if(!row.id) throw new Error('세션 ID가 없는 실적이 있습니다.');
    if(!row.legacy_matching_id) throw new Error('V13 매칭 ID가 없는 실적이 있습니다.');
  }
  return {
    month:String(payload.month||''),
    exportedAt:String(payload.exported_at||''),
    count:payload.sessions.length,
    sessions:payload.sessions,
  };
}

async function importHandoffFile(file){
  if(!PythonBridge.isAvailable()){
    throw new Error('V13 Python 엔진이 연결된 포터블 프로그램에서만 가져올 수 있습니다.');
  }
  if(typeof window.__V13_GET_BROWSER_STATE__ !== 'function'
     || typeof window.__V13_APPLY_PROJECTED_STATE__ !== 'function'){
    throw new Error('V13 상태 연결 모듈을 찾지 못했습니다.');
  }

  const text = await file.text();
  const parsed = JSON.parse(text);
  const handoff = validateRealtimeHandoff(parsed);

  if(handoff.count === 0){
    toast('연계할 완료 실적이 없습니다.','warning');
    return;
  }

  const state = window.__V13_GET_BROWSER_STATE__();
  const projected = await PythonBridge.realtimeProject(state, handoff.sessions);
  if(!projected?.ok || !projected.state){
    throw new Error('Python 실적 투영에 실패했습니다.');
  }

  const changed = Number(projected.projected||0) + Number(projected.updated||0);
  const skipped = Number(projected.skipped||0);
  if(changed === 0 && skipped === 0){
    toast('이미 반영된 실적입니다. 변경사항이 없습니다.','info');
    return;
  }

  if(skipped > 0){
    const examples=(projected.warnings||[]).slice(0,3).map(x=>x.message||x.code).join('\n');
    const ok=window.confirm(
      'V13 매칭을 찾지 못한 실적이 '+skipped+'건 있습니다.\n'
      +'매칭된 '+changed+'건만 반영하시겠습니까?'
      +(examples?'\n\n'+examples:'')
    );
    if(!ok) return;
  }else{
    const ok=window.confirm(
      'V14 실적 '+handoff.count+'건을 확인했습니다.\n'
      +'신규 '+Number(projected.projected||0)+'건, 갱신 '+Number(projected.updated||0)+'건을 V13에 반영하시겠습니까?'
    );
    if(!ok) return;
  }

  // Python/SQLite를 먼저 갱신하고 성공한 경우에만 브라우저 상태를 교체한다.
  await PythonBridge.storageImport(projected.state, {
    source:'v14-realtime-file',
    replace:true,
  });
  await window.__V13_APPLY_PROJECTED_STATE__(projected.state);

  let parityLabel='';
  try{
    const parity=await PythonBridge.storageCompare(projected.state);
    parityLabel=parity?.ok ? ' · DB동기화 PASS' : ' · DB동기화 확인필요';
  }catch(_){}

  toast(
    'V14 실적 반영 완료: 신규 '+Number(projected.projected||0)
    +'건 · 갱신 '+Number(projected.updated||0)
    +'건 · 제외 '+skipped+'건'+parityLabel,
    skipped ? 'warning' : 'success'
  );
}

export function installRealtimeImport(){
  if(!PythonBridge.isAvailable()) return;
  const host=document.querySelector('.header-right');
  if(!host || document.getElementById('v14-realtime-import-btn')) return;

  const input=document.createElement('input');
  input.type='file';
  input.hidden=true;
  input.accept='.json,application/json';
  input.id='v14-realtime-import-file';

  const button=document.createElement('button');
  button.id='v14-realtime-import-btn';
  button.className='btn btn-outline btn-sm';
  button.type='button';
  button.textContent='☁️ V14 실적 가져오기';
  button.title='V14 실시간 운영에서 내보낸 연계 JSON을 Python 엔진으로 반영합니다.';
  button.addEventListener('click',()=>input.click());

  input.addEventListener('change',async()=>{
    const file=input.files?.[0];
    if(!file) return;
    button.disabled=true;
    const old=button.textContent;
    button.textContent='⏳ V14 실적 반영 중';
    try{
      await importHandoffFile(file);
    }catch(e){
      console.error('[V14→V13 import]',e);
      toast('V14 실적 가져오기 실패: '+(e?.message||e),'danger');
    }finally{
      input.value='';
      button.disabled=false;
      button.textContent=old;
    }
  });

  host.insertBefore(button,host.firstChild);
  host.appendChild(input);
}

window.__V13_VALIDATE_REALTIME_HANDOFF__ = validateRealtimeHandoff;
