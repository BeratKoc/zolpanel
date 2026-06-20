const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'İstek başarısız');
  }
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  verify: () => request('GET', '/auth/verify'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/auth/change-password', { currentPassword, newPassword }),

  // Domains
  getDomains: () => request('GET', '/domains'),
  getDomain: (id) => request('GET', `/domains/${id}`),
  createDomain: (data) => request('POST', '/domains', data),
  updateDomain: (id, data) => request('PUT', `/domains/${id}`, data),
  deleteDomain: (id) => request('DELETE', `/domains/${id}`),
  getNextPort: () => request('GET', '/domains/utils/next-port'),

  // Processes
  getProcesses: () => request('GET', '/processes'),
  startProcess: (data) => request('POST', '/processes/start', data),
  stopProcess: (name) => request('POST', `/processes/${name}/stop`),
  restartProcess: (name) => request('POST', `/processes/${name}/restart`),
  deleteProcess: (name) => request('DELETE', `/processes/${name}`),
  getProcessLogs: (name, lines) => request('GET', `/processes/${name}/logs?lines=${lines || 100}`),

  // System
  getMetrics: () => request('GET', '/system/metrics'),
  getStats: () => request('GET', '/system/stats'),
  getLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/system/logs${qs ? '?' + qs : ''}`);
  },
  clearLogs: (domain) => request('DELETE', `/system/logs${domain ? '?domain=' + domain : ''}`),
  reloadCaddy: () => request('POST', '/system/caddy/reload'),
  getCaddyConfig: () => request('GET', '/system/caddy/config'),
  getMemoryStats: (hours = 1) => request('GET', `/system/memory-stats?hours=${hours}`),
  getServices: () => request('GET', '/system/services'),
};
