'use client';

import { useTranslations } from 'next-intl';
import { FileText, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
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
      className="proc-row"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '10px 16px',
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

      <span
        data-label={t('processes.colCpu')}
        style={{
          fontSize: '13px',
          fontFamily: 'var(--font-mono)',
          color: p.cpu > 50 ? 'var(--yellow)' : 'var(--text-secondary)',
        }}
      >
        {p.cpu}%
      </span>

      <span
        data-label={t('processes.colMem')}
        style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
      >
        {formatBytes(p.memory)}
      </span>

      <span
        data-label={t('processes.colRestarts')}
        style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: p.restarts > 5 ? 'var(--red)' : 'var(--text-secondary)' }}
      >
        {p.restarts}
      </span>

      <span
        data-label={t('processes.colUptime')}
        style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
      >
        {formatUptime(p.uptime)}
      </span>

      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
        <ProcBtn
          onClick={() => onShowLogs(p.name)}
          title={t('processes.logs')}
          aria-label={t('processes.logs')}
          loading={actionLoading === p.name + 'logs'}
        ><FileText size={14} strokeWidth={1.75} color="currentColor" /></ProcBtn>

        {p.status === 'online' ? (
          <ProcBtn
            onClick={() => onAction(p.name, 'stop')}
            title={t('processes.stop')}
            aria-label={t('processes.stop')}
            loading={actionLoading === p.name + 'stop'}
          ><Pause size={14} strokeWidth={1.75} color="currentColor" /></ProcBtn>
        ) : (
          <ProcBtn
            onClick={() => onAction(p.name, 'restart')}
            title={t('processes.start')}
            aria-label={t('processes.start')}
            loading={actionLoading === p.name + 'restart'}
          ><Play size={14} strokeWidth={1.75} color="currentColor" /></ProcBtn>
        )}

        <ProcBtn
          onClick={() => onAction(p.name, 'restart')}
          title={t('processes.restart')}
          aria-label={t('processes.restart')}
          loading={actionLoading === p.name + 'restart'}
        ><RotateCw size={14} strokeWidth={1.75} color="currentColor" /></ProcBtn>

        <ProcBtn
          onClick={() => onAction(p.name, 'delete')}
          title={t('common.delete')}
          aria-label={t('common.delete')}
          danger
          loading={actionLoading === p.name + 'delete'}
        ><Trash2 size={14} strokeWidth={1.75} color="currentColor" /></ProcBtn>
      </div>
    </div>
  );
}
