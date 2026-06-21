'use client';
const BASE = '/api';
function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('token') : null; }

async function request(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) {
    localStorage.removeItem('token');
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Oturum sona erdi');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

export const api = {
  login: (u: string, p: string) => request('POST', '/auth/login', { username: u, password: p }),
  verify: () => request('GET', '/auth/verify'),
  changePassword: (c: string, n: string) => request('POST', '/auth/change-password', { currentPassword: c, newPassword: n }),
  getDomains: () => request('GET', '/domains'),
  createDomain: (d: unknown) => request('POST', '/domains', d),
  updateDomain: (id: string, d: unknown) => request('PUT', `/domains/${id}`, d),
  deleteDomain: (id: string) => request('DELETE', `/domains/${id}`),
  recheckSsl: (id: string) => request('GET', `/domains/${id}/ssl`),
  getNextPort: () => request('GET', '/domains/utils/next-port'),
  getProcesses: () => request('GET', '/processes'),
  startProcess: (d: unknown) => request('POST', '/processes/start', d),
  stopProcess: (n: string) => request('POST', `/processes/${n}/stop`),
  restartProcess: (n: string) => request('POST', `/processes/${n}/restart`),
  deleteProcess: (n: string) => request('DELETE', `/processes/${n}`),
  getProcessLogs: (n: string, l?: number) => request('GET', `/processes/${n}/logs?lines=${l || 100}`),
  getMetrics: () => request('GET', '/system/metrics'),
  getStats: () => request('GET', '/system/stats'),
  getLogs: (p: Record<string, string> = {}) => request('GET', `/system/logs${Object.keys(p).length ? '?' + new URLSearchParams(p) : ''}`),
  clearLogs: (d?: string) => request('DELETE', `/system/logs${d ? '?domain=' + d : ''}`),
  getCaddyConfig: () => request('GET', '/system/caddy/config'),
  getMemoryStats: (hours = 1) => request('GET', `/system/memory-stats?hours=${hours}`),
  getServices: () => request('GET', '/system/services'),
  getContainers: () => request('GET', '/docker/containers'),
  startContainer: (id: string) => request('POST', `/docker/containers/${id}/start`),
  stopContainer: (id: string) => request('POST', `/docker/containers/${id}/stop`),
  restartContainer: (id: string) => request('POST', `/docker/containers/${id}/restart`),
  getContainerLogs: (id: string, tail = 200) => request('GET', `/docker/containers/${id}/logs?tail=${tail}`),
};
