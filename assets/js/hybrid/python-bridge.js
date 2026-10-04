const PythonBridge = (() => {
  const params = new URLSearchParams(window.location.search);
  let baseUrl = params.get('api') || window.__PYTHON_API_BASE__ || '';

  function isAvailable() {
    return Boolean(baseUrl);
  }

  async function request(path, options = {}) {
    if (!baseUrl) throw new Error('Python engine is not connected.');
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) {
      let detail = `Python engine error: ${response.status}`;
      try {
        const body = await response.json();
        if (body?.detail) detail = body.detail;
      } catch (_) {}
      throw new Error(detail);
    }
    return response.json();
  }

  async function requestBlob(path, payload, method='POST') {
    if (!baseUrl) throw new Error('Python engine is not connected.');
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(payload || {}),
    });
    if (!response.ok) {
      let detail = `Python engine error: ${response.status}`;
      try {
        const body = await response.json();
        if (body?.detail) detail = body.detail;
      } catch (_) {}
      throw new Error(detail);
    }
    const disposition = response.headers.get('content-disposition') || '';
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const filename = encoded ? decodeURIComponent(encoded) : (plain || 'output.bin');
    return { blob: await response.blob(), filename };
  }

  async function post(path, body) {
    return request(path, { method:'POST', body:JSON.stringify(body || {}) });
  }

  async function health() { return request('/api/health'); }
  async function statistics(payload) { return post('/api/statistics', payload); }
  async function verification(payload) { return post('/api/verification', payload); }
  async function settlement(payload) { return post('/api/settlement', payload); }
  async function storageStatus() { return request('/api/storage/status'); }
  async function storageImport(state, options={}) {
    return post('/api/storage/import', { state, source: options.source || 'browser-state', replace: options.replace !== false });
  }
  async function storageExport() { return request('/api/storage/export'); }
  async function storageUpsert(entityType, record, source='dual-write') {
    return post('/api/storage/upsert', { entityType, record, source });
  }
  async function storageDelete(entityType, id, source='dual-write') {
    return post('/api/storage/delete', { entityType, id, source });
  }
  async function storageSingleton(key, value, source='dual-write') {
    return post('/api/storage/singleton', { key, value, source });
  }
  async function storageCompare(state) {
    return post('/api/storage/compare', { state });
  }
  async function exportFile(path, payload) { return requestBlob(path, payload, 'POST'); }
  async function downloadStorageBackup() { return requestBlob('/api/storage/backup.json', null, 'GET'); }

  function setBaseUrl(url) {
    baseUrl = String(url || '').replace(/\/$/, '');
  }

  return {
    isAvailable, health, statistics, verification, settlement,
    storageStatus, storageImport, storageExport, storageUpsert, storageDelete,
    storageSingleton, storageCompare, downloadStorageBackup,
    exportFile, setBaseUrl
  };
})();

window.PythonBridge = PythonBridge;
export { PythonBridge };
