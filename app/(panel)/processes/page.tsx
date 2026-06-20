'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Badge, StatusDot, Modal, FormField, Spinner, EmptyState, useToast } from '@/components/ui';

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}

function formatUptime(ms?: number): string {
  if (!ms) return '-';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 86400) + 'd';
}

export default function Processes() {
  const t = useTranslations();
  const [data, setData] = useState<{ available: boolean; processes: any[] }>({ available: false, processes: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const res = await api.getProcesses();
      setData(res);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(name: string, action: string) {
    setActionLoading(name + action);
    try {
      if (action === 'stop') await api.stopProcess(name);
      else if (action === 'restart') await api.restartProcess(name);
      else if (action === 'delete') {
        if (!window.confirm(t('processes.confirmDelete', { name }))) return;
        await api.deleteProcess(name);
      }
      show(t('processes.actionSuccess', { name, action }), 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor: Record<string, any> = {
    online: 'green', stopped: 'red', errored: 'red',
    stopping: 'yellow', launching: 'yellow',
  };

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 500 }}>{t('processes.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {!data.available ? t('processes.pm2NotFound') : t('processes.processCount', { n: data.processes.length })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Btn variant="default" onClick={load}>↻ {t('processes.refresh')}</Btn>
          {data.available && (
            <Btn variant="primary" onClick={() => setShowStart(true)}>{t('processes.startProcess')}</Btn>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : !data.available ? (
        <EmptyState
          icon="⚙️"
          title={t('processes.pm2NotInstalled')}
          subtitle={t('processes.pm2InstallHint', { cmd: 'npm install -g pm2' })}
        />
      ) : data.processes.length === 0 ? (
        <EmptyState
          icon="⚡"
          title={t('processes.noProcesses')}
          subtitle={t('processes.noProcessesSubtitle')}
          action={<Btn variant="primary" onClick={() => setShowStart(true)}>{t('processes.startProcess')}</Btn>}
        />
      ) : (
        <div>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '7px 1fr 80px 80px 70px 70px 80px 120px',
            gap: '12px',
            padding: '6px 16px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
          }}>
            <span></span>
            <span>{t('processes.colName')}</span>
            <span>{t('processes.colStatus')}</span>
            <span>CPU</span>
            <span>RAM</span>
            <span>Restart</span>
            <span>Uptime</span>
            <span style={{ textAlign: 'right' }}>{t('processes.colAction')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.processes.map(p => (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 16px',
                  display: 'grid',
                  gridTemplateColumns: '7px 1fr 80px 80px 70px 70px 80px 120px',
                  gap: '12px',
                  alignItems: 'center',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <StatusDot status={p.status === 'online' ? 'active' : 'offline'} />

                <div>
                  <span style={{ fontSize: '13px', fontWeight: 400 }}>{p.name}</span>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
                    pid {p.pid || '-'}
                  </p>
                </div>

                <Badge color={statusColor[p.status] || 'default'}>{p.status}</Badge>

                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  color: p.cpu > 50 ? 'var(--yellow)' : 'var(--text-secondary)',
                }}>
                  {p.cpu}%
                </span>

                <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {formatBytes(p.memory)}
                </span>

                <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: p.restarts > 5 ? 'var(--red)' : 'var(--text-secondary)' }}>
                  {p.restarts}
                </span>

                <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {formatUptime(p.uptime)}
                </span>

                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <ProcBtn
                    onClick={() => setShowLogs(p.name)}
                    title={t('processes.logs')}
                    loading={actionLoading === p.name + 'logs'}
                  >📋</ProcBtn>

                  {p.status === 'online' ? (
                    <ProcBtn
                      onClick={() => handleAction(p.name, 'stop')}
                      title={t('processes.stop')}
                      loading={actionLoading === p.name + 'stop'}
                    >⏸</ProcBtn>
                  ) : (
                    <ProcBtn
                      onClick={() => handleAction(p.name, 'restart')}
                      title={t('processes.start')}
                      loading={actionLoading === p.name + 'restart'}
                    >▶</ProcBtn>
                  )}

                  <ProcBtn
                    onClick={() => handleAction(p.name, 'restart')}
                    title={t('processes.restart')}
                    loading={actionLoading === p.name + 'restart'}
                  >↺</ProcBtn>

                  <ProcBtn
                    onClick={() => handleAction(p.name, 'delete')}
                    title={t('common.delete')}
                    danger
                    loading={actionLoading === p.name + 'delete'}
                  >🗑</ProcBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showLogs && (
        <LogModal name={showLogs} onClose={() => setShowLogs(null)} />
      )}

      {showStart && (
        <StartProcessModal
          onClose={() => setShowStart(false)}
          onSuccess={() => { setShowStart(false); load(); show(t('processes.started'), 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}

function ProcBtn({ children, onClick, title, danger, loading }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={loading}
      style={{
        width: '26px', height: '26px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        fontSize: '12px',
        color: danger ? 'var(--red)' : 'var(--text-secondary)',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {loading ? <Spinner size={10} /> : children}
    </button>
  );
}

function LogModal({ name, onClose }: { name: string; onClose: () => void }) {
  const t = useTranslations();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getProcessLogs(name, lines);
      setLogs(data.logs || t('processes.logNotFound'));
    } catch (e: any) {
      setLogs(t('processes.logFetchFailed') + ' ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lines]);

  return (
    <Modal title={t('processes.logsTitle', { name })} onClose={onClose} width={720}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('processes.last')}</span>
        {[50, 100, 200].map(n => (
          <Btn
            key={n}
            size="sm"
            variant={lines === n ? 'primary' : 'default'}
            onClick={() => setLines(n)}
          >
            {t('processes.lines', { n })}
          </Btn>
        ))}
        <Btn size="sm" variant="ghost" onClick={load}>↻</Btn>
      </div>

      <div style={{
        background: 'var(--bg-base)',
        borderRadius: 'var(--radius)',
        padding: '12px',
        height: '360px',
        overflow: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <Spinner />
          </div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{logs}</pre>
        )}
      </div>
    </Modal>
  );
}

function StartProcessModal({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [form, setForm] = useState({ name: '', script: '', cwd: '/var/www' });
  const [submitting, setSubmitting] = useState(false);

  function update(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.startProcess(form);
      onSuccess();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('processes.startProcessTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label={t('processes.processName')}>
          <input placeholder="myapp" value={form.name} onChange={e => update('name', e.target.value)} required autoFocus />
        </FormField>
        <FormField label={t('processes.scriptPath')} hint={t('processes.scriptPathHint')}>
          <input placeholder="server.js" value={form.script} onChange={e => update('script', e.target.value)} required />
        </FormField>
        <FormField label={t('processes.workingDir')}>
          <input placeholder="/var/www/myapp" value={form.cwd} onChange={e => update('cwd', e.target.value)} />
        </FormField>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : t('processes.start')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
