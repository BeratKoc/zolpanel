import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { Btn, Spinner, Badge, useToast } from '../components/ui';

const LEVEL_COLORS = {
  info: 'var(--text-secondary)',
  warn: 'var(--yellow)',
  error: 'var(--red)',
  success: 'var(--green)',
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState([]);
  const [filter, setFilter] = useState({ domain: 'all', level: 'all' });
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef(null);
  const { show, ToastContainer } = useToast();

  async function loadDomains() {
    try {
      const data = await api.getDomains();
      setDomains(data);
    } catch (e) {}
  }

  async function load() {
    try {
      const params = {};
      if (filter.domain !== 'all') params.domain = filter.domain;
      if (filter.level !== 'all') params.level = filter.level;
      params.limit = 300;
      const data = await api.getLogs(params);
      setLogs(data);
    } catch (e) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDomains(); }, []);
  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  async function handleClear() {
    if (!window.confirm('Logları temizle?')) return;
    try {
      await api.clearLogs(filter.domain !== 'all' ? filter.domain : null);
      show('Loglar temizlendi', 'success');
      load();
    } catch (e) {
      show(e.message, 'error');
    }
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      {/* Toolbar */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginRight: '4px' }}>
          {logs.length} kayıt
        </span>

        <select
          value={filter.domain}
          onChange={e => setFilter(f => ({ ...f, domain: e.target.value }))}
          style={{ width: 'auto' }}
        >
          <option value="all">Tüm domainler</option>
          <option value="system">System</option>
          {domains.map(d => (
            <option key={d._id} value={d.domain}>{d.domain}</option>
          ))}
        </select>

        <select
          value={filter.level}
          onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
          style={{ width: 'auto' }}
        >
          <option value="all">Tüm seviyeler</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="success">Success</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              style={{ width: 'auto', accentColor: 'var(--accent)' }}
            />
            Otomatik scroll
          </label>
          <Btn variant="ghost" size="sm" onClick={load}>↻</Btn>
          <Btn variant="danger" size="sm" onClick={handleClear}>Temizle</Btn>
        </div>
      </div>

      {/* Log listesi */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 24px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <Spinner size={24} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            Log bulunamadı
          </div>
        ) : (
          logs.slice().reverse().map((log, i) => (
            <div
              key={log._id || i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '4px 0',
                borderBottom: '1px solid rgba(255,255,255,0.02)',
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '11px', paddingTop: '1px' }}>
                {formatDate(log.timestamp)} {formatTime(log.timestamp)}
              </span>

              <span style={{
                flexShrink: 0,
                width: '50px',
                textAlign: 'right',
                color: LEVEL_COLORS[log.level] || 'var(--text-muted)',
                fontSize: '11px',
                paddingTop: '1px',
              }}>
                {log.level?.toUpperCase()}
              </span>

              <span style={{
                flexShrink: 0,
                width: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--accent)',
                fontSize: '11px',
                paddingTop: '1px',
              }}>
                {log.domain}
              </span>

              <span style={{
                flex: 1,
                color: log.level === 'error' ? 'var(--red)' : log.level === 'warn' ? 'var(--yellow)' : 'var(--text-secondary)',
                wordBreak: 'break-all',
              }}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
