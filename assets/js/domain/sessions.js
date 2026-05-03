import { el, table, formField, toast, optionList, chip } from '../core/engine.js';
import { getState, patchState } from '../core/state.js';
import { durationMinutes, ymdOfToday, ymOfToday, formatWon } from '../core/time.js';
import { exportRowsXlsx } from '../services/excel.js';

function sessionRate(state, match) {
  return match?.serviceMode === '수업협력코칭' ? Number(state.cfg.classRate || 30000) : Number(state.cfg.learningRate || 40000);
}

function unitMinutes(state, match) {
  return match?.serviceMode === '수업협력코칭' ? Number(state.cfg.defaultClassMinutes || 40) : Number(state.cfg.defaultLearningMinutes || 50);
}

function sessionPay(state, match, session) {
  const minutes = Number(session.minutes || durationMinutes(session.start, session.end) || unitMinutes(state, match));
  return Math.round(minutes / unitMinutes(state, match) * sessionRate(state, match));
}

function exportSessions(state, ym) {
  const rows = state.sessions.filter((s) => !ym || s.date.startsWith(ym)).map((s) => {
    const match = state.matches.find((m) => m.id === s.matchId);
    const student = state.students.find((st) => st.id === match?.studentId);
    const supporter = state.supporters.find((sf) => sf.id === match?.supporterId);
    return [
      s.date,
      supporter?.name || '',
      student?.school || s.school || '',
      student?.name || s.targetName || '',
      match?.serviceMode || '',
      s.start,
      s.end,
      s.minutes || durationMinutes(s.start, s.end),
      s.subject,
      s.topic,
      s.feedback,
      s.confirmed ? '확인' : '미확인',
      sessionPay(state, match, s)
    ];
  });
  exportRowsXlsx({
    filename: `활동기록_${ym || '전체'}.xlsx`,
    sheetName: '활동기록',
    headers: ['일자', '지원단', '학교', '대상', '방식', '시작', '종료', '분', '과목', '활동내용', '평가', '확인', '산출액'],
    rows
  });
}

export function renderSessionsView() {
  const state = getState();
  const ym = el('input', { type: 'month', value: ymOfToday() });
  const matchSelect = optionList(el('select'), [['', '매칭 선택'], ...state.matches.filter((m) => m.active !== false).map((m) => {
    const student = state.students.find((s) => s.id === m.studentId);
    const supporter = state.supporters.find((s) => s.id === m.supporterId);
    return [m.id, `${student?.name || '-'} / ${supporter?.name || '-'} / ${m.day} ${m.start}`];
  })], '');
  const date = el('input', { type: 'date', value: ymdOfToday() });
  const start = el('input', { type: 'time', value: '14:00' });
  const end = el('input', { type: 'time', value: '15:40' });
  const subject = el('input', { value: '', placeholder: '국어, 수학 등' });
  const topic = el('textarea', { value: '', placeholder: '활동내용 또는 지도 내용' });
  const feedback = el('textarea', { value: '', placeholder: '학생 피드백, 평가, 추수지도 사항' });
  const confirmed = el('input', { type: 'checkbox' });
  const confirmedBy = el('input', { value: '', placeholder: '담임/교감 확인자' });

  matchSelect.addEventListener('change', () => {
    const match = state.matches.find((m) => m.id === matchSelect.value);
    if (!match) return;
    start.value = match.start;
    end.value = match.end;
  });

  async function addSession() {
    const match = state.matches.find((m) => m.id === matchSelect.value);
    if (!match) return toast('매칭을 선택해 주세요.', 'error');
    const student = state.students.find((s) => s.id === match.studentId);
    await patchState((draft) => {
      draft.sessions.push({
        id: crypto.randomUUID(),
        matchId: match.id,
        date: date.value,
        school: student?.school || match.school || '',
        start: start.value,
        end: end.value,
        minutes: durationMinutes(start.value, end.value),
        subject: subject.value.trim(),
        targetName: student?.targetType === '학급' ? student.className : student?.name || '',
        topic: topic.value.trim(),
        feedback: feedback.value.trim(),
        confirmed: confirmed.checked,
        confirmedBy: confirmedBy.value.trim(),
        note: '',
        createdAt: new Date().toISOString()
      });
      return draft;
    }, 'create-session');
    topic.value = '';
    feedback.value = '';
    toast('활동기록을 저장했습니다.', 'success');
  }

  const filtered = state.sessions.filter((s) => s.date?.startsWith(ym.value));
  const totalPay = filtered.reduce((sum, s) => {
    const match = state.matches.find((m) => m.id === s.matchId);
    return sum + sessionPay(state, match, s);
  }, 0);
  const totalMinutes = filtered.reduce((sum, s) => sum + Number(s.minutes || durationMinutes(s.start, s.end)), 0);

  const rows = filtered.map((s) => {
    const match = state.matches.find((m) => m.id === s.matchId);
    const student = state.students.find((st) => st.id === match?.studentId);
    const supporter = state.supporters.find((sf) => sf.id === match?.supporterId);
    return [
      s.date,
      supporter?.name || '-',
      student?.school || s.school || '-',
      student?.targetType === '학급' ? (student.className || '-') : (student?.name || s.targetName || '-'),
      chip(match?.serviceMode || '-'),
      `${s.start}~${s.end}`,
      s.topic || '-',
      s.confirmed ? chip('확인', 'ok') : chip('미확인', 'warn'),
      formatWon(sessionPay(state, match, s))
    ];
  });

  return el('div', { className: 'panel-grid' },
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: '활동기록/검증' }),
        el('div', { className: 'toolbar-group' },
          formField('조회월', ym),
          el('button', { className: 'btn ghost', onClick: () => exportSessions(state, ym.value) }, '월 활동기록 내보내기')
        )
      ),
      el('div', { className: 'kpi' },
        el('div', { className: 'box' }, '활동회기', el('strong', { text: `${filtered.length}회` })),
        el('div', { className: 'box' }, '총 시간', el('strong', { text: `${Math.round(totalMinutes / 60 * 10) / 10}시간` })),
        el('div', { className: 'box' }, '산출액', el('strong', { text: formatWon(totalPay) }))
      ),
      table(['일자', '지원단', '학교', '대상', '방식', '시간', '활동내용', '확인', '산출액'], rows)
    ),
    el('section', { className: 'card stack' },
      el('h2', { text: '활동기록 입력' }),
      el('div', { className: 'form-grid' },
        el('div', { className: 'full-span' }, formField('매칭', matchSelect)),
        formField('일자', date),
        formField('확인자', confirmedBy),
        formField('시작', start),
        formField('종료', end),
        formField('과목', subject),
        formField('학교 확인', el('label', {}, confirmed, ' 확인 완료')),
        el('div', { className: 'full-span' }, formField('활동내용', topic)),
        el('div', { className: 'full-span' }, formField('평가/피드백', feedback))
      ),
      el('button', { className: 'btn', onClick: addSession }, '저장')
    )
  );
}
