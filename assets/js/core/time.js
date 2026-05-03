export const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toMinutes(value) {
  if (!value) return 0;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function fromMinutes(value) {
  const total = Math.max(0, Number(value) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function normalizeTime(value, fallback = '14:00') {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{1}:\d{2}$/.test(raw)) return `0${raw}`;
  const korean = raw.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분?)?/);
  if (korean) return `${String(korean[1]).padStart(2, '0')}:${String(korean[2] || '00').padStart(2, '0')}`;
  return fallback;
}

export function durationMinutes(start, end) {
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(toMinutes(aStart), toMinutes(bStart));
  const end = Math.min(toMinutes(aEnd), toMinutes(bEnd));
  return Math.max(0, end - start);
}

export function weekdayKo(dateText) {
  if (!dateText) return '';
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return KO_DAYS[d.getDay()];
}

export function monthDays(ym) {
  const [year, month] = String(ym || '').split('-').map(Number);
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export function ymOfToday() {
  return new Date().toISOString().slice(0, 7);
}

export function ymdOfToday() {
  return new Date().toISOString().slice(0, 10);
}

export function formatWon(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;
}

export function safeDateLabel(dateText) {
  if (!dateText) return '';
  return String(dateText).replace(/^\d{4}-/, '').replace('-', '.');
}

export function parseSlotLines(text, defaultPriority = 1) {
  const lines = String(text || '').split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const priorityMatch = line.match(/([12])\s*(?:순위|희망)?/);
    const dayMatch = line.match(/[월화수목금토일]/);
    const rangeMatch = line.match(/(\d{1,2}:\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?)\s*(?:~|-|부터|–)\s*(\d{1,2}:\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?)/);
    const singleMatch = line.match(/(\d{1,2}:\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분?)?)/);
    const start = normalizeTime(rangeMatch?.[1] || singleMatch?.[1] || '14:00');
    const end = normalizeTime(rangeMatch?.[2] || fromMinutes(toMinutes(start) + 100), fromMinutes(toMinutes(start) + 100));
    return {
      day: dayMatch?.[0] || '월',
      start,
      end,
      priority: Number(priorityMatch?.[1] || defaultPriority || index + 1)
    };
  });
}

export function formatSlotLines(slots = []) {
  return (slots || []).map((slot) => {
    const prefix = slot.priority ? `${slot.priority}순위 ` : '';
    return `${prefix}${slot.day || '월'} ${slot.start || '14:00'}~${slot.end || '15:40'}`;
  }).join('\n');
}
