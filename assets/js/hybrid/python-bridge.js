const PythonBridge = (() => {
  const DEFAULT_BASE = 'http://127.0.0.1:8765';
  let baseUrl = DEFAULT_BASE;

  async function request(path, options = {}) {
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
    baseUrl = String(url || DEFAULT_BASE).replace(/\/$/, '');
  }

  return { health, statistics, verification, setBaseUrl };
})();

window.PythonBridge = PythonBridge;
