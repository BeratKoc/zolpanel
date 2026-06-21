'use client';

import { useTranslations } from 'next-intl';
import { Play, Square, RotateCw, ScrollText } from 'lucide-react';
import { Badge, StatusDot, Spinner } from '@/components/ui';

interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export function ContainerCard({
  container,
  onStart,
  onStop,
  onRestart,
  onLogs,
  busy,
}: {
  container: Container;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onLogs: () => void;
  busy: boolean;
}) {
  const t = useTranslations();
  const running = container.state === 'running';

  return (
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
      <StatusDot status={running ? 'active' : 'offline'} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>{container.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
          {container.image}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Badge color={running ? 'green' : 'default'}>
          {container.state}
        </Badge>
        {container.status && container.status !== container.state && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{container.status}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        {running ? (
          <>
            <IconBtn
              onClick={onStop}
              title={t('docker.stop')}
              aria-label={t('docker.stop')}
              disabled={busy}
            >
              {busy ? <Spinner size={12} /> : <Square size={14} strokeWidth={1.75} />}
            </IconBtn>
            <IconBtn
              onClick={onRestart}
              title={t('docker.restart')}
              aria-label={t('docker.restart')}
              disabled={busy}
            >
              <RotateCw size={14} strokeWidth={1.75} />
            </IconBtn>
          </>
        ) : (
          <IconBtn
            onClick={onStart}
            title={t('docker.start')}
            aria-label={t('docker.start')}
            disabled={busy}
          >
            {busy ? <Spinner size={12} /> : <Play size={14} strokeWidth={1.75} />}
          </IconBtn>
        )}
        <IconBtn
          onClick={onLogs}
          title={t('docker.viewLogs')}
          aria-label={t('docker.viewLogs')}
          disabled={false}
        >
          <ScrollText size={14} strokeWidth={1.75} />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  'aria-label': ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  'aria-label'?: string;
  disabled?: boolean;
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
        color: 'var(--text-secondary)',
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
