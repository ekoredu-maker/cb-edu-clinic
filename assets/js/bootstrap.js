import { bootStoreDevtools, subscribe, withFreshIndexes } from './core/store.js';
import { installStatisticsOverrides } from './domain/statistics.js';
import { installVerificationOverrides } from './domain/verification.js';
import { PythonBridge } from './hybrid/python-bridge.js';
import { installRegressionTools, runHybridRegression } from './hybrid/regression.js';
import { installDocumentExports } from './hybrid/document-export.js';
import { installStorageMigrationControls } from './hybrid/storage-migration.js';
import { installDualWrite, installDualWriteTools, compareDualWrite } from './hybrid/dual-write.js';
import { installAuthoritativeEngine } from './hybrid/authoritative-engine.js';
import { installReadSourceTools, chooseReadSource } from './hybrid/read-source.js';

bootStoreDevtools();
installStatisticsOverrides();
installVerificationOverrides();
installRegressionTools();
installDocumentExports();
installStorageMigrationControls();
installDualWriteTools();
installReadSourceTools();

subscribe(({ event }) => {
  if (event.startsWith('persist:')) console.debug('[V13 store event]', event);
});

function setHeader(parts){
  const badge = document.getElementById('hdr-sub');
  if (badge) badge.textContent = parts.filter(Boolean).join('');
}

window.addEventListener('load', async () => {
  try { withFreshIndexes(true); } catch (e) { console.error(e); }

  let hybridLabel = 'PWA';
  let regressionLabel = '';
  let templateLabel = '';
  let storageLabel = '';
  let syncLabel = '';
  let sourceLabel = '';
  let dataLabel = ' · 데이터원본 Browser';

  if (PythonBridge.isAvailable()) {
    try {
      const health = await PythonBridge.health();
      if (health?.ok) {
        hybridLabel = 'Hybrid/Python';
        const readyTemplates = Object.values(health.templates || {}).filter(Boolean).length;
        const totalTemplates = Object.keys(health.templates || {}).length;
        if (totalTemplates) templateLabel = ` · HWPX ${readyTemplates}/${totalTemplates}`;
        const stored = health.storage?.totalRecords || 0;
        storageLabel = ` · SQLite ${stored}건`;
        window.__V13_STORAGE_STATUS__ = health.storage || null;

        const readSource = await chooseReadSource();
        if (readSource.source === 'sqlite') dataLabel = ' · 데이터원본 SQLite';
        else if (readSource.source === 'browser-fallback') dataLabel = ' · 데이터원본 Browser(복구모드)';
        else dataLabel = ' · 데이터원본 Browser';

        if (health.storage?.lastMigration) {
          installDualWrite();
          const parity = await compareDualWrite();
          syncLabel = parity.ok ? ' · DB동기화 PASS' : ' · DB동기화 확인필요';
        } else {
          syncLabel = ' · DB이관 필요';
        }

        const ym = document.getElementById('ver-month')?.value || '';
        const regression = await runHybridRegression({ ym });
        regressionLabel = regression.ok === true ? ' · 검증 PASS' : regression.ok === false ? ' · 검증 DIFF' : '';

        if (regression.ok === true) {
          await installAuthoritativeEngine();
          sourceLabel = ' · 계산원본 Python';
        } else {
          sourceLabel = ' · 계산원본 JS(보호모드)';
        }
      }
    } catch (e) {
      console.warn('[V13] Python engine connection/regression failed:', e);
      hybridLabel = 'Hybrid/Offline';
      sourceLabel = ' · 계산원본 JS';
      dataLabel = ' · 데이터원본 Browser(복구모드)';
    }
  }

  setHeader([`V13.0 Alpha · ${hybridLabel}`, regressionLabel, sourceLabel, dataLabel, templateLabel, storageLabel, syncLabel]);
  document.title = '학습클리닉 통합관리 V13.0 Alpha';

  window.addEventListener('v13:dual-write-status', (event) => {
    const s = event.detail || {};
    if (!s.enabled) return;
    const current = document.getElementById('hdr-sub')?.textContent || '';
    const cleaned = current.replace(/ · DB동기화 (PASS|확인필요|저장중)/g, '').replace(/ · DB동기화 확인필요/g, '');
    const label = s.pending > 0 ? ' · DB동기화 저장중' : (s.healthy ? ' · DB동기화 PASS' : ' · DB동기화 확인필요');
    const badge = document.getElementById('hdr-sub');
    if (badge) badge.textContent = cleaned + label;
  });

  window.addEventListener('v13:read-source-status', (event) => {
    const s = event.detail || {};
    const current = document.getElementById('hdr-sub')?.textContent || '';
    const cleaned = current.replace(/ · 데이터원본 (SQLite|Browser|Browser\(복구모드\))/g, '');
    const label = s.source === 'sqlite' ? ' · 데이터원본 SQLite' : (s.source === 'browser-fallback' ? ' · 데이터원본 Browser(복구모드)' : ' · 데이터원본 Browser');
    const badge = document.getElementById('hdr-sub');
    if (badge) badge.textContent = cleaned + label;
  });
});
