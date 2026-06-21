'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Download, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast } from '@/components/ui';

interface Backup {
  name: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(0) + ' MB';
  const kb = bytes / 1024;
  return kb.toFixed(0) + ' KB';
}

export default function BackupsPage() {
  const t = useTranslations();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      await api.createBackup();
      show(t('backups.backupNow'), 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(name: string) {
    setBusyName(name);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(api.backupDownloadUrl(name), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setBusyName(null);
    }
  }

  async function handleRestore(name: string) {
    if (!window.confirm(t('backups.confirmRestore', { name }))) return;
    setBusyName(name);
    try {
      await api.restoreBackup(name);
      show(t('backups.restoreStarted'), 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setBusyName(null);
    }
  }

  async function handleDelete(name: string) {
    if (!window.confirm(t('backups.confirmDelete', { name }))) return;
    setBusyName(name);
    try {
      await api.deleteBackup(name);
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setBusyName(null);
    }
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('backups.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t('backups.count', { n: backups.length })}
          </p>
        </div>
        <Btn variant="primary" onClick={handleCreate} disabled={creating}>
          {creating ? <><Spinner size={13} /> {t('backups.creating')}</> : t('backups.backupNow')}
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : backups.length === 0 ? (
        <EmptyState
          icon={<Archive size={32} strokeWidth={1.5} />}
          title={t('backups.emptyTitle')}
          subtitle={t('backups.emptySubtitle')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {backups.map(b => (
            <BackupRow
              key={b.name}
              backup={b}
              busy={busyName === b.name}
              onDownload={() => handleDownload(b.name)}
              onRestore={() => handleRestore(b.name)}
              onDelete={() => handleDelete(b.name)}
              labelDownload={t('backups.download')}
              labelRestore={t('backups.restore')}
              labelDelete={t('backups.delete')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface BackupRowProps {
  backup: Backup;
  busy: boolean;
  onDownload: () => void;
  onRestore: () => void;
  onDelete: () => void;
  labelDownload: string;
  labelRestore: string;
  labelDelete: string;
}

function BackupRow({ backup, busy, onDownload, onRestore, onDelete, labelDownload, labelRestore, labelDelete }: BackupRowProps) {
  const date = new Date(backup.createdAt).toLocaleString();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '10px 14px',
      gap: '12px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {backup.name}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
          {formatBytes(backup.size)} · {date}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <Btn size="sm" variant="default" onClick={onDownload} disabled={busy} aria-label={labelDownload}>
          {busy ? <Spinner size={12} /> : <Download size={13} strokeWidth={1.75} />}
          {labelDownload}
        </Btn>
        <Btn size="sm" variant="danger" onClick={onRestore} disabled={busy} aria-label={labelRestore}>
          <RotateCcw size={13} strokeWidth={1.75} />
          {labelRestore}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onDelete} disabled={busy} aria-label={labelDelete}>
          <Trash2 size={13} strokeWidth={1.75} />
          {labelDelete}
        </Btn>
      </div>
    </div>
  );
}
