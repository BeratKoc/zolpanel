'use client';

import { Spinner } from '@/components/ui';

export function formatBytes(bytes?: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}

export function formatUptime(ms?: number): string {
  if (!ms) return '-';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 86400) + 'd';
}

export function ProcBtn({ children, onClick, title, danger, loading }: {
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
