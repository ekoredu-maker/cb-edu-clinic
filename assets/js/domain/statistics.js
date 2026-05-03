import { el, table, formField, toast } from '../core/engine.js';
import { getState } from '../core/state.js';
import { formatWon, durationMinutes } from '../core/time.js';
import { exportWorkbookXlsx } from '../services/excel.js';

const AREAS = ['기초학습', '난독증', '학습지원', '정서지원', '치료지원', '진로코칭', '수업협력코칭'];
const MONTHS_BY_QUARTER = { 1: ['01', '02', '03'], 2: ['04', '05', '06'], 3: ['07', '08', '09'], 4: ['10', '11', '12'] };
const S = { title: 1, subtitle: 2, section: 3, header: 4, body: 5, left: 6, money: 7, warn: 8, total: 9 };

function c(v, s = S.body) { return { v, s }; }
function left(v) { return c(v, S.left); }
function head(v) { return c(v, S.header); }
function section(v) { return c(v, S.section); }
function title(v) { return c(v, S.title); }
function money(v) { return c(v, S.money); }
function total(v) { return c(v, S.total); }
function warn(v) { return c(v, S.warn); }
function blank(count) { return Array.from({ length: count }, () => ''); }

function sessionRate(state, match) {
  return match?.serviceMode === '수업협력코칭' ? Number(state.cfg.classRate || 30000) : Number(state.cfg.learningRate || 40000);
}

function unitMinutes(state, match) {
  return match?.serviceMode === '수업협력코칭' ? Number(state.cfg.defaultClassMinutes || 40) : Number(state.cfg.defaultLearningMinutes || 50);
}

function sessionPay(state, match, session) {
  const minutes = Number(session.minutes || durationMinutes(session.start, session.end));
  return Math.round(minutes / unitMinutes(state, match) * sessionRate(state, match));
}

function periodLabel(periodType, value, year) {
  if (periodType === 'month') return `${value.replace('-', '. ')}.`;
  const months = MONTHS_BY_QUARTER[Number(value || 1)] || MONTHS_BY_QUARTER[1];
  return `${year}. ${months[0]}. ~ ${year}. ${months[2]}.`;
}

function filteredSessions(state, periodType, value, year = state.cfg.fiscalYear || new Date().getFullYear()) {
  if (periodType === 'month') return state.sessions.filter((s) => s.date?.startsWith(value));
  const months = MONTHS_BY_QUARTER[Number(value || 1)] || MONTHS_BY_QUARTER[1];
  return state.sessions.filter((s) => months.some((m) => s.date?.startsWith(`${year}-${m}`)));
}

function sessionContext(state, session) {
  const match = state.matches.find((m) => m.id === session.matchId);
  const student = state.students.find((s) => s.id === match?.studentId);
  const supporter = state.supporters.find((s) => s.id === match?.supporterId);
  return { match, student, supporter };
}

function schoolAreaMatrix(state, sessions) {
  const map = new Map();
  sessions.forEach((session) => {
    const { student } = sessionContext(state, session);
    if (!student) return;
    const key = `${student.school}|${student.schoolLevel}|${student.grade}`;
    if (!map.has(key)) map.set(key, { school: student.school, schoolLevel: student.schoolLevel, grade: student.grade, total: 0, areas: Object.fromEntries(AREAS.map((a) => [a, 0])) });
    const row = map.get(key);
    row.total += 1;
    row.areas[student.supportArea] = (row.areas[student.supportArea] || 0) + 1;
  });
  return [...map.values()].sort((a, b) => a.school.localeCompare(b.school, 'ko') || String(a.grade).localeCompare(String(b.grade), 'ko'));
}

function supporterPayRows(state, sessions) {
  const map = new Map();
  sessions.forEach((session) => {
    const { match, supporter } = sessionContext(state, session);
    if (!supporter) return;
    if (!map.has(supporter.id)) map.set(supporter.id, { name: supporter.name, roleType: supporter.roleType, count: 0, minutes: 0, pay: 0, learning: 0, classCoaching: 0, learningPay: 0, classPay: 0 });
    const row = map.get(supporter.id);
    row.count += 1;
    row.minutes += Number(session.minutes || durationMinutes(session.start, session.end));
    const pay = sessionPay(state, match, session);
    row.pay += pay;
    if (match?.serviceMode === '수업협력코칭') {
      row.classCoaching += 1;
      row.classPay += pay;
    } else {
      row.learning += 1;
      row.learningPay += pay;
    }
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function detailRows(state, sessions) {
  return sessions.map((session, index) => {
    const { match, student, supporter } = sessionContext(state, session);
    return {
      no: index + 1,
      date: session.date || '',
      school: student?.school || session.school || '',
      schoolLevel: student?.schoolLevel || '',
      grade: student?.grade || '',
      className: student?.className || '',
      target: student?.targetType === '학급' ? (student?.className || student?.name || '') : (student?.name || session.targetName || ''),
      area: student?.supportArea || '',
      mode: match?.serviceMode || '',
      supporter: supporter?.name || '',
      start: session.start || '',
      end: session.end || '',
      minutes: Number(session.minutes || durationMinutes(session.start, session.end)),
      topic: session.topic || '',
      feedback: session.feedback || '',
      confirmed: session.confirmed ? '확인' : '미확인',
      pay: sessionPay(state, match, session)
    };
  });
}

function issueRows(state, sessions) {
  const issues = [];
  sessions.forEach((session) => {
    const { match, student, supporter } = sessionContext(state, session);
    if (!match) issues.push(['활동기록', session.date || '', '매칭 정보가 없습니다.', '매칭 재생성 또는 활동기록 삭제 필요']);
    if (match && !student) issues.push(['활동기록', session.date || '', '학생 정보가 없습니다.', '학생 삭제 여부 확인']);
    if (match && !supporter) issues.push(['활동기록', session.date || '', '지원단 정보가 없습니다.', '지원단 삭제 여부 확인']);
    if (!session.confirmed) issues.push(['확인', session.date || '', '확인 미완료 활동기록입니다.', '담임/교감 확인 여부 점검']);
    if (!session.topic) issues.push(['내용', session.date || '', '활동내용이 비어 있습니다.', '진행 확인서 출력 전 보완']);
  });
  if (!issues.length) issues.push(['정상', '', '점검 결과 주요 오류가 없습니다.', '']);
  return issues;
}

function buildSummarySheet(state, sessions, periodType, value, year) {
  const matrix = schoolAreaMatrix(state, sessions);
  const pays = supporterPayRows(state, sessions);
  const details = detailRows(state, sessions);
  const totalPay = pays.reduce((sum, row) => sum + row.pay, 0);
  return {
    name: '보고표지',
    cols: [8, 18, 18, 18, 18, 18, 18, 18, 18, 18],
    merges: ['A1:J1', 'A2:J2', 'A4:J4', 'A11:J11'],
    rows: [
      { height: 30, cells: [title(`${periodType === 'month' ? '월별' : '분기별'} 학습지원 실적 보고서`), ...blank(9)] },
      [section(`센터: ${state.cfg.centerName || ''} / 기간: ${periodLabel(periodType, value, year)} / 생성일: ${new Date().toISOString().slice(0, 10)}`), ...blank(9)],
      [],
      [section('Ⅰ. 총괄'), ...blank(9)],
      [head('구분'), head('값'), ...blank(8).map((x) => head(x))],
      [left('활동 회기'), c(sessions.length), ...blank(8)],
      [left('지원 학생/학급'), c(new Set(details.map((r) => r.target).filter(Boolean)).size), ...blank(8)],
      [left('참여 지원단'), c(pays.length), ...blank(8)],
      [left('산출액'), money(totalPay), ...blank(8)],
      [],
      [section('Ⅱ. 학교별·영역별 요약'), ...blank(9)],
      [head('학교'), head('학교급'), head('학년'), ...AREAS.map(head), head('합계')],
      ...matrix.map((r) => [left(r.school), c(r.schoolLevel), c(r.grade), ...AREAS.map((a) => c(r.areas[a] || 0)), total(r.total)]),
      [left('합계'), '', '', ...AREAS.map((a) => total(matrix.reduce((sum, r) => sum + (r.areas[a] || 0), 0))), total(matrix.reduce((sum, r) => sum + r.total, 0))]
    ]
  };
}

function buildMonthlyTemplateSheet(state, sessions, month) {
  const matrix = schoolAreaMatrix(state, sessions);
  const rows = [
    { height: 30, cells: [title(`${month.replace('-', '년 ')}월 학습지원 실적`), ...blank(14)] },
    [section(`충북학습종합클리닉센터 제천거점 / ${state.cfg.centerName || ''}`), ...blank(14)],
    [],
    [head('학교급'), head('학교명'), head('학년'), head('기초학습'), head('난독증'), head('학습지원'), head('정서지원'), head('치료지원'), head('진로코칭'), head('수업협력'), head('계'), head('비고')],
    ...matrix.map((r) => [c(r.schoolLevel), left(r.school), c(r.grade), c(r.areas['기초학습'] || 0), c(r.areas['난독증'] || 0), c(r.areas['학습지원'] || 0), c(r.areas['정서지원'] || 0), c(r.areas['치료지원'] || 0), c(r.areas['진로코칭'] || 0), c(r.areas['수업협력코칭'] || 0), total(r.total), '']),
    [left('합계'), '', '', ...AREAS.map((a) => total(matrix.reduce((sum, r) => sum + (r.areas[a] || 0), 0))), total(matrix.reduce((sum, r) => sum + r.total, 0)), '']
  ];
  while (rows.length < 24) rows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
  return { name: '월별실적양식', cols: [10, 18, 8, 10, 10, 10, 10, 10, 10, 10, 10, 18], merges: ['A1:L1', 'A2:L2'], freeze: { y: 4, topLeftCell: 'A5' }, rows };
}


function rateLabelForRow(state, row) {
  const learningRate = Number(state.cfg.learningRate || 40000);
  const classRate = Number(state.cfg.classRate || 30000);
  const hasLearning = row.learning > 0;
  const hasClass = row.classCoaching > 0;
  if (hasLearning && hasClass) return `학습 ${formatWon(learningRate)} / 수업 ${formatWon(classRate)}`;
  if (hasClass) return formatWon(classRate);
  return formatWon(learningRate);
}

function buildQuarterTemplateSheet(state, sessions, quarter, year) {
  const pays = supporterPayRows(state, sessions);
  const rows = [
    { height: 30, cells: [title(`${year}년 ${quarter}분기 학습지원 실적`), ...blank(10)] },
    [section(`${periodLabel('quarter', quarter, year)} / ${state.cfg.centerName || ''}`), ...blank(10)],
    [],
    [head('지원단'), head('구분'), head('학습코칭'), head('수업협력'), head('총회기'), head('총분'), head('기준단가'), head('산출액'), head('확인'), head('비고')],
    ...pays.map((r) => [left(r.name), c(r.roleType), c(r.learning), c(r.classCoaching), c(r.count), c(r.minutes), c(rateLabelForRow(state, r)), money(r.pay), c(''), c('')]),
    [left('합계'), '', total(pays.reduce((s, r) => s + r.learning, 0)), total(pays.reduce((s, r) => s + r.classCoaching, 0)), total(pays.reduce((s, r) => s + r.count, 0)), total(pays.reduce((s, r) => s + r.minutes, 0)), '', total(pays.reduce((s, r) => s + r.pay, 0)), '', '']
  ];
  while (rows.length < 22) rows.push(['', '', '', '', '', '', '', '', '', '']);
  return { name: '분기별실적양식', cols: [14, 14, 12, 12, 12, 12, 14, 14, 12, 18], merges: ['A1:J1', 'A2:J2'], freeze: { y: 4, topLeftCell: 'A5' }, rows };
}

function buildPaySheet(state, sessions) {
  const pays = supporterPayRows(state, sessions);
  return {
    name: '지원단지급산출',
    cols: [16, 16, 12, 12, 12, 14, 14, 18],
    autoFilter: 'A3:H3',
    rows: [
      [title('지원단 지급 산출'), ...blank(7)],
      [section('단가 기준: 학습코칭 50분 40,000원 / 수업협력 단위수업 30,000원 - 설정값 변경 가능'), ...blank(7)],
      [head('지원단'), head('구분'), head('학습코칭'), head('수업협력'), head('총회기'), head('총분'), head('산출액'), head('비고')],
      ...pays.map((r) => [left(r.name), c(r.roleType), c(r.learning), c(r.classCoaching), c(r.count), c(r.minutes), money(r.pay), '']),
      [left('합계'), '', total(pays.reduce((s, r) => s + r.learning, 0)), total(pays.reduce((s, r) => s + r.classCoaching, 0)), total(pays.reduce((s, r) => s + r.count, 0)), total(pays.reduce((s, r) => s + r.minutes, 0)), total(pays.reduce((s, r) => s + r.pay, 0)), '']
    ],
    merges: ['A1:H1', 'A2:H2'],
    freeze: { y: 3, topLeftCell: 'A4' }
  };
}

function buildDetailSheet(state, sessions) {
  const details = detailRows(state, sessions);
  return {
    name: '세부활동내역',
    cols: [7, 12, 18, 10, 8, 8, 14, 14, 14, 12, 9, 9, 8, 30, 24, 10, 12],
    autoFilter: 'A3:Q3',
    freeze: { y: 3, topLeftCell: 'A4' },
    merges: ['A1:Q1', 'A2:Q2'],
    rows: [
      [title('세부 활동 내역'), ...blank(16)],
      [section('확인 미완료, 활동내용 누락, 연결 끊김 여부는 점검 시트와 함께 확인'), ...blank(16)],
      [head('번호'), head('일자'), head('학교'), head('학교급'), head('학년'), head('학급'), head('대상'), head('영역'), head('방식'), head('지원단'), head('시작'), head('종료'), head('분'), head('활동내용'), head('피드백'), head('확인'), head('산출액')],
      ...details.map((r) => [c(r.no), c(r.date), left(r.school), c(r.schoolLevel), c(r.grade), c(r.className), left(r.target), c(r.area), c(r.mode), c(r.supporter), c(r.start), c(r.end), c(r.minutes), left(r.topic), left(r.feedback), r.confirmed === '확인' ? c(r.confirmed) : warn(r.confirmed), money(r.pay)])
    ]
  };
}

function buildValidationSheet(state, sessions) {
  const rows = issueRows(state, sessions);
  return {
    name: '자료점검',
    cols: [14, 14, 42, 34],
    merges: ['A1:D1', 'A2:D2'],
    rows: [
      [title('자료 점검 결과'), ...blank(3)],
      [section('보고 전 확인용: 미완료 항목은 통계 산출에는 포함되나 제출 전 보완 권장'), ...blank(3)],
      [head('구분'), head('일자'), head('점검내용'), head('조치')],
      ...rows.map((r) => [r[0] === '정상' ? c(r[0]) : warn(r[0]), c(r[1]), left(r[2]), left(r[3])])
    ]
  };
}

function exportReport(state, periodType, value, year, mode = 'standard') {
  const sessions = filteredSessions(state, periodType, value, year);
  const titleName = periodType === 'month' ? `월별실적_${value}` : `분기실적_${year}_${value}분기`;
  const sheets = [
    buildSummarySheet(state, sessions, periodType, value, year),
    periodType === 'month' ? buildMonthlyTemplateSheet(state, sessions, value) : buildQuarterTemplateSheet(state, sessions, value, year),
    buildPaySheet(state, sessions),
    buildDetailSheet(state, sessions),
    buildValidationSheet(state, sessions)
  ];
  if (mode === 'detail') {
    sheets.unshift({
      name: '원자료',
      cols: [20, 20],
      rows: [
        [title('원자료 요약'), ''],
        [left('센터'), left(state.cfg.centerName || '')],
        [left('기간'), left(periodLabel(periodType, value, year))],
        [left('활동회기'), c(sessions.length)],
        [left('주의'), left('보고용 제출 전 자료점검 시트의 미확인 항목을 확인하세요.')]
      ],
      merges: ['A1:B1']
    });
  }
  exportWorkbookXlsx({ filename: `${titleName}_${mode === 'template' ? '양식형' : '검증형'}.xlsx`, sheets });
  toast(`${titleName} ${mode === 'template' ? '양식형' : '검증형'} XLSX 파일을 만들었습니다.`, 'success');
}

export function renderStatisticsView() {
  const state = getState();
  const defaultMonth = new Date().toISOString().slice(0, 7);
  const year = el('input', { type: 'number', value: state.cfg.fiscalYear || new Date().getFullYear() });
  const month = el('input', { type: 'month', value: defaultMonth });
  const quarter = el('select');
  [1, 2, 3, 4].forEach((q) => quarter.appendChild(el('option', { value: q, text: `${q}분기` })));
  const sessions = filteredSessions(state, 'month', month.value, year.value);
  const matrix = schoolAreaMatrix(state, sessions);
  const payRows = supporterPayRows(state, sessions);

  return el('div', { className: 'panel-grid' },
    el('section', { className: 'card stack' },
      el('h2', { text: '월별 실적 보고서' }),
      el('div', { className: 'toolbar-group' },
        formField('기준월', month),
        el('button', { className: 'btn success', onClick: () => exportReport(state, 'month', month.value, Number(year.value), 'template') }, '월별 양식형 XLSX'),
        el('button', { className: 'btn ghost', onClick: () => exportReport(state, 'month', month.value, Number(year.value), 'detail') }, '월별 검증형 XLSX')
      ),
      table(['학교', '학교급', '학년', ...AREAS, '합계'], matrix.map((r) => [r.school, r.schoolLevel, r.grade, ...AREAS.map((a) => r.areas[a] || 0), r.total])),
      el('p', { className: 'helper', text: 'V10.3는 표지·양식형 실적·지급산출·세부내역·자료점검 시트를 함께 생성합니다.' })
    ),
    el('section', { className: 'card stack' },
      el('h2', { text: '분기별 통계 및 지급산출' }),
      el('div', { className: 'toolbar-group' },
        formField('사업연도', year),
        formField('분기', quarter),
        el('button', { className: 'btn success', onClick: () => exportReport(state, 'quarter', quarter.value, Number(year.value), 'template') }, '분기 양식형 XLSX'),
        el('button', { className: 'btn ghost', onClick: () => exportReport(state, 'quarter', quarter.value, Number(year.value), 'detail') }, '분기 검증형 XLSX')
      ),
      table(['지원단', '구분', '학습코칭', '수업협력', '회기', '분', '산출액'], payRows.map((r) => [r.name, r.roleType, r.learning, r.classCoaching, r.count, r.minutes, formatWon(r.pay)])),
      el('p', { className: 'helper', text: '구형 .xls 원본을 직접 덮어쓰지 않고, 제출 전 검증 가능한 .xlsx 산출물로 분리했습니다.' })
    )
  );
}
