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

  async function requestBlob(path, payload) {
    if (!baseUrl) throw new Error('Python engine is not connected.');
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  async function health() {
    return request('/api/health');
  }

  async function statistics(payload) {
    return request('/api/statistics', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function verification(payload) {
    return request('/api/verification', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function settlement(payload) {
    return request('/api/settlement', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function exportFile(path, payload) {
    return requestBlob(path, payload);
  }

  function setBaseUrl(url) {
    baseUrl = String(url || '').replace(/\/$/, '');
  }

  return { isAvailable, health, statistics, verification, settlement, exportFile, setBaseUrl };
})();

window.PythonBridge = PythonBridge;
export { PythonBridge };
