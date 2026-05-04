
const listeners = new Set();
const getApp = () => window.ClinicApp;

export function getState(){
  return getApp().state;
}

export function getIndexes(){
  return getApp().indexes;
}

export function subscribe(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(event='change', payload={}){
  for (const fn of [...listeners]) {
    try { fn({ event, payload, state: getState(), indexes: getIndexes() }); } catch (e) { console.error(e); }
  }
}

export async function patchState(mutator, options={ persist:false, forceReindex:false, event:'change' }){
  const state = getState();
  const result = mutator(state);
  if (options.persist) await getApp().saveAll();
  if (options.forceReindex) getApp().buildIndex(true);
  notify(options.event, { result });
  return state;
}

export function withFreshIndexes(force=false){
  return getApp().buildIndex(force);
}

export function bootStoreDevtools(){
  window.ClinicStore = { getState, getIndexes, patchState, subscribe, notify, withFreshIndexes };
}
