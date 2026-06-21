'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Rocket, RotateCw, ScrollText, Trash2 } from 'lucide-react';
import { Badge, StatusDot, Spinner, Modal } from '@/components/ui';
import { api } from '@/lib/api-client';

interface AppRow {
  _id: string;
  name: string;
  repoUrl: string;
  branch: string;
  domain?: string;
  hostPort?: number;
  status: string;
  state?: string;
}

function statusBadgeColor(status: string): 'green' | 'red' | 'yellow' | 'default' {
  if (status === 'running') return 'green';
  if (status === 'error') return 'red';
  if (status === 'deploying') return 'yellow';
  return 'default';
}

function statusDotStatus(status: string): string {
  if (status === 'running') return 'active';
  if (status === 'error') return 'offline';
  return 'pending';
}

export function AppCard({
  app,
  onRefresh,
  onError,
}: {
  app: AppRow;
  onRefresh: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  const busy = deploying || deleting;

  function statusLabel(status: string): string {
    switch (status) {
      case 'running': return t('apps.statusRunning');
      case 'error': return t('apps.statusError');
      case 'deploying': return t('apps.statusDeploying');
      case 'new': return t('apps.statusNew');
      case 'stopped': return t('apps.statusStopped');
      default: return status;
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    try {
      await api.deployApp(app._id);
      onRefresh();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setDeploying(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('apps.confirmDelete', { name: app.name }))) return;
    setDeleting(true);
    try {
      await api.deleteApp(app._id);
      onRefresh();
    } catch (e: any) {
      onError(e.message);
      setDeleting(false);
    }
  }

  async function handleLogs() {
    setLogsOpen(true);
    setLogsContent('');
    setLogsLoading(true);
    try {
      const res = await api.getAppLogs(app._id);
      setLogsContent(res.logs || '');
    } catch (e: any) {
      setLogsContent(e.message);
    } finally {
      setLogsLoading(false);
    }
  }

  const isDeployed = app.status === 'running';

  return (
    <>
      <div
        className="domain-card"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <StatusDot status={statusDotStatus(app.status)} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>{app.name}</div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {app.repoUrl}
          </div>
          {(app.domain || app.hostPort) && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              {app.domain && <span>{app.domain}</span>}
              {app.hostPort && <span style={{ fontFamily: 'var(--font-mono)' }}>{app.domain ? '' : ''}:{app.hostPort}</span>}
            </div>
          )}
        </div>

        <Badge color={statusBadgeColor(app.status)}>
          {statusLabel(app.status)}
        </Badge>

        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <IconBtn
            onClick={handleDeploy}
            title={isDeployed ? t('apps.redeploy') : t('apps.deploy')}
            disabled={busy}
          >
            {deploying ? (
              <Spinner size={12} />
            ) : isDeployed ? (
              <RotateCw size={14} strokeWidth={1.75} />
            ) : (
              <Rocket size={14} strokeWidth={1.75} />
            )}
          </IconBtn>

          <IconBtn
            onClick={handleLogs}
            title={t('apps.viewLogs')}
            disabled={false}
          >
            <ScrollText size={14} strokeWidth={1.75} />
          </IconBtn>

          <IconBtn
            onClick={handleDelete}
            title={t('apps.delete')}
            disabled={busy}
            danger
          >
            {deleting ? <Spinner size={12} /> : <Trash2 size={14} strokeWidth={1.75} />}
          </IconBtn>
        </div>
      </div>

      {logsOpen && (
        <Modal
          title={t('apps.viewLogs') + ' — ' + app.name}
          onClose={() => setLogsOpen(false)}
          width={700}
        >
          {logsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Spinner size={20} />
            </div>
          ) : (
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
              maxHeight: '60vh',
              overflowY: 'auto',
            }}>
              {logsContent || '(empty)'}
            </pre>
          )}
        </Modal>
      )}
    </>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        width: '30px',
        height: '30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: '13px',
        color: danger ? 'var(--red)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}
