import { bootStoreDevtools, subscribe, withFreshIndexes } from './core/store.js';
import { installStatisticsOverrides } from './domain/statistics.js';
import { installVerificationOverrides } from './domain/verification.js';
import { PythonBridge } from './hybrid/python-bridge.js';
import { installRegressionTools, runHybridRegression } from './hybrid/regression.js';
import { installDocumentExports } from './hybrid/document-export.js';

bootStoreDevtools();
installStatisticsOverrides();
installVerificationOverrides();
installRegressionTools();
installDocumentExports();

subscribe(({ event }) => {
  if (event.startsWith('persist:')) console.debug('[V13 store event]', event);
});

window.addEventListener('load', async () => {
  try { withFreshIndexes(true); } catch (e) { console.error(e); }

  let hybridLabel = 'PWA';
  let regressionLabel = '';
  let templateLabel = '';
  if (PythonBridge.isAvailable()) {
    try {
      const health = await PythonBridge.health();
      if (health?.ok) {
        hybridLabel = 'Hybrid/Python';
        const readyTemplates = Object.values(health.templates || {}).filter(Boolean).length;
        const totalTemplates = Object.keys(health.templates || {}).length;
        if (totalTemplates) templateLabel = ` · HWPX ${readyTemplates}/${totalTemplates}`;
        const ym = document.getElementById('ver-month')?.value || '';
        const regression = await runHybridRegression({ ym });
        regressionLabel = regression.ok === true ? ' · 검증 PASS' : regression.ok === false ? ' · 검증 DIFF' : '';
      }
    } catch (e) {
      console.warn('[V13] Python engine connection/regression failed:', e);
      hybridLabel = 'Hybrid/Offline';
    }
  }

  const badge = document.getElementById('hdr-sub');
  if (badge) badge.textContent = `V13.0 Alpha · ${hybridLabel}${regressionLabel}${templateLabel}`;
  document.title = '학습클리닉 통합관리 V13.0 Alpha';
});
