
import { getState, withFreshIndexes } from '../core/store.js';

const app = () => window.ClinicApp;

export function getDatesForDayInMonthV12(ym, dayLabel){
  const DAY_IDX = {일:0, 월:1, 화:2, 수:3, 목:4, 금:5, 토:6};
  const target = DAY_IDX[dayLabel];
  if (target === undefined) return [];
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const result = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(y, m - 1, d).getDay() === target) result.push(`${ym}-${String(d).padStart(2, '0')}`);
  }
  return result;
}

export function installVerificationOverrides(){
  window.getDatesForDayInMonth = getDatesForDayInMonthV12;
  app().getDatesForDayInMonth = getDatesForDayInMonthV12;
  if (typeof window.loadVerify === 'function') {
    const originalLoadVerify = window.loadVerify;
    window.loadVerify = function(...args){
      withFreshIndexes(true);
      return originalLoadVerify.apply(this, args);
    };
  }
}
