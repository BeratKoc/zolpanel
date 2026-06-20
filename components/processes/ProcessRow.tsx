'use client';

import { useTranslations } from 'next-intl';
import { Badge, StatusDot } from '@/components/ui';
import { formatBytes, formatUptime, ProcBtn } from '@/components/processes/shared';

export function ProcessRow({ p, statusColor, actionLoading, onShowLogs, onAction }: {
  p: any;
  statusColor: Record<string, any>;
  actionLoading: string | null;
  onShowLogs: (name: string) => void;
  onAction: (name: string, action: string) => void;
}) {
  const t = useTranslations();
  return (
    <div
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
          onClick={() => onShowLogs(p.name)}
          title={t('processes.logs')}
          loading={actionLoading === p.name + 'logs'}
        >📋</ProcBtn>

        {p.status === 'online' ? (
          <ProcBtn
            onClick={() => onAction(p.name, 'stop')}
            title={t('processes.stop')}
            loading={actionLoading === p.name + 'stop'}
          >⏸</ProcBtn>
        ) : (
          <ProcBtn
            onClick={() => onAction(p.name, 'restart')}
            title={t('processes.start')}
            loading={actionLoading === p.name + 'restart'}
          >▶</ProcBtn>
        )}

        <ProcBtn
          onClick={() => onAction(p.name, 'restart')}
          title={t('processes.restart')}
          loading={actionLoading === p.name + 'restart'}
        >↺</ProcBtn>

        <ProcBtn
          onClick={() => onAction(p.name, 'delete')}
          title={t('common.delete')}
          danger
          loading={actionLoading === p.name + 'delete'}
        >🗑</ProcBtn>
      </div>
    </div>
  );
}
