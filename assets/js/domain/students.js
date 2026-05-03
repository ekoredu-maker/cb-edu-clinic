import { el, table, formField, toast, confirmAction, optionList, chip } from '../core/engine.js';
import { getState, patchState } from '../core/state.js';
import { parseSlotLines, formatSlotLines } from '../core/time.js';
import { rowsFromFile, exportRowsXlsx } from '../services/excel.js';

function blankStudent() {
  return {
    name: '',
    gender: '',
    school: '',
    schoolLevel: '초등',
    grade: '',
    className: '',
    supportArea: '기초학습',
    supportMode: '학습코칭',
    targetType: '개인',
    preferences: [{ day: '월', start: '14:00', end: '15:40', priority: 1 }],
    complaint: '',
    goal: '',
    strategy: '',
    note: ''
  };
}

function inferSchoolLevel(school = '') {
  if (school.includes('초')) return '초등';
  if (school.includes('중')) return '중등';
  if (school.includes('고')) return '고등';
  return '기타';
}

function studentForm(values = blankStudent()) {
  const name = el('input', { value: values.name || '' });
  const gender = optionList(el('select'), ['', '남', '여'], values.gender || '');
  const school = el('input', { value: values.school || '' });
  const schoolLevel = optionList(el('select'), ['초등', '중등', '고등', '기타'], values.schoolLevel || inferSchoolLevel(values.school));
  const grade = el('input', { value: values.grade || '', placeholder: '3' });
  const className = el('input', { value: values.className || '', placeholder: '3-1 또는 집단명' });
  const supportArea = optionList(el('select'), ['기초학습', '난독증', '학습지원', '정서지원', '치료지원', '진로코칭', '수업협력코칭'], values.supportArea || '기초학습');
  const supportMode = optionList(el('select'), ['학습코칭', '수업협력코칭', '치료연계'], values.supportMode || '학습코칭');
  const targetType = optionList(el('select'), ['개인', '집단', '학급'], values.targetType || '개인');
  const prefs = el('textarea', { value: formatSlotLines(values.preferences), placeholder: '예)\n1순위 월 14:00~15:40\n2순위 수 10:00~11:40' });
  const complaint = el('textarea', { value: values.complaint || '', placeholder: '주 호소문제, 학습수준, 지원 필요 사유' });
  const goal = el('textarea', { value: values.goal || '', placeholder: '구체적이고 도달 가능한 학습상담·학습코칭 목표' });
  const strategy = el('textarea', { value: values.strategy || '', placeholder: '지도 전략, 협의 내용, 추수지도 방향' });
  const note = el('textarea', { value: values.note || '' });

  return {
    node: el('div', { className: 'form-grid' },
      formField('학생명', name),
      formField('성별', gender),
      formField('학교', school),
      formField('학교급', schoolLevel),
      formField('학년', grade),
      formField('학급/집단명', className),
      formField('지원영역', supportArea),
      formField('지원방식', supportMode),
      formField('대상구분', targetType),
      el('div'),
      el('div', { className: 'full-span' }, formField('희망 시간대', prefs, '1희망/2희망을 여러 줄로 입력할 수 있습니다.')),
      el('div', { className: 'full-span' }, formField('주 호소문제', complaint)),
      el('div', { className: 'full-span' }, formField('목표', goal)),
      el('div', { className: 'full-span' }, formField('전략', strategy)),
      el('div', { className: 'full-span' }, formField('비고', note))
    ),
    read() {
      return {
        name: name.value.trim(),
        gender: gender.value,
        school: school.value.trim(),
        schoolLevel: schoolLevel.value,
        grade: grade.value.trim(),
        className: className.value.trim(),
        supportArea: supportArea.value,
        supportMode: supportMode.value,
        targetType: targetType.value,
        preferences: parseSlotLines(prefs.value, 1),
        complaint: complaint.value.trim(),
        goal: goal.value.trim(),
        strategy: strategy.value.trim(),
        note: note.value.trim()
      };
    }
  };
}

async function saveStudent(existingId, payload) {
  if (!payload.name || !payload.school) return toast('학생 이름과 학교를 입력해 주세요.', 'error');
  await patchState((state) => {
    if (existingId) state.students = state.students.map((item) => item.id === existingId ? { ...item, ...payload } : item);
    else state.students.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...payload });
    return state;
  }, existingId ? 'update-student' : 'create-student');
  toast('학생 정보를 저장했습니다.', 'success');
}

async function deleteStudent(id) {
  if (!confirmAction('이 학생을 삭제할까요? 연결된 매칭과 활동기록도 함께 삭제됩니다.')) return;
  await patchState((state) => {
    state.students = state.students.filter((item) => item.id !== id);
    const removedMatches = new Set(state.matches.filter((item) => item.studentId === id).map((item) => item.id));
    state.matches = state.matches.filter((item) => item.studentId !== id);
    state.sessions = state.sessions.filter((item) => !removedMatches.has(item.matchId));
    return state;
  }, 'delete-student');
  toast('학생을 삭제했습니다.', 'success');
}

function mapRow(row) {
  const school = row['학교'] || row['학교명'] || '';
  const prefText = row['희망시간대'] || row['희망시간'] || row['희망요일'] || '';
  const fallback = `${row['희망요일'] || '월'} ${row['희망시작'] || row['시작시간'] || row['희망시간'] || '14:00'}~${row['희망종료'] || row['종료시간'] || '15:40'}`;
  return {
    id: crypto.randomUUID(),
    name: row['이름'] || row['학생명'] || '',
    gender: row['성별'] || '',
    school,
    schoolLevel: row['학교급'] || inferSchoolLevel(school),
    grade: row['학년'] || '',
    className: row['학급'] || row['학급/집단명'] || '',
    supportArea: row['지원영역'] || '기초학습',
    supportMode: row['지원방식'] || row['지원유형'] || '학습코칭',
    targetType: row['대상구분'] || '개인',
    preferences: parseSlotLines(prefText || fallback, 1),
    complaint: row['주호소문제'] || row['주 호소문제'] || '',
    goal: row['목표'] || '',
    strategy: row['전략'] || '',
    note: row['비고'] || ''
  };
}

async function importFile(file) {
  const rows = await rowsFromFile(file);
  const mapped = rows.map(mapRow).filter((item) => item.name && item.school);
  await patchState((state) => {
    state.students.push(...mapped);
    return state;
  }, 'import-students');
  toast(`${mapped.length}명의 학생을 불러왔습니다.`, 'success');
}

function exportTemplate() {
  exportRowsXlsx({
    filename: '학생_가져오기_양식_V10.3.xlsx',
    sheetName: '학생',
    headers: ['학생명', '성별', '학교명', '학교급', '학년', '학급', '지원영역', '지원방식', '대상구분', '희망시간대', '주호소문제', '목표', '전략', '비고'],
    rows: [
      ['한지민', '여', '제천초', '초등', '3', '3-1', '기초학습', '학습코칭', '개인', '1순위 월 14:00~15:40; 2순위 수 10:00~11:40', '기초연산 부진', '수 감각 향상', '개별 피드백 중심', ''],
      ['김도윤', '남', '제천중앙초', '초등', '4', '4-1', '수업협력코칭', '수업협력코칭', '학급', '화 09:00~09:40', '수업 중 과제 수행 지원', '수업 참여도 향상', '담임 협력', '']
    ]
  });
}

function exportList(state) {
  exportRowsXlsx({
    filename: `학생_목록_${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: '학생목록',
    headers: ['학생명', '성별', '학교명', '학교급', '학년', '학급', '지원영역', '지원방식', '대상구분', '희망시간대', '주호소문제', '목표', '전략', '비고'],
    rows: state.students.map((item) => [
      item.name,
      item.gender,
      item.school,
      item.schoolLevel,
      item.grade,
      item.className,
      item.supportArea,
      item.supportMode,
      item.targetType,
      formatSlotLines(item.preferences).replace(/\n/g, '; '),
      item.complaint,
      item.goal,
      item.strategy,
      item.note
    ])
  });
}

export function renderStudentsView() {
  const state = getState();
  const editor = studentForm();
  let currentForm = editor;
  let editingId = null;
  const formWrap = el('div', {}, editor.node);

  function resetForm() {
    editingId = null;
    currentForm = studentForm();
    formWrap.replaceChildren(currentForm.node);
  }

  function fillForm(item) {
    editingId = item.id;
    currentForm = studentForm(item);
    formWrap.replaceChildren(currentForm.node);
  }

  const fileInput = el('input', { type: 'file', accept: '.xlsx,.csv,.tsv,.txt,.xls' });
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files || [];
    try {
      if (file) await importFile(file);
    } catch (error) {
      toast(error.message || '학생 파일을 읽지 못했습니다.', 'error');
    } finally {
      fileInput.value = '';
    }
  });

  const rows = state.students.map((item) => [
    item.name,
    `${item.school} ${item.grade ? item.grade + '학년' : ''}`,
    item.className || '-',
    chip(item.supportArea || '-'),
    chip(item.supportMode || '-', item.supportMode === '수업협력코칭' ? 'ok' : ''),
    el('div', { className: 'badge-row' }, (item.preferences || []).map((slot) => chip(`${slot.priority || 1}순위 ${slot.day} ${slot.start}~${slot.end}`))),
    el('div', { className: 'toolbar-group' },
      el('button', { className: 'btn small ghost', onClick: () => fillForm(item) }, '불러오기'),
      el('button', { className: 'btn small danger', onClick: () => deleteStudent(item.id) }, '삭제')
    )
  ]);

  return el('div', { className: 'panel-grid wide-left' },
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: editingId ? '학생 수정' : '학생 등록' }),
        el('div', { className: 'toolbar-group' },
          fileInput,
          el('button', { className: 'btn ghost', onClick: exportTemplate }, '가져오기 양식'),
          el('button', { className: 'btn ghost', onClick: () => fileInput.click() }, 'XLSX/CSV 가져오기'),
          el('button', { className: 'btn', onClick: async () => { await saveStudent(editingId, currentForm.read()); resetForm(); } }, '저장'),
          el('button', { className: 'btn ghost', onClick: resetForm }, '신규')
        )
      ),
      el('p', { className: 'helper', text: 'V10.3은 학생별 1희망·2희망 및 복수 시간대를 그대로 저장합니다.' }),
      formWrap
    ),
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: `학생 목록 (${state.students.length})` }),
        el('button', { className: 'btn ghost', onClick: () => exportList(state) }, '목록 내보내기')
      ),
      table(['이름', '학교/학년', '학급', '영역', '방식', '희망시간', '관리'], rows)
    )
  );
}
