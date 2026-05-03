import { el, table, formField, toast, optionList, chip } from '../core/engine.js';
import { getState, patchState } from '../core/state.js';
import { ymdOfToday, formatWon } from '../core/time.js';

export function renderTrainingView() {
  const state = getState();
  const date = el('input', { type: 'date', value: ymdOfToday() });
  const topic = el('input', { value: '', placeholder: '연수 주제' });
  const fee = el('input', { type: 'number', value: 20000 });
  const attendance = el('select', { multiple: true, size: Math.min(8, Math.max(3, state.supporters.length || 3)) });
  state.supporters.forEach((s) => attendance.appendChild(el('option', { value: s.id, text: s.name })));
  const note = el('textarea', { value: '', placeholder: '장소, 강사, 비고 등' });

  async function addTraining() {
    if (!date.value || !topic.value.trim()) return toast('연수 일자와 주제를 입력해 주세요.', 'error');
    const attendanceIds = [...attendance.selectedOptions].map((opt) => opt.value);
    await patchState((draft) => {
      draft.trainings.push({
        id: crypto.randomUUID(),
        date: date.value,
        topic: topic.value.trim(),
        fee: Number(fee.value || 0),
        attendanceIds,
        note: note.value.trim()
      });
      return draft;
    }, 'create-training');
    topic.value = '';
    note.value = '';
    toast('연수를 등록했습니다.', 'success');
  }

  const rows = state.trainings.map((t) => [
    t.date,
    t.topic,
    formatWon(t.fee),
    `${t.attendanceIds?.length || 0}명`,
    (t.attendanceIds || []).map((id) => state.supporters.find((s) => s.id === id)?.name).filter(Boolean).join(', ') || '-'
  ]);

  return el('div', { className: 'panel-grid' },
    el('section', { className: 'card stack' },
      el('h2', { text: '연수 등록' }),
      el('div', { className: 'form-grid' },
        formField('일자', date),
        formField('여비/수당', fee),
        el('div', { className: 'full-span' }, formField('주제', topic)),
        el('div', { className: 'full-span' }, formField('참석자', attendance)),
        el('div', { className: 'full-span' }, formField('비고', note))
      ),
      el('button', { className: 'btn', onClick: addTraining }, '연수 저장')
    ),
    el('section', { className: 'card stack' },
      el('h2', { text: `연수 목록 (${state.trainings.length})` }),
      table(['일자', '주제', '여비', '참석', '참석자'], rows)
    )
  );
}
