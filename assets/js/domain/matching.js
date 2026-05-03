import { el, table, formField, toast, confirmAction, optionList, chip } from '../core/engine.js';
import { getState, patchState } from '../core/state.js';
import { overlaps } from '../core/time.js';

const LEARNING_COMPATIBLE_ROLES = new Set(['학습코치', '학습지원단']);
const CLASS_COMPATIBLE_ROLES = new Set(['학습서포터즈', '학습지원단']);

function isServiceCompatible(student, supporter) {
  if ((student.supportMode || '학습코칭') === '수업협력코칭') return CLASS_COMPATIBLE_ROLES.has(supporter.roleType);
  return LEARNING_COMPATIBLE_ROLES.has(supporter.roleType);
}

function matchScore(student, supporter, pref, avail, state) {
  const overlap = overlaps(pref.start, pref.end, avail.start, avail.end);
  if (!overlap) return null;
  const serviceCompatible = isServiceCompatible(student, supporter);
  if (!serviceCompatible) return null;

  const dailyCount = state.matches.filter((m) => m.supporterId === supporter.id && m.day === pref.day && m.active !== false).length;
  if (dailyCount >= (supporter.maxDailySessions || 4)) return null;

  const busyOverlap = state.matches.some((m) =>
    m.supporterId === supporter.id &&
    m.day === pref.day &&
    m.active !== false &&
    overlaps(m.start, m.end, pref.start, pref.end) > 0
  );
  if (busyOverlap) return null;

  const priority = Number(pref.priority || 1);
  return {
    score: overlap + 40 + (priority === 1 ? 20 : 0),
    overlap,
    compatible: serviceCompatible
  };
}

function buildCandidates(state) {
  const alreadyMatched = new Set(state.matches.filter((m) => m.active !== false).map((m) => m.studentId));
  const candidates = [];
  state.students.forEach((student) => {
    if (alreadyMatched.has(student.id)) return;
    (student.preferences || []).forEach((pref) => {
      state.supporters.forEach((supporter) => {
        (supporter.availability || []).filter((a) => a.day === pref.day).forEach((avail) => {
          const result = matchScore(student, supporter, pref, avail, state);
          if (!result) return;
          const start = pref.start > avail.start ? pref.start : avail.start;
          const end = pref.end < avail.end ? pref.end : avail.end;
          candidates.push({
            student,
            supporter,
            day: pref.day,
            start,
            end,
            preferencePriority: Number(pref.priority || 1),
            serviceMode: student.supportMode || '학습코칭',
            school: student.school,
            ...result
          });
        });
      });
    });
  });
  return candidates.sort((a, b) => b.score - a.score);
}

async function autoMatch() {
  const state = getState();
  const candidates = buildCandidates(state);
  const picked = [];
  const usedStudent = new Set();
  const usedSupporterSlots = [];

  for (const c of candidates) {
    if (usedStudent.has(c.student.id)) continue;
    if (usedSupporterSlots.some((slot) => slot.supporterId === c.supporter.id && slot.day === c.day && overlaps(slot.start, slot.end, c.start, c.end) > 0)) continue;
    picked.push(c);
    usedStudent.add(c.student.id);
    usedSupporterSlots.push({ supporterId: c.supporter.id, day: c.day, start: c.start, end: c.end });
  }

  await patchState((draft) => {
    picked.forEach((c) => draft.matches.push({
      id: crypto.randomUUID(),
      studentId: c.student.id,
      supporterId: c.supporter.id,
      day: c.day,
      start: c.start,
      end: c.end,
      school: c.school,
      serviceMode: c.serviceMode,
      preferencePriority: c.preferencePriority,
      active: true,
      createdAt: new Date().toISOString()
    }));
    return draft;
  }, 'auto-match');
  toast(`${picked.length}건을 자동 매칭했습니다.`, 'success');
}

async function addManualMatch(studentId, supporterId, slotText) {
  const state = getState();
  const student = state.students.find((item) => item.id === studentId);
  const supporter = state.supporters.find((item) => item.id === supporterId);
  if (!student || !supporter) return toast('학생과 지원단을 선택해 주세요.', 'error');
  if (!isServiceCompatible(student, supporter)) return toast('지원 방식과 지원단 구분이 맞지 않습니다.', 'error');
  const [day, start, end] = slotText.split('|');
  await patchState((draft) => {
    draft.matches.push({
      id: crypto.randomUUID(),
      studentId,
      supporterId,
      day,
      start,
      end,
      school: student.school,
      serviceMode: student.supportMode || '학습코칭',
      preferencePriority: 0,
      active: true,
      createdAt: new Date().toISOString()
    });
    return draft;
  }, 'manual-match');
  toast('수동 매칭을 등록했습니다.', 'success');
}

async function deleteMatch(id) {
  if (!confirmAction('이 매칭을 해제할까요? 활동기록은 남겨 두되 매칭만 비활성화합니다.')) return;
  await patchState((draft) => {
    draft.matches = draft.matches.map((item) => item.id === id ? { ...item, active: false } : item);
    return draft;
  }, 'deactivate-match');
  toast('매칭을 비활성화했습니다.', 'success');
}

export function renderMatchingView() {
  const state = getState();
  const candidates = buildCandidates(state).slice(0, 20);
  const studentSelect = optionList(el('select'), [['', '학생 선택'], ...state.students.map((s) => [s.id, `${s.name}(${s.school})`])], '');
  const supporterSelect = optionList(el('select'), [['', '지원단 선택'], ...state.supporters.map((s) => [s.id, `${s.name}(${s.roleType})`])], '');
  const slotSelect = el('select');

  function refreshSlots() {
    const student = state.students.find((s) => s.id === studentSelect.value);
    const supporter = state.supporters.find((s) => s.id === supporterSelect.value);
    slotSelect.replaceChildren(el('option', { value: '', text: '시간 선택' }));
    if (!student || !supporter || !isServiceCompatible(student, supporter)) return;
    (student.preferences || []).forEach((pref) => {
      (supporter.availability || []).filter((a) => a.day === pref.day && overlaps(pref.start, pref.end, a.start, a.end)).forEach((a) => {
        const start = pref.start > a.start ? pref.start : a.start;
        const end = pref.end < a.end ? pref.end : a.end;
        slotSelect.appendChild(el('option', { value: `${pref.day}|${start}|${end}`, text: `${pref.day} ${start}~${end}` }));
      });
    });
  }
  studentSelect.addEventListener('change', refreshSlots);
  supporterSelect.addEventListener('change', refreshSlots);

  const matchRows = state.matches.filter((m) => m.active !== false).map((m) => {
    const student = state.students.find((s) => s.id === m.studentId);
    const supporter = state.supporters.find((s) => s.id === m.supporterId);
    return [
      student?.name || '-',
      student ? `${student.school} ${student.grade ? student.grade + '학년' : ''}` : '-',
      supporter?.name || '-',
      chip(m.serviceMode || '-'),
      `${m.day} ${m.start}~${m.end}`,
      `${m.preferencePriority || '-'}순위`,
      el('button', { className: 'btn small danger', onClick: () => deleteMatch(m.id) }, '해제')
    ];
  });

  const candidateRows = candidates.map((c) => [
    c.student.name,
    `${c.student.school} / ${c.serviceMode}`,
    c.supporter.name,
    `${c.day} ${c.start}~${c.end}`,
    `${c.preferencePriority}순위`,
    c.compatible ? chip('적합', 'ok') : chip('역할확인', 'warn'),
    c.score
  ]);

  return el('div', { className: 'panel-grid' },
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: '매칭 관리' }),
        el('button', { className: 'btn success', onClick: autoMatch }, '자동 매칭 실행')
      ),
      el('div', { className: 'split-note' }, 'V10.3 매칭은 학생의 1·2희망 복수 시간대와 지원단의 복수 가능 시간대를 비교하고, 시간 겹침·역할 적합성·1일 최대 회기를 함께 점검합니다.'),
      el('div', { className: 'form-grid three' },
        formField('학생', studentSelect),
        formField('지원단', supporterSelect),
        formField('겹치는 시간', slotSelect)
      ),
      el('button', { className: 'btn', onClick: () => addManualMatch(studentSelect.value, supporterSelect.value, slotSelect.value) }, '수동 매칭 등록'),
      table(['학생', '학교/학년', '지원단', '방식', '요일/시간', '희망', '관리'], matchRows)
    ),
    el('section', { className: 'card stack' },
      el('h2', { text: `매칭 후보 (${candidates.length})` }),
      table(['학생', '학교/방식', '후보 지원단', '시간', '희망', '판정', '점수'], candidateRows, { emptyText: '현재 조건에 맞는 자동 매칭 후보가 없습니다.' })
    )
  );
}
