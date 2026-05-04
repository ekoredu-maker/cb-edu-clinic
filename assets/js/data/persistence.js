
import { notify } from '../core/store.js';
const getApp = () => window.ClinicApp;

export async function upsert(store, record){
  await getApp().save(store, record);
  notify('persist:upsert', { store, id: record?.id ?? null });
}

export async function remove(store, id){
  await getApp().removeItem(store, id);
  notify('persist:remove', { store, id });
}

export async function persistAll(){
  await getApp().saveAll();
  notify('persist:all', {});
}

export async function reloadAll(){
  await getApp().loadData();
  getApp().buildIndex(true);
  notify('persist:reload', {});
}
