const PythonBridge = (() => {
  const params = new URLSearchParams(window.location.search);
  let baseUrl = params.get('api') || window.__PYTHON_API_BASE__ || '';

  function isAvailable() {
    return Boolean(baseUrl);
  }

  async function request(path, options = {}) {
    if (!baseUrl) {
      throw new Error('Python engine is not connected.');
    }
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) {
      throw new Error(`Python engine error: ${response.status}`);
    }
    return response.json();
  }

  async function health() {
    return request('/api/health');
  }

  async function statistics(payload) {
    return request('/api/statistics', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function verification(payload) {
    return request('/api/verification', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  function setBaseUrl(url) {
    baseUrl = String(url || '').replace(/\/$/, '');
  }

  return { isAvailable, health, statistics, verification, setBaseUrl };
})();

window.PythonBridge = PythonBridge;
