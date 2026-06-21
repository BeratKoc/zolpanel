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
  getDatabases: () => request('GET', '/databases'),
  createDatabase: (b: unknown) => request('POST', '/databases', b),
  getDatabase: (id: string) => request('GET', `/databases/${id}`),
  deleteDatabase: (id: string, withVolume?: boolean) => request('DELETE', `/databases/${id}${withVolume ? '?volume=1' : ''}`),
  getBackups: () => request('GET', '/backups'),
  createBackup: () => request('POST', '/backups'),
  deleteBackup: (n: string) => request('DELETE', `/backups/${encodeURIComponent(n)}`),
  restoreBackup: (n: string) => request('POST', `/backups/${encodeURIComponent(n)}/restore`),
  backupDownloadUrl: (n: string) => `/api/backups/${encodeURIComponent(n)}/download`,
  getApps: () => request('GET', '/apps'),
  createApp: (b: unknown) => request('POST', '/apps', b),
  getApp: (id: string) => request('GET', `/apps/${id}`),
  deleteApp: (id: string) => request('DELETE', `/apps/${id}`),
  deployApp: (id: string) => request('POST', `/apps/${id}/deploy`),
  getAppLogs: (id: string, tail = 200) => request('GET', `/apps/${id}/logs?tail=${tail}`),
  // DB Explorer
  dbxConnections: () => request('GET', '/dbx/connections'),
  dbxTree: (ref: string, db?: string) =>
    request('GET', `/dbx/${encodeURIComponent(ref)}/tree${db ? '?db=' + encodeURIComponent(db) : ''}`),
  dbxRows: (ref: string, q: Record<string, string | number>) =>
    request('GET', `/dbx/${encodeURIComponent(ref)}/rows?${new URLSearchParams(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)]))).toString()}`),
  dbxSql: (ref: string, body: { db: string; sql: string }, opts: { write?: boolean; confirm?: boolean } = {}) => {
    const qs = [opts.write && 'write=1', opts.confirm && 'confirm=1'].filter(Boolean).join('&');
    return request('POST', `/dbx/${encodeURIComponent(ref)}/sql${qs ? '?' + qs : ''}`, body);
  },
  dbxRowInsert: (ref: string, body: unknown, write?: boolean) =>
    request('POST', `/dbx/${encodeURIComponent(ref)}/row${write ? '?write=1' : ''}`, body),
  dbxRowUpdate: (ref: string, body: unknown, write?: boolean) =>
    request('PATCH', `/dbx/${encodeURIComponent(ref)}/row${write ? '?write=1' : ''}`, body),
  dbxRowDelete: (ref: string, body: unknown, write?: boolean) =>
    request('DELETE', `/dbx/${encodeURIComponent(ref)}/row${write ? '?write=1' : ''}`, body),
  dbxRedisSet: (ref: string, body: { key: string; value: string }, write?: boolean) =>
    request('POST', `/dbx/${encodeURIComponent(ref)}/rows${write ? '?write=1' : ''}`, body),
  dbxRedisDel: (ref: string, body: { key: string }, write?: boolean) =>
    request('DELETE', `/dbx/${encodeURIComponent(ref)}/rows${write ? '?write=1' : ''}`, body),
};
