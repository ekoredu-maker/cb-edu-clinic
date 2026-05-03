import { normalizeTime } from '../core/time.js';

function schoolLevelFromName(name = '') {
  if (name.includes('초')) return '초등';
  if (name.includes('중')) return '중등';
  if (name.includes('고')) return '고등';
  return '기타';
}

function legacyEnd(time, minutes = 100) {
  const [h, m] = normalizeTime(time).split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}


function legacyMinutesFromMode(mode) {
  return mode === '수업협력코칭' ? 40 : 50;
}

export function migrateV95(legacy) {
  const now = new Date().toISOString();
  const supporters = (legacy.stf || []).map((item) => ({
    id: crypto.randomUUID(),
    name: item.nm || '',
    birthDate: item.bd || '',
    phone: item.ph || '',
    roleType: '학습지원단',
    availability: item.day || item.time ? [{ day: item.day || '월', start: normalizeTime(item.time), end: legacyEnd(item.time, 50), priority: 1 }] : [],
    maxDailySessions: 4,
    note: '',
    createdAt: now
  }));

  const students = (legacy.stu || []).map((item) => ({
    id: crypto.randomUUID(),
    name: item.nm || '',
    gender: '',
    school: item.sch || '',
    schoolLevel: schoolLevelFromName(item.sch || ''),
    grade: String(item.gr || ''),
    className: '',
    supportArea: item.ar || '학습지원',
    supportMode: item.ar === '수업협력코칭' ? '수업협력코칭' : '학습코칭',
    targetType: '개인',
    preferences: item.day || item.time ? [{ day: item.day || '월', start: normalizeTime(item.time), end: legacyEnd(item.time, legacyMinutesFromMode(item.ar === '수업협력코칭' ? '수업협력코칭' : '학습코칭')), priority: 1 }] : [],
    complaint: '',
    goal: '',
    strategy: '',
    note: '',
    createdAt: now
  }));

  const supporterMap = new Map();
  (legacy.stf || []).forEach((oldItem, index) => supporterMap.set(String(oldItem.id), supporters[index]?.id));
  const studentMap = new Map();
  (legacy.stu || []).forEach((oldItem, index) => studentMap.set(String(oldItem.id), students[index]?.id));

  const sessions = [];
  const matches = (legacy.mat || []).map((item) => {
    const id = crypto.randomUUID();
    const student = students.find((s) => s.id === studentMap.get(String(item.sid)));
    const mapped = {
      id,
      studentId: studentMap.get(String(item.sid)),
      supporterId: supporterMap.get(String(item.fid)),
      day: item.day || '월',
      start: normalizeTime(item.time),
      end: legacyEnd(item.time, legacyMinutesFromMode(student?.supportMode || '학습코칭')),
      school: student?.school || '',
      serviceMode: student?.supportMode || '학습코칭',
      preferencePriority: 1,
      active: true,
      createdAt: now
    };
    (item.logs || []).forEach((log) => {
      const start = normalizeTime(log.time);
      sessions.push({
        id: crypto.randomUUID(),
        matchId: id,
        date: log.date || '',
        school: log.school || student?.school || '',
        start,
        end: legacyEnd(start, legacyMinutesFromMode(student?.supportMode || '학습코칭')),
        minutes: legacyMinutesFromMode(student?.supportMode || '학습코칭'),
        subject: '',
        targetName: student?.name || '',
        topic: log.topic || '',
        feedback: '',
        confirmed: true,
        confirmedBy: '',
        note: '',
        createdAt: now
      });
    });
    return mapped;
  }).filter((item) => item.studentId && item.supporterId);

  return {
    version: '10.3.0',
    cfg: {
      centerName: legacy.cfg?.nm || '충북학습종합클리닉센터 제천거점',
      managerEdu: legacy.cfg?.mgr_edu || '학습상담사',
      managerAdmin: legacy.cfg?.mgr_admin || '행정실무사',
      fiscalYear: new Date().getFullYear(),
      learningRate: 40000,
      classRate: 30000,
      defaultLearningMinutes: 50,
      defaultClassMinutes: 40
    },
    supporters,
    students,
    matches,
    sessions,
    trainings: (legacy.trn || []).map((item) => ({
      id: crypto.randomUUID(),
      date: item.dt || '',
      topic: item.tp || '',
      fee: Number(item.fee || 0),
      attendanceIds: [],
      note: ''
    })),
    auditLogs: [{ id: crypto.randomUUID(), at: now, action: 'migrate-v9.5-to-v10.3' }],
    meta: {
      createdAt: now,
      updatedAt: now,
      migratedFrom: 'V9.5'
    }
  };
}
