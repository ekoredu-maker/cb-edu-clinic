import { monthDays, weekdayKo, safeDateLabel, durationMinutes, formatWon } from '../core/time.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function splitDays(days) {
  const left = [];
  const right = [];
  for (let i = 1; i <= days; i += 1) (i <= 16 ? left : right).push(i);
  while (right.length < left.length) right.push('');
  return [left, right];
}

function manageMiniTable(ym, days, rowsByDate, serviceLabel) {
  return `<table class="doc-table">
    <thead><tr><th style="width:12%">일자</th><th style="width:12%">요일</th><th>방문학교</th><th style="width:22%">시간</th><th>${esc(serviceLabel)}</th></tr></thead>
    <tbody>${days.map((day) => {
      if (!day) return '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>';
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      const dayRows = rowsByDate.get(date) || [];
      const first = dayRows[0];
      return `<tr>
        <td class="center">${day}</td>
        <td class="center">${weekdayKo(date)}</td>
        <td>${esc(first?.school || '')}</td>
        <td class="center">${first ? `${esc(first.start)}~${esc(first.end)}` : ''}</td>
        <td>${esc(first?.target || '')}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

export function renderManageBook({ ym, centerName, managerEdu, supporterName, serviceMode, rate, unitMinutes, rows }) {
  const days = monthDays(ym);
  const [left, right] = splitDays(days);
  const rowsByDate = new Map();
  (rows || []).forEach((row) => {
    if (!rowsByDate.has(row.date)) rowsByDate.set(row.date, []);
    rowsByDate.get(row.date).push(row);
  });
  const totalMinutes = (rows || []).reduce((sum, row) => sum + Number(row.minutes || durationMinutes(row.start, row.end)), 0);
  const label = serviceMode === '수업협력코칭' ? '수업협력코칭 대상학급' : '학습코칭 대상학생';
  const roleLabel = serviceMode === '수업협력코칭' ? '학습서포터즈' : '학습코치';
  const payLabel = serviceMode === '수업협력코칭' ? '학습서포터즈' : '학습코치';
  const pay = Math.round(totalMinutes / Number(unitMinutes || 50) * Number(rate || 40000));
  return `
    <div class="doc-page">
      <div class="doc-title">학습지원단 관리부(${Number(ym.split('-')[1])}월)</div>
      <div class="doc-meta">
        <div>□ 소 속: ${esc(centerName)}</div>
        <div>□ 기 간: ${esc(ym.replace('-', '. '))}. 01.~${esc(ym.replace('-', '. '))}. ${String(days).padStart(2, '0')}.</div>
        <div>□ 성 명: ${esc(supporterName)} ( 서명 또는 인 )</div>
      </div>
      <div class="manage-grid">
        ${manageMiniTable(ym, left, rowsByDate, label)}
        ${manageMiniTable(ym, right, rowsByDate, label)}
      </div>
      <div class="doc-note">※ ${esc(payLabel)} 1회기(${Number(unitMinutes || 50)}분)당 ${Number(rate || 0).toLocaleString('ko-KR')}원 ${esc(roleLabel)}: ${Math.round(totalMinutes / 60 * 10) / 10}시간 / 산출액 ${formatWon(pay)}</div>
      <div class="doc-foot">확인자 (학습상담사): ${esc(managerEdu)} ( 인 )</div>
    </div>
  `;
}

export function renderVisitLog({ ym, centerName, schoolName, rows }) {
  const padded = [...(rows || [])];
  while (padded.length < 12) padded.push({});
  const half = Math.ceil(padded.length / 2);
  const part = (items) => `<table class="doc-table">
    <thead><tr><th style="width:18%">일자</th><th style="width:20%">이름</th><th style="width:26%">방문시간</th><th>활동내용</th></tr></thead>
    <tbody>${items.map((row) => `<tr>
      <td class="center">${esc(row.date ? safeDateLabel(row.date) : '')}</td>
      <td class="center">${esc(row.name || '')}</td>
      <td class="center">${row.start ? `${esc(row.start)}~${esc(row.end)}` : ''}</td>
      <td>${esc(row.activity || '')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
  return `
    <div class="doc-page">
      <div class="doc-title">학습지원단 방문일지(${Number(ym.split('-')[1])}월)</div>
      <div class="doc-meta">
        <div>□ 소속 : ${esc(centerName)}</div>
        <div>□ 학교명 : ${esc(schoolName || '')}</div>
      </div>
      <div class="visit-grid">${part(padded.slice(0, half))}${part(padded.slice(half))}</div>
    </div>
  `;
}

export function renderPlanSheet({ year, semester, student, supporter, sessionPlan }) {
  const rows = [...(sessionPlan || [])];
  while (rows.length < 15) rows.push({});
  return `
    <div class="doc-page">
      <div class="doc-title">${esc(year || '')}년도 ${esc(semester || '')}학기<br>학습상담 및 학습코칭 진행계획서</div>
      <div class="doc-meta inline">
        <div>코칭 대상 이름: ${esc(student?.name || '')}</div>
        <div>구분: ${esc(student?.targetType || '개인')}</div>
        <div>학습코치: ${esc(supporter?.name || '')} (서명 또는 인)</div>
      </div>
      <div class="doc-section"><div class="doc-section-title">주 호소문제(학습 수준 포함)</div><table class="doc-table"><tr><td>${esc(student?.complaint || '')}</td></tr></table></div>
      <div class="doc-section"><div class="doc-section-title">학습상담·학습코칭 목표 및 전략</div><table class="doc-table"><tr><th style="width:18%">목표</th><td>${esc(student?.goal || '')}</td></tr><tr><th>전략</th><td>${esc(student?.strategy || '')}</td></tr></table></div>
      <div class="doc-section"><div class="doc-section-title">진행 계획</div><table class="doc-table">
        <thead><tr><th style="width:10%">회기</th><th style="width:25%">일시</th><th style="width:18%">영역</th><th>학습상담 및 학습코칭 진행 계획</th></tr></thead>
        <tbody>${rows.map((row, index) => `<tr><td class="center">${index + 1}</td><td>${esc(row.date || '')}</td><td>${esc(row.area || '')}</td><td>${esc(row.plan || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
  `;
}

export function renderConfirmSheet({ student, schoolName, supporter, rows }) {
  const filled = [...(rows || [])];
  while (filled.length < 8) filled.push({});
  return `
    <div class="doc-page">
      <div class="doc-title">학습상담 및 학습코칭 진행 확인서</div>
      <div class="doc-meta inline">
        <div>학 교 명: ${esc(schoolName)}</div>
        <div>담당(담임)교사성명: __________ (서명 또는 인)</div>
        <div>대상학생: ${esc(student?.name || '')}</div>
        <div>구분: □개인 □집단</div>
      </div>
      <table class="doc-table">
        <thead><tr><th style="width:10%">회기</th><th style="width:22%">일시</th><th style="width:25%">활동 목표</th><th>활동 내용 및 평가</th></tr></thead>
        <tbody>${filled.map((row, index) => `<tr><td class="center">${index + 1}</td><td>${esc(row.date || '')}<br>${row.start ? `${esc(row.start)}~${esc(row.end)}` : ''}</td><td>${esc(row.goal || '')}</td><td>${esc(row.topic || '')}<br>${esc(row.feedback || '')}</td></tr>`).join('')}</tbody>
      </table>
      <p class="doc-note">위와 같이 충북학습종합클리닉센터 거점의 학습상담 및 학습코칭을 학교에 제공함을 확인합니다.</p>
      <div class="sign-row"><span>학습코치 ${esc(supporter?.name || '')} (서명 또는 인)</span><span>교 감 __________ (서명 또는 인)</span></div>
    </div>
  `;
}

export function renderClassConfirmSheet({ schoolName, supporter, rows }) {
  const filled = [...(rows || [])];
  while (filled.length < 8) filled.push({});
  return `
    <div class="doc-page">
      <div class="doc-title">수업협력코칭 진행 확인서</div>
      <table class="doc-table">
        <thead><tr><th style="width:13%">일자</th><th style="width:18%">학교명</th><th style="width:12%">대상학급</th><th style="width:18%">활동시간</th><th style="width:10%">과목</th><th>진행 내용</th><th style="width:10%">담임확인</th></tr></thead>
        <tbody>${filled.map((row) => `<tr><td>${esc(row.date || '')}</td><td>${esc(row.school || schoolName || '')}</td><td>${esc(row.className || '')}</td><td>${row.start ? `${esc(row.start)}~${esc(row.end)}` : ''}</td><td>${esc(row.subject || '')}</td><td>${esc(row.topic || '')}</td><td></td></tr>`).join('')}</tbody>
      </table>
      <div class="doc-foot">총 시수: ______ 시간</div>
      <p class="doc-note">위와 같이 충북학습종합클리닉센터 거점의 수업협력코칭을 학교에 제공함을 확인합니다.</p>
      <div class="sign-row"><span>&lt;제공&gt; 학습서포터즈 ${esc(supporter?.name || '')} (서명 또는 인)</span><span>&lt;확인&gt; 교 감 __________ (서명 또는 인)</span></div>
    </div>
  `;
}

export function renderAppointment({ centerName, supporter, year }) {
  return `
    <div class="doc-page big-certificate">
      <h1>위 촉 장</h1>
      <div class="body">
        <p>성명: <strong>${esc(supporter?.name || '')}</strong> ${supporter?.birthDate ? `(${esc(supporter.birthDate)})` : ''}</p>
        <p>위 사람을 ${esc(year || '')}학년도 ${esc(centerName)}</p>
        <p>${esc(supporter?.roleType || '학습지원단')}으로 위촉합니다.</p>
        <p style="margin-top:20mm;">${esc(year || '')}년&nbsp;&nbsp;3월&nbsp;&nbsp;1일</p>
        <p style="font-weight:700;">충청북도 교육지원청 교육장</p>
      </div>
    </div>
  `;
}

export function renderCertificate({ supporter, year }) {
  return `
    <div class="doc-page">
      <div class="doc-title">경 력 증 명 서</div>
      <table class="doc-table">
        <tr><th style="width:22%">성명</th><td>${esc(supporter?.name || '')}</td><th style="width:22%">생년월일</th><td>${esc(supporter?.birthDate || '')}</td></tr>
        <tr><th>구분</th><td colspan="3">${esc(supporter?.roleType || '')}</td></tr>
        <tr><th>활동기간</th><td colspan="3">${esc(year || '')}년 3월 ~ ${esc(year || '')}년 12월</td></tr>
        <tr><th>활동내용</th><td colspan="3">충북학습종합클리닉센터 학습지원 활동</td></tr>
      </table>
      <p class="doc-note" style="text-align:center; margin-top:20mm;">위와 같이 증명합니다.</p>
      <div class="doc-foot" style="text-align:center; margin-top:20mm; font-weight:700;">교육지원청 교육장</div>
    </div>
  `;
}

export function renderReport({ student, supporter, rows, group = false }) {
  const filled = rows || [];
  return `
    <div class="doc-page">
      <div class="doc-title">학습상담 및 학습코칭 보고서 (${group ? '집단' : '개인'})</div>
      <div class="doc-meta inline"><div>제출자: ${esc(supporter?.name || '')}</div><div>일시: ${new Date().toISOString().slice(0, 10)}</div></div>
      <div class="doc-section"><div class="doc-section-title">Ⅰ. 대상 학생 이해</div>
        <table class="doc-table"><tr><th>학교(학년)</th><th>이름(성별)</th><th>주호소문제</th><th>비고</th></tr>
        <tr><td>${esc(student?.school || '')} ${esc(student?.grade || '')}</td><td>${esc(student?.name || '')}${student?.gender ? `(${esc(student.gender)})` : ''}</td><td>${esc(student?.complaint || '')}</td><td>${esc(student?.note || '')}</td></tr></table>
      </div>
      <div class="doc-section"><div class="doc-section-title">Ⅱ. 학습상담 및 학습코칭 내용</div>
        <table class="doc-table"><tr><th style="width:20%">서비스 내용</th><td>${esc(student?.supportArea || '')}</td></tr><tr><th>지도내용</th><td>${esc(filled.map((r) => r.topic).filter(Boolean).join(' / '))}</td></tr><tr><th>결과 및 평가</th><td>${esc(filled.map((r) => r.feedback).filter(Boolean).join(' / '))}</td></tr></table>
      </div>
      <div class="doc-section"><div class="doc-section-title">Ⅲ. 성과 및 추수지도 방향</div>
        <table class="doc-table"><tr><th style="width:24%">학습상담 및 학습코칭 전</th><td></td></tr><tr><th>학습상담 및 학습코칭 후</th><td></td></tr><tr><th>추수지도 방향</th><td>${esc(student?.strategy || '')}</td></tr></table>
      </div>
      <div class="doc-section"><div class="doc-section-title">Ⅳ. 첨부자료</div><table class="doc-table"><tr><td>각종 표준화검사, 활동 사진 및 자료 등</td></tr></table></div>
    </div>
  `;
}
