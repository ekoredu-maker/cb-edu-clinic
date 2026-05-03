import { el, table, chip } from '../core/engine.js';
import { getState } from '../core/state.js';
import { overlaps, durationMinutes } from '../core/time.js';

function buildIssues(state) {
  const issues = [];

  state.students.forEach((s) => {
    if (!s.school) issues.push(['학생', s.name || '(이름 없음)', '학교명이 비어 있습니다.', '위험']);
    if (!s.preferences?.length) issues.push(['학생', s.name || '(이름 없음)', '희망시간대가 없습니다.', '주의']);
    if (!s.goal) issues.push(['계획서', s.name || '(이름 없음)', '진행계획서 목표가 비어 있습니다.', '주의']);
  });

  state.supporters.forEach((s) => {
    if (!s.phone) issues.push(['지원단', s.name || '(이름 없음)', '연락처가 비어 있습니다.', '주의']);
    if (!s.availability?.length) issues.push(['지원단', s.name || '(이름 없음)', '가능시간대가 없습니다.', '위험']);
  });

  state.matches.filter((m) => m.active !== false).forEach((m) => {
    const student = state.students.find((s) => s.id === m.studentId);
    const supporter = state.supporters.find((s) => s.id === m.supporterId);
    if (!student) issues.push(['매칭', m.id, '연결된 학생이 없습니다.', '위험']);
    if (!supporter) issues.push(['매칭', student?.name || m.id, '연결된 지원단이 없습니다.', '위험']);
    if (durationMinutes(m.start, m.end) <= 0) issues.push(['매칭', student?.name || m.id, '매칭 시간이 올바르지 않습니다.', '위험']);
    const supportSlots = supporter?.availability || [];
    if (supporter && !supportSlots.some((slot) => slot.day === m.day && overlaps(slot.start, slot.end, m.start, m.end) > 0)) {
      issues.push(['매칭', `${student?.name || '-'} / ${supporter.name}`, '지원단 가능시간과 겹치지 않습니다.', '위험']);
    }
  });

  const activeMatches = state.matches.filter((m) => m.active !== false);
  for (let i = 0; i < activeMatches.length; i += 1) {
    for (let j = i + 1; j < activeMatches.length; j += 1) {
      const a = activeMatches[i];
      const b = activeMatches[j];
      if (a.supporterId === b.supporterId && a.day === b.day && overlaps(a.start, a.end, b.start, b.end) > 0) {
        const supporter = state.supporters.find((s) => s.id === a.supporterId);
        issues.push(['매칭중복', supporter?.name || '-', `${a.day} ${a.start}~${a.end}와 ${b.start}~${b.end} 시간이 겹칩니다.`, '위험']);
      }
    }
  }

  state.sessions.forEach((s) => {
    const match = state.matches.find((m) => m.id === s.matchId);
    if (!match) issues.push(['활동기록', s.date || '-', '연결된 매칭이 없습니다.', '위험']);
    if (!s.date) issues.push(['활동기록', s.id, '활동일자가 없습니다.', '위험']);
    if (durationMinutes(s.start, s.end) <= 0) issues.push(['활동기록', s.date || '-', '활동 시간이 올바르지 않습니다.', '위험']);
    if (!s.confirmed) issues.push(['활동기록', s.date || '-', '학교 확인이 미완료입니다.', '주의']);
  });

  return issues;
}

export function renderValidationView() {
  const state = getState();
  const issues = buildIssues(state);
  const risk = issues.filter((i) => i[3] === '위험').length;
  const warn = issues.filter((i) => i[3] === '주의').length;

  const rows = issues.map((item) => [
    item[0],
    item[1],
    item[2],
    item[3] === '위험' ? chip('위험', 'danger') : chip('주의', 'warn')
  ]);

  return el('section', { className: 'card stack' },
    el('div', { className: 'list-toolbar' },
      el('h2', { text: '데이터 품질 점검' }),
      el('div', { className: 'badge-row' },
        chip(`위험 ${risk}건`, risk ? 'danger' : 'ok'),
        chip(`주의 ${warn}건`, warn ? 'warn' : 'ok')
      )
    ),
    el('p', { className: 'helper', text: '서식 출력과 통계 산출 전에 학생·지원단·매칭·활동기록의 누락과 시간 충돌을 먼저 점검합니다.' }),
    table(['영역', '대상', '내용', '등급'], rows, { emptyText: '점검 결과 문제가 없습니다.' })
  );
}
