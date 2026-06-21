'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Database, Eye, Copy, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Badge, StatusDot, Spinner } from '@/components/ui';

interface DbRow {
  id: string;
  name: string;
  engine: string;
  state: string;
  hostPort?: number;
}

export function DatabaseCard({
  db,
  onDeleted,
  onError,
}: {
  db: DbRow;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [connectionString, setConnectionString] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const running = db.state === 'running';

  async function handleReveal() {
    setRevealing(true);
    try {
      const data = await api.getDatabase(db.id);
      setConnectionString(data.connectionString || '');
    } catch (err: any) {
      onError(err.message);
    } finally {
      setRevealing(false);
    }
  }

  async function handleCopy() {
    if (!connectionString) return;
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  async function handleDelete() {
    const displayName = db.name || db.id;
    if (!window.confirm(t('databases.confirmDelete', { name: displayName }))) return;
    const withVolume = window.confirm(t('databases.deleteWithVolume'));
    setDeleting(true);
    try {
      await api.deleteDatabase(db.id, withVolume);
      onDeleted();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const engineColor: Record<string, 'blue' | 'green' | 'red'> = {
    postgres: 'blue',
    mysql: 'green',
    redis: 'red',
  };

  return (
    <div
      className="domain-card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <StatusDot status={running ? 'active' : 'offline'} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>
            {db.name || db.id}
          </div>
          {db.hostPort && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              :{db.hostPort}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge color={engineColor[db.engine] ?? 'default'}>
            {db.engine}
          </Badge>
        </div>

        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <IconBtn
            onClick={handleReveal}
            title={t('databases.reveal')}
            aria-label={t('databases.reveal')}
            disabled={revealing || connectionString !== null}
          >
            {revealing ? <Spinner size={12} /> : <Eye size={14} strokeWidth={1.75} />}
          </IconBtn>
          <IconBtn
            onClick={handleDelete}
            title={t('databases.delete')}
            aria-label={t('databases.delete')}
            disabled={deleting}
            danger
          >
            {deleting ? <Spinner size={12} /> : <Trash2 size={14} strokeWidth={1.75} />}
          </IconBtn>
        </div>
      </div>

      {/* Connection string row */}
      {connectionString !== null && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '6px 10px',
        }}>
          <code style={{
            flex: 1,
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
            minWidth: 0,
          }}>
            {connectionString || '(empty)'}
          </code>
          <button
            onClick={handleCopy}
            title={t('databases.copy')}
            aria-label={t('databases.copy')}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '3px 8px',
              fontSize: '11px',
              color: copied ? 'var(--green)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Copy size={12} strokeWidth={1.75} />
            {copied ? t('databases.copied') : t('databases.copy')}
          </button>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  'aria-label': ariaLabel,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  'aria-label'?: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
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
