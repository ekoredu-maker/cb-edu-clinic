import { el, table, formField, toast, confirmAction, optionList, chip } from '../core/engine.js';
import { getState, patchState } from '../core/state.js';
import { parseSlotLines, formatSlotLines } from '../core/time.js';
import { rowsFromFile, exportRowsXlsx } from '../services/excel.js';

function blankSupporter() {
  return {
    name: '',
    birthDate: '',
    phone: '',
    roleType: '학습코치',
    availability: [{ day: '월', start: '14:00', end: '15:40', priority: 1 }],
    maxDailySessions: 4,
    note: ''
  };
}

function supporterForm(values = blankSupporter()) {
  const name = el('input', { value: values.name || '' });
  const birthDate = el('input', { value: values.birthDate || '', placeholder: '1980.05.15' });
  const phone = el('input', { value: values.phone || '', placeholder: '010-0000-0000' });
  const roleType = optionList(el('select'), ['학습코치', '학습서포터즈', '학습지원단'], values.roleType || '학습코치');
  const maxDailySessions = el('input', { type: 'number', min: '1', max: '8', value: values.maxDailySessions || 4 });
  const slots = el('textarea', { value: formatSlotLines(values.availability), placeholder: '예)\n월 14:00~15:40\n수 09:00~10:40\n금 1순위 13:30~15:10' });
  const note = el('textarea', { value: values.note || '', placeholder: '소속학교, 이동 가능 지역, 특이사항 등' });

  return {
    node: el('div', { className: 'form-grid' },
      formField('이름', name),
      formField('생년월일', birthDate),
      formField('연락처', phone),
      formField('구분', roleType),
      formField('1일 최대 회기', maxDailySessions),
      el('div'),
      el('div', { className: 'full-span' }, formField('가능 시간대', slots, '여러 줄 입력 가능: 요일 시작~종료')),
      el('div', { className: 'full-span' }, formField('비고', note))
    ),
    read() {
      return {
        name: name.value.trim(),
        birthDate: birthDate.value.trim(),
        phone: phone.value.trim(),
        roleType: roleType.value,
        availability: parseSlotLines(slots.value, 1),
        maxDailySessions: Number(maxDailySessions.value || 4),
        note: note.value.trim()
      };
    }
  };
}

async function saveSupporter(existingId, payload) {
  if (!payload.name) return toast('지원단 이름을 입력해 주세요.', 'error');
  await patchState((state) => {
    if (existingId) {
      state.supporters = state.supporters.map((item) => item.id === existingId ? { ...item, ...payload } : item);
    } else {
      state.supporters.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...payload });
    }
    return state;
  }, existingId ? 'update-supporter' : 'create-supporter');
  toast('지원단 정보를 저장했습니다.', 'success');
}

async function deleteSupporter(id) {
  if (!confirmAction('이 지원단을 삭제할까요? 연결된 매칭도 함께 해제됩니다.')) return;
  await patchState((state) => {
    state.supporters = state.supporters.filter((item) => item.id !== id);
    const removedMatches = new Set(state.matches.filter((item) => item.supporterId === id).map((item) => item.id));
    state.matches = state.matches.filter((item) => item.supporterId !== id);
    state.sessions = state.sessions.filter((item) => !removedMatches.has(item.matchId));
    return state;
  }, 'delete-supporter');
  toast('지원단을 삭제했습니다.', 'success');
}

function mapRow(row) {
  const slotText = row['가능시간대'] || row['가능시간'] || row['가능요일'] || '';
  const fallback = `${row['가능요일'] || '월'} ${row['가능시작'] || row['시작시간'] || row['가능시간'] || '14:00'}~${row['가능종료'] || row['종료시간'] || '15:40'}`;
  return {
    id: crypto.randomUUID(),
    name: row['이름'] || row['성명'] || '',
    birthDate: row['생년월일'] || '',
    phone: row['연락처'] || '',
    roleType: row['구분'] || row['역할'] || '학습코치',
    availability: parseSlotLines(slotText || fallback, 1),
    maxDailySessions: Number(row['1일최대회기'] || row['최대회기'] || 4),
    note: row['비고'] || ''
  };
}

async function importFile(file) {
  const rows = await rowsFromFile(file);
  const mapped = rows.map(mapRow).filter((item) => item.name);
  await patchState((state) => {
    state.supporters.push(...mapped);
    return state;
  }, 'import-supporters');
  toast(`${mapped.length}명의 지원단을 불러왔습니다.`, 'success');
}

function exportTemplate() {
  exportRowsXlsx({
    filename: '학습지원단_가져오기_양식_V10.3.xlsx',
    sheetName: '지원단',
    headers: ['이름', '생년월일', '연락처', '구분', '가능시간대', '1일최대회기', '비고'],
    rows: [
      ['김지원', '1980.05.15', '010-1111-2222', '학습코치', '월 14:00~15:40; 수 10:00~11:40', 4, '제천권'],
      ['이서포터', '1977.03.20', '010-3333-4444', '학습서포터즈', '화 09:00~09:40; 목 10:00~10:40', 5, '수업협력']
    ]
  });
}

function exportList(state) {
  exportRowsXlsx({
    filename: `학습지원단_목록_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '지원단목록',
    headers: ['이름', '생년월일', '연락처', '구분', '가능시간대', '1일최대회기', '비고'],
    rows: state.supporters.map((item) => [
      item.name,
      item.birthDate,
      item.phone,
      item.roleType,
      formatSlotLines(item.availability).replace(/\n/g, '; '),
      item.maxDailySessions,
      item.note
    ])
  });
}

export function renderSupportersView() {
  const state = getState();
  const editor = supporterForm();
  let currentForm = editor;
  let editingId = null;
  const formWrap = el('div', {}, editor.node);

  function resetForm() {
    editingId = null;
    currentForm = supporterForm();
    formWrap.replaceChildren(currentForm.node);
  }

  function fillForm(item) {
    editingId = item.id;
    currentForm = supporterForm(item);
    formWrap.replaceChildren(currentForm.node);
  }

  const fileInput = el('input', { type: 'file', accept: '.xlsx,.csv,.tsv,.txt,.xls' });
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files || [];
    try {
      if (file) await importFile(file);
    } catch (error) {
      toast(error.message || '지원단 파일을 읽지 못했습니다.', 'error');
    } finally {
      fileInput.value = '';
    }
  });

  const listRows = state.supporters.map((item) => [
    item.name,
    item.birthDate || '-',
    item.phone || '-',
    chip(item.roleType || '-', item.roleType === '학습서포터즈' ? 'ok' : ''),
    el('div', { className: 'badge-row' }, (item.availability || []).map((slot) => chip(`${slot.day} ${slot.start}~${slot.end}`))),
    item.maxDailySessions || 4,
    el('div', { className: 'toolbar-group' },
      el('button', { className: 'btn small ghost', onClick: () => fillForm(item) }, '불러오기'),
      el('button', { className: 'btn small danger', onClick: () => deleteSupporter(item.id) }, '삭제')
    )
  ]);

  return el('div', { className: 'panel-grid wide-left' },
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: editingId ? '학습지원단 수정' : '학습지원단 등록' }),
        el('div', { className: 'toolbar-group' },
          fileInput,
          el('button', { className: 'btn ghost', onClick: exportTemplate }, '가져오기 양식'),
          el('button', { className: 'btn ghost', onClick: () => fileInput.click() }, 'XLSX/CSV 가져오기'),
          el('button', { className: 'btn', onClick: async () => { await saveSupporter(editingId, currentForm.read()); resetForm(); } }, '저장'),
          el('button', { className: 'btn ghost', onClick: resetForm }, '신규')
        )
      ),
      el('p', { className: 'helper', text: 'V10.3부터 여러 가능 시간대를 한 명에게 등록할 수 있습니다. 구형 .xls는 엑셀에서 .xlsx로 다시 저장 후 가져오세요.' }),
      formWrap
    ),
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: `지원단 목록 (${state.supporters.length})` }),
        el('button', { className: 'btn ghost', onClick: () => exportList(state) }, '목록 내보내기')
      ),
      table(['이름', '생년월일', '연락처', '구분', '가용시간', '최대', '관리'], listRows)
    )
  );
}
