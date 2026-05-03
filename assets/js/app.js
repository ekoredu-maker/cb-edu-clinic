import { el, empty, toast, formField, optionList } from './core/engine.js';
import { loadState, getState, patchState, resetState, saveState, subscribe } from './core/state.js';
import { tabs, getActiveTab, setActiveTab, resolveInitialTab } from './core/router.js';
import { renderSupportersView } from './domain/supporters.js';
import { renderStudentsView } from './domain/students.js';
import { renderMatchingView } from './domain/matching.js';
import { renderSessionsView } from './domain/sessions.js';
import { renderTrainingView } from './domain/training.js';
import { renderStatisticsView } from './domain/statistics.js';
import { renderValidationView } from './domain/validation.js';
import { registerServiceWorker, wireInstallPrompt, clearAppCaches } from './services/cache.js';
import { exportJson } from './services/excel.js';
import { migrateV95 } from './services/migration.js';
import { showPrintable } from './services/print.js';
import {
  renderManageBook,
  renderVisitLog,
  renderPlanSheet,
  renderConfirmSheet,
  renderClassConfirmSheet,
  renderAppointment,
  renderCertificate,
  renderReport
} from './templates/forms.js';
import { durationMinutes, ymOfToday } from './core/time.js';

function getRate(state, serviceMode) {
  return serviceMode === '수업협력코칭' ? Number(state.cfg.classRate || 30000) : Number(state.cfg.learningRate || 40000);
}

function getUnitMinutes(state, serviceMode) {
  return serviceMode === '수업협력코칭' ? Number(state.cfg.defaultClassMinutes || 40) : Number(state.cfg.defaultLearningMinutes || 50);
}

function renderDashboard() {
  const state = getState();
  const currentYm = ymOfToday();
  const monthSessions = state.sessions.filter((item) => item.date?.startsWith(currentYm));
  const activeMatches = state.matches.filter((m) => m.active !== false);
  const totalPay = monthSessions.reduce((sum, session) => {
    const match = state.matches.find((m) => m.id === session.matchId);
    const minutes = Number(session.minutes || durationMinutes(session.start, session.end));
    return sum + Math.round(minutes / getUnitMinutes(state, match?.serviceMode) * getRate(state, match?.serviceMode));
  }, 0);
  const cards = [
    ['총 학생', `${state.students.length}명`],
    ['지원단', `${state.supporters.length}명`],
    ['활성 매칭', `${activeMatches.length}건`],
    ['이달 활동', `${monthSessions.length}회`],
    ['이달 산출액', `${totalPay.toLocaleString('ko-KR')}원`]
  ];
  const root = document.getElementById('dashboard');
  root.replaceChildren(...cards.map(([label, value]) => el('div', { className: 'dash-card' }, el('div', { className: 'label', text: label }), el('div', { className: 'value', text: value }))));
}

function renderTabs() {
  const root = document.getElementById('tabbar');
  root.replaceChildren(...tabs.map((tab) => el('button', {
    className: `btn tab-btn ${getActiveTab() === tab.id ? 'active' : ''}`,
    onClick: () => { setActiveTab(tab.id); renderApp(); }
  }, tab.label)));
}

function renderSettingsView() {
  const state = getState();
  const centerName = el('input', { value: state.cfg.centerName });
  const managerEdu = el('input', { value: state.cfg.managerEdu });
  const managerAdmin = el('input', { value: state.cfg.managerAdmin });
  const fiscalYear = el('input', { type: 'number', value: state.cfg.fiscalYear || new Date().getFullYear() });
  const learningRate = el('input', { type: 'number', value: state.cfg.learningRate || 40000 });
  const classRate = el('input', { type: 'number', value: state.cfg.classRate || 30000 });
  const defaultLearningMinutes = el('input', { type: 'number', value: state.cfg.defaultLearningMinutes || 50 });
  const defaultClassMinutes = el('input', { type: 'number', value: state.cfg.defaultClassMinutes || 40 });

  const backupInput = el('input', { type: 'file', accept: '.json' });
  const migrationInput = el('input', { type: 'file', accept: '.json' });

  backupInput.addEventListener('change', async () => {
    const [file] = backupInput.files || [];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      await saveState(json, 'restore-v10-backup');
      toast('V10 백업을 복원했습니다.', 'success');
      renderApp();
    } catch {
      toast('백업 파일을 읽지 못했습니다.', 'error');
    } finally {
      backupInput.value = '';
    }
  });

  migrationInput.addEventListener('change', async () => {
    const [file] = migrationInput.files || [];
    if (!file) return;
    try {
      const legacy = JSON.parse(await file.text());
      const migrated = migrateV95(legacy);
      await saveState(migrated, 'migrate-v95');
      toast('V9.5 백업을 V10.3 구조로 변환했습니다.', 'success');
      renderApp();
    } catch {
      toast('V9.5 JSON 백업 파일을 읽지 못했습니다.', 'error');
    } finally {
      migrationInput.value = '';
    }
  });

  async function seedDemo() {
    if (!window.confirm('현재 데이터에 예시 데이터를 추가할까요?')) return;
    await patchState((draft) => {
      const supporterId = crypto.randomUUID();
      const supporter2Id = crypto.randomUUID();
      const studentId = crypto.randomUUID();
      const student2Id = crypto.randomUUID();
      draft.supporters.push(
        { id: supporterId, name: '홍길동', birthDate: '1980.05.15', phone: '010-1111-2222', roleType: '학습코치', availability: [{ day: '목', start: '09:00', end: '10:50', priority: 1 }, { day: '월', start: '14:00', end: '15:40', priority: 1 }], maxDailySessions: 4, note: '제천권', createdAt: new Date().toISOString() },
        { id: supporter2Id, name: '김영희', birthDate: '1978.03.10', phone: '010-3333-4444', roleType: '학습서포터즈', availability: [{ day: '화', start: '09:00', end: '09:40', priority: 1 }], maxDailySessions: 5, note: '수업협력', createdAt: new Date().toISOString() }
      );
      draft.students.push(
        { id: studentId, name: '한지민', gender: '여', school: '제천초', schoolLevel: '초등', grade: '3', className: '3-1', supportArea: '기초학습', supportMode: '학습코칭', targetType: '개인', preferences: [{ day: '목', start: '09:00', end: '10:50', priority: 1 }, { day: '월', start: '14:00', end: '15:40', priority: 2 }], complaint: '기초연산 부진', goal: '기초연산 정확도 향상', strategy: '짧은 과제와 즉각 피드백 중심', note: '', createdAt: new Date().toISOString() },
        { id: student2Id, name: '4-1학급', gender: '', school: '제천중앙초', schoolLevel: '초등', grade: '4', className: '4-1', supportArea: '수업협력코칭', supportMode: '수업협력코칭', targetType: '학급', preferences: [{ day: '화', start: '09:00', end: '09:40', priority: 1 }], complaint: '수학 수업 중 개별 피드백 필요', goal: '수업 참여도 향상', strategy: '담임교사와 협력하여 과제 수행 지원', note: '', createdAt: new Date().toISOString() }
      );
      draft.matches.push(
        { id: crypto.randomUUID(), studentId, supporterId, day: '목', start: '09:00', end: '09:50', school: '제천초', serviceMode: '학습코칭', preferencePriority: 1, active: true, createdAt: new Date().toISOString() },
        { id: crypto.randomUUID(), studentId: student2Id, supporterId: supporter2Id, day: '화', start: '09:00', end: '09:40', school: '제천중앙초', serviceMode: '수업협력코칭', preferencePriority: 1, active: true, createdAt: new Date().toISOString() }
      );
      return draft;
    }, 'seed-demo');
    toast('예시 데이터를 추가했습니다.', 'success');
    renderApp();
  }

  return el('div', { className: 'panel-grid' },
    el('section', { className: 'card stack' },
      el('div', { className: 'list-toolbar' },
        el('h2', { text: '시스템 설정' }),
        el('button', {
          className: 'btn',
          onClick: async () => {
            await patchState((draft) => {
              draft.cfg.centerName = centerName.value.trim() || draft.cfg.centerName;
              draft.cfg.managerEdu = managerEdu.value.trim() || draft.cfg.managerEdu;
              draft.cfg.managerAdmin = managerAdmin.value.trim() || draft.cfg.managerAdmin;
              draft.cfg.fiscalYear = Number(fiscalYear.value || new Date().getFullYear());
              draft.cfg.learningRate = Number(learningRate.value || 40000);
              draft.cfg.classRate = Number(classRate.value || 30000);
              draft.cfg.defaultLearningMinutes = Number(defaultLearningMinutes.value || 50);
              draft.cfg.defaultClassMinutes = Number(defaultClassMinutes.value || 40);
              return draft;
            }, 'update-config');
            renderHeader();
            toast('설정을 저장했습니다.', 'success');
          }
        }, '저장')
      ),
      el('div', { className: 'form-grid' },
        formField('센터명', centerName),
        formField('사업연도', fiscalYear),
        formField('학습상담사', managerEdu),
        formField('행정실무사', managerAdmin),
        formField('학습코칭 단가', learningRate),
        formField('수업협력 단가', classRate),
        formField('학습코칭 기준분', defaultLearningMinutes),
        formField('수업협력 기준분', defaultClassMinutes)
      )
    ),
    el('section', { className: 'card stack' },
      el('h2', { text: '데이터 관리' }),
      el('div', { className: 'toolbar-group' },
        el('button', { className: 'btn success', onClick: () => exportJson(getState(), `jc_v10_3_backup_${new Date().toISOString().slice(0, 10)}.json`) }, 'V10.3 백업'),
        el('button', { className: 'btn ghost', onClick: () => backupInput.click() }, 'V10 백업 복원'),
        backupInput
      ),
      el('div', { className: 'toolbar-group' },
        el('button', { className: 'btn ghost', onClick: () => migrationInput.click() }, 'V9.5 JSON 마이그레이션'),
        migrationInput,
        el('button', { className: 'btn ghost', onClick: seedDemo }, '예시 데이터 추가'),
        el('button', { className: 'btn danger', onClick: async () => { if (window.confirm('전체 데이터를 초기화할까요?')) { await resetState(); await clearAppCaches(); renderApp(); toast('데이터를 초기화했습니다. 앱 캐시는 다음 접속 때 다시 적재됩니다.', 'success'); } } }, '초기화')
      ),
      el('p', { className: 'helper', text: 'V10.3은 IndexedDB에 저장됩니다. GitHub Pages에 올린 뒤 최초 1회 접속하면 PWA 캐시가 적재됩니다.' })
    )
  );
}

function renderDocumentsView() {
  const state = getState();
  const docType = optionList(el('select'), [
    ['manage-book', '학습지원단 관리부'],
    ['visit-log', '학습지원단 방문일지'],
    ['plan-sheet', '진행계획서'],
    ['confirm-sheet', '학습코칭 진행 확인서'],
    ['class-confirm-sheet', '수업협력코칭 진행 확인서'],
    ['appoint', '위촉장'],
    ['cert', '경력증명서'],
    ['report-personal', '보고서(개인)'],
    ['report-group', '보고서(집단)']
  ], 'manage-book');
  const month = el('input', { type: 'month', value: ymOfToday() });
  const target = el('select');
  const semester = optionList(el('select'), ['1', '2'], '1');

  function refreshTargetOptions() {
    target.replaceChildren();
    if (['manage-book', 'visit-log', 'appoint', 'cert'].includes(docType.value)) {
      state.supporters.forEach((item) => target.appendChild(el('option', { value: item.id, text: item.name })));
    } else {
      state.matches.filter((m) => m.active !== false).forEach((item) => {
        const student = state.students.find((s) => s.id === item.studentId);
        const supporter = state.supporters.find((f) => f.id === item.supporterId);
        target.appendChild(el('option', { value: item.id, text: `${student?.name || '-'} / ${supporter?.name || '-'} / ${item.serviceMode}` }));
      });
    }
  }
  docType.addEventListener('change', refreshTargetOptions);
  refreshTargetOptions();

  function buildDocHtml() {
    const supporter = state.supporters.find((item) => item.id === target.value);
    const match = state.matches.find((item) => item.id === target.value);
    const student = state.students.find((item) => item.id === match?.studentId);
    const matchSupporter = state.supporters.find((item) => item.id === match?.supporterId);
    const allSessions = state.sessions.filter((item) => item.date?.startsWith(month.value));
    const matchSessions = allSessions.filter((item) => item.matchId === match?.id);
    const supporterSessions = allSessions.filter((item) => {
      const linked = state.matches.find((m) => m.id === item.matchId);
      return linked?.supporterId === supporter?.id;
    });

    switch (docType.value) {
      case 'manage-book': {
        const representativeMode = supporterSessions.some((row) => state.matches.find((m) => m.id === row.matchId)?.serviceMode === '수업협력코칭') ? '수업협력코칭' : '학습코칭';
        return renderManageBook({
          ym: month.value,
          centerName: state.cfg.centerName,
          managerEdu: state.cfg.managerEdu,
          supporterName: supporter?.name || '',
          serviceMode: representativeMode,
          rate: getRate(state, representativeMode),
          unitMinutes: getUnitMinutes(state, representativeMode),
          rows: supporterSessions.map((row) => {
            const linkedMatch = state.matches.find((m) => m.id === row.matchId);
            const linkedStudent = state.students.find((s) => s.id === linkedMatch?.studentId);
            return { ...row, target: linkedStudent?.targetType === '학급' ? linkedStudent?.className : linkedStudent?.name };
          })
        });
      }
      case 'visit-log':
        return renderVisitLog({
          ym: month.value,
          centerName: state.cfg.centerName,
          schoolName: supporter?.note || '',
          rows: supporterSessions.map((row) => ({ date: row.date, name: supporter?.name || '', start: row.start, end: row.end, activity: row.activity || row.topic || state.matches.find((m) => m.id === row.matchId)?.serviceMode || '' }))
        });
      case 'plan-sheet':
        return renderPlanSheet({
          year: state.cfg.fiscalYear,
          semester: semester.value,
          student,
          supporter: matchSupporter,
          sessionPlan: matchSessions.slice(0, 15).map((row) => ({ date: `${row.date} ${row.start}~${row.end}`, area: student?.supportArea || '', plan: row.topic || student?.strategy || '' }))
        });
      case 'confirm-sheet':
        return renderConfirmSheet({ student, schoolName: student?.school || '', supporter: matchSupporter, rows: matchSessions.map((row) => ({ date: row.date, start: row.start, end: row.end, goal: student?.goal || student?.supportArea || '', topic: row.topic || '', feedback: row.feedback || '' })) });
      case 'class-confirm-sheet':
        return renderClassConfirmSheet({ schoolName: student?.school || '', supporter: matchSupporter, rows: matchSessions.map((row) => ({ date: row.date, school: student?.school || '', className: student?.className || '', start: row.start, end: row.end, subject: row.subject || '', topic: row.topic || '' })) });
      case 'appoint':
        return renderAppointment({ centerName: state.cfg.centerName, supporter, year: state.cfg.fiscalYear });
      case 'cert':
        return renderCertificate({ supporter, year: state.cfg.fiscalYear });
      case 'report-personal':
        return renderReport({ student, supporter: matchSupporter, rows: matchSessions, group: false });
      case 'report-group':
        return renderReport({ student, supporter: matchSupporter, rows: matchSessions, group: true });
      default:
        return '<div class="doc-page"></div>';
    }
  }

  return el('section', { className: 'card stack' },
    el('div', { className: 'list-toolbar' }, el('h2', { text: '행정 서식 출력' })),
    el('div', { className: 'form-grid four' },
      formField('서식 종류', docType),
      formField('대상', target),
      formField('기준 월', month),
      formField('학기', semester)
    ),
    el('div', { className: 'toolbar-group' },
      el('button', { className: 'btn', onClick: () => showPrintable(buildDocHtml()) }, '인쇄/PDF 저장')
    ),
    el('p', { className: 'helper', text: '브라우저 인쇄 창에서 “PDF로 저장”을 선택하면 오프라인 상태에서도 서식을 파일로 저장할 수 있습니다.' })
  );
}

function renderHeader() {
  const state = getState();
  document.getElementById('centerName').textContent = state.cfg.centerName;
  document.getElementById('mgrEduName').textContent = state.cfg.managerEdu;
  document.getElementById('mgrAdminName').textContent = state.cfg.managerAdmin;
}

function renderView() {
  const root = document.getElementById('viewRoot');
  empty(root);
  const active = getActiveTab();
  const renderer = {
    settings: renderSettingsView,
    supporters: renderSupportersView,
    students: renderStudentsView,
    matching: renderMatchingView,
    sessions: renderSessionsView,
    training: renderTrainingView,
    documents: renderDocumentsView,
    statistics: renderStatisticsView,
    validation: renderValidationView
  }[active];
  if (renderer) root.appendChild(renderer());
}

function renderApp() {
  renderHeader();
  renderDashboard();
  renderTabs();
  renderView();
}

window.addEventListener('hashchange', () => {
  resolveInitialTab();
  renderApp();
});

async function start() {
  await loadState();
  resolveInitialTab();
  renderApp();
  subscribe(() => {
    renderDashboard();
    renderHeader();
  });
  registerServiceWorker();
  wireInstallPrompt(document.getElementById('installBtn'));
}

start().catch((error) => {
  console.error(error);
  toast('앱을 시작하지 못했습니다. 콘솔을 확인해 주세요.', 'error');
});
