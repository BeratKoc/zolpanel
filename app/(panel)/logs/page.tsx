'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Spinner, useToast } from '@/components/ui';

const LEVEL_COLORS: Record<string, string> = {
  info: 'var(--text-secondary)',
  warn: 'var(--yellow)',
  error: 'var(--red)',
  success: 'var(--green)',
};

export default function Logs() {
  const t = useTranslations();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState<any[]>([]);
  const [filter, setFilter] = useState({ domain: 'all', level: 'all' });
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { show, ToastContainer } = useToast();

  async function loadDomains() {
    try {
      const data = await api.getDomains();
      setDomains(data);
    } catch (e) {}
  }

  async function load() {
    try {
      const params: Record<string, string> = {};
      if (filter.domain !== 'all') params.domain = filter.domain;
      if (filter.level !== 'all') params.level = filter.level;
      params.limit = '300';
      const data = await api.getLogs(params);
      setLogs(data);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDomains(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  async function handleClear() {
    if (!window.confirm(t('logs.confirmClear'))) return;
    try {
      await api.clearLogs(filter.domain !== 'all' ? filter.domain : undefined);
      show(t('logs.cleared'), 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  function formatTime(ts: string | number) {
    const d = new Date(ts);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDate(ts: string | number) {
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
          {t('logs.records', { n: logs.length })}
        </span>

        <select
          value={filter.domain}
          onChange={e => setFilter(f => ({ ...f, domain: e.target.value }))}
          style={{ width: 'auto' }}
        >
          <option value="all">{t('logs.allDomains')}</option>
          <option value="system">{t('logs.system')}</option>
          {domains.map(d => (
            <option key={d._id} value={d.domain}>{d.domain}</option>
          ))}
        </select>

        <select
          value={filter.level}
          onChange={e => setFilter(f => ({ ...f, level: e.target.value }))}
          style={{ width: 'auto' }}
        >
          <option value="all">{t('logs.allLevels')}</option>
          <option value="info">{t('logs.levelInfo')}</option>
          <option value="warn">{t('logs.levelWarn')}</option>
          <option value="error">{t('logs.levelError')}</option>
          <option value="success">{t('logs.levelSuccess')}</option>
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
            {t('logs.autoScroll')}
          </label>
          <Btn variant="ghost" size="sm" onClick={load}>↻</Btn>
          <Btn variant="danger" size="sm" onClick={handleClear}>{t('logs.clear')}</Btn>
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
            {t('logs.noLogs')}
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
