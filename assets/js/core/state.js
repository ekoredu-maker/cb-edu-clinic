const DB_NAME = 'jc-edu-clinic-v10';
const STORE = 'kv';
const KEY = 'root-state';

const defaultState = {
  version: '10.3.0',
  cfg: {
    centerName: '충북학습종합클리닉센터 제천거점',
    managerEdu: '학습상담사',
    managerAdmin: '행정실무사',
    fiscalYear: new Date().getFullYear(),
    learningRate: 40000,
    classRate: 30000,
    defaultLearningMinutes: 50,
    defaultClassMinutes: 40
  },
  supporters: [],
  students: [],
  matches: [],
  sessions: [],
  trainings: [],
  auditLogs: [],
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

let dbPromise;
let state = structuredClone(defaultState);
const listeners = new Set();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getStore(mode = 'readonly') {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function normalizeSlot(slot, priority = 1) {
  return {
    day: slot?.day || '월',
    start: slot?.start || slot?.time || '14:00',
    end: slot?.end || '15:40',
    priority: Number(slot?.priority || priority)
  };
}

function normalizeState(raw) {
  const next = {
    ...structuredClone(defaultState),
    ...(raw || {}),
    cfg: { ...structuredClone(defaultState.cfg), ...(raw?.cfg || {}) },
    meta: { ...structuredClone(defaultState.meta), ...(raw?.meta || {}) }
  };

  next.supporters = (raw?.supporters || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    birthDate: item.birthDate || '',
    phone: item.phone || '',
    roleType: item.roleType || '학습지원단',
    availability: (item.availability?.length ? item.availability : [{ day: item.day || '월', start: item.start || item.time || '14:00', end: item.end || '15:40' }]).map((s, i) => normalizeSlot(s, i + 1)),
    maxDailySessions: Number(item.maxDailySessions || 4),
    note: item.note || '',
    createdAt: item.createdAt || new Date().toISOString()
  }));

  next.students = (raw?.students || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    gender: item.gender || '',
    school: item.school || '',
    schoolLevel: item.schoolLevel || '초등',
    grade: String(item.grade || ''),
    className: item.className || '',
    supportArea: item.supportArea || '학습지원',
    supportMode: item.supportMode || '학습코칭',
    targetType: item.targetType || '개인',
    preferences: (item.preferences?.length ? item.preferences : [{ day: item.day || '월', start: item.start || item.time || '14:00', end: item.end || '15:40', priority: 1 }]).map((s, i) => normalizeSlot(s, i + 1)),
    complaint: item.complaint || '',
    goal: item.goal || '',
    strategy: item.strategy || '',
    note: item.note || '',
    createdAt: item.createdAt || new Date().toISOString()
  }));

  next.matches = (raw?.matches || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    studentId: item.studentId || '',
    supporterId: item.supporterId || '',
    day: item.day || '월',
    start: item.start || '14:00',
    end: item.end || '15:40',
    school: item.school || '',
    serviceMode: item.serviceMode || '학습코칭',
    preferencePriority: Number(item.preferencePriority || 1),
    active: item.active !== false,
    createdAt: item.createdAt || new Date().toISOString()
  }));

  next.sessions = (raw?.sessions || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    matchId: item.matchId || '',
    date: item.date || '',
    school: item.school || '',
    start: item.start || '14:00',
    end: item.end || '15:40',
    minutes: Number(item.minutes || 0),
    subject: item.subject || '',
    targetName: item.targetName || '',
    topic: item.topic || '',
    feedback: item.feedback || '',
    confirmed: Boolean(item.confirmed),
    confirmedBy: item.confirmedBy || '',
    note: item.note || '',
    createdAt: item.createdAt || new Date().toISOString()
  }));

  next.trainings = (raw?.trainings || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    date: item.date || '',
    topic: item.topic || '',
    fee: Number(item.fee || 0),
    attendanceIds: item.attendanceIds || [],
    note: item.note || ''
  }));

  next.auditLogs = raw?.auditLogs || [];
  next.version = '10.3.0';
  return next;
}

export async function loadState() {
  const store = await getStore('readonly');
  const value = await new Promise((resolve, reject) => {
    const req = store.get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  state = normalizeState(value);
  return state;
}

export function getState() {
  return state;
}

export async function saveState(nextState, action = '') {
  const normalized = normalizeState(nextState);
  normalized.meta = { ...(normalized.meta || {}), updatedAt: new Date().toISOString() };
  if (action) {
    normalized.auditLogs = [
      ...(normalized.auditLogs || []),
      { id: crypto.randomUUID(), at: new Date().toISOString(), action }
    ].slice(-200);
  }
  state = normalized;
  const store = await getStore('readwrite');
  await new Promise((resolve, reject) => {
    const req = store.put(state, KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  listeners.forEach((listener) => listener(state));
  return state;
}

export async function patchState(patcher, action = '') {
  const current = getState();
  if (typeof patcher === 'function') {
    const draft = structuredClone(current);
    const patched = patcher(draft);
    return saveState(patched === undefined ? draft : patched, action);
  }
  return saveState({ ...current, ...patcher }, action);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetState() {
  return saveState(structuredClone(defaultState), 'reset');
}
