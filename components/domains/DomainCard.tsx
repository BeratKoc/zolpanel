'use client';

import { useTranslations } from 'next-intl';
import { Badge, StatusDot, Spinner } from '@/components/ui';

export function DomainCard({ domain, onDelete, onEdit, onToggle, deleting }: {
  domain: any;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
  deleting: boolean;
}) {
  const t = useTranslations();
  return (
    <div style={{
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
      <StatusDot status={domain.status} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{domain.domain}</span>
          {domain.aliases?.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              + {domain.aliases.join(', ')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {domain.type === 'proxy'
              ? `→ :${domain.port}`
              : domain.type === 'advanced'
              ? t('domains.routeCount', { n: domain.routes?.length || 0 })
              : domain.rootPath}
          </span>
          {domain.appType && domain.appType !== 'other' && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{domain.appType}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge color={domain.type === 'proxy' ? 'blue' : 'purple'}>
          {domain.type}
        </Badge>
        <Badge color={domain.sslStatus === 'active' ? 'green' : 'yellow'}>
          {domain.sslStatus === 'active' ? '🔒' : '⏳'} SSL
        </Badge>
      </div>

      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <IconBtn onClick={onToggle} title={domain.status === 'active' ? t('domains.stop') : t('domains.activate')}>
          {domain.status === 'active' ? '⏸' : '▶'}
        </IconBtn>
        <IconBtn onClick={onEdit} title={t('common.edit')}>✏️</IconBtn>
        <IconBtn onClick={onDelete} title={t('common.delete')} danger disabled={deleting}>
          {deleting ? <Spinner size={12} /> : '🗑'}
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}
