import { bootStoreDevtools, subscribe, withFreshIndexes } from './core/store.js';
import { installStatisticsOverrides } from './domain/statistics.js';
import { installVerificationOverrides } from './domain/verification.js';
import { PythonBridge } from './hybrid/python-bridge.js';

bootStoreDevtools();
installStatisticsOverrides();
installVerificationOverrides();

subscribe(({ event }) => {
  if (event.startsWith('persist:')) console.debug('[V13 store event]', event);
});

window.addEventListener('load', async () => {
  try { withFreshIndexes(true); } catch (e) { console.error(e); }

  let hybridLabel = 'PWA';
  if (PythonBridge.isAvailable()) {
    try {
      const health = await PythonBridge.health();
      if (health?.ok) hybridLabel = 'Hybrid/Python';
    } catch (e) {
      console.warn('[V13] Python engine connection failed:', e);
      hybridLabel = 'Hybrid/Offline';
    }
  }

  const badge = document.getElementById('hdr-sub');
  if (badge) {
    badge.textContent = `V13.0 Alpha · ${hybridLabel}`;
  }
  document.title = '학습클리닉 통합관리 V13.0 Alpha';
});
