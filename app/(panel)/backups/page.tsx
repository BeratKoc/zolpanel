'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Archive, Download, RotateCcw, Trash2, Cloud, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast } from '@/components/ui';

interface Backup {
  name: string;
  size: number;
  createdAt: string;
}

interface S3ConfigForm {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

interface S3Object {
  key: string;
  size: number;
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

// Inlined from @/lib/server/s3/config — avoids pulling node:crypto/better-sqlite3 into the client bundle
function validateS3ConfigClient(c: Partial<S3ConfigForm>): string | null {
  if (!c.endpoint || !/^https?:\/\/.+/.test(c.endpoint)) return 'Geçerli endpoint (https://...) gerekli';
  if (!c.region || !c.region.trim()) return 'Region gerekli';
  if (!c.bucket || !/^[a-z0-9.\-]{3,63}$/.test(c.bucket)) return 'Geçerli bucket adı gerekli';
  if (!c.accessKeyId || !c.accessKeyId.trim()) return 'Access Key ID gerekli';
  if (!c.secretAccessKey || !c.secretAccessKey.trim()) return 'Secret Access Key gerekli';
  return null;
}

export default function BackupsPage() {
  const t = useTranslations();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  // S3 state
  const [s3Loading, setS3Loading] = useState(true);
  const [s3Configured, setS3Configured] = useState(false);
  const [s3Config, setS3Config] = useState<{ endpoint?: string; bucket?: string } | null>(null);
  const [s3Form, setS3Form] = useState<S3ConfigForm>({
    endpoint: '', region: '', bucket: '', accessKeyId: '', secretAccessKey: '', prefix: '',
  });
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Testing, setS3Testing] = useState(false);
  const [s3Deleting, setS3Deleting] = useState(false);
  const [s3Remote, setS3Remote] = useState<S3Object[]>([]);
  const [s3RemoteLoading, setS3RemoteLoading] = useState(false);
  const [pushingName, setPushingName] = useState<string | null>(null);

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

  async function loadS3Status() {
    try {
      const res = await api.s3ConfigStatus() as { configured: boolean; config?: { endpoint: string; region: string; bucket: string; accessKeyId: string; prefix?: string } };
      setS3Configured(res.configured);
      setS3Config(res.config ?? null);
      if (res.configured) {
        loadS3Remote();
      }
    } catch {
      // silently ignore — S3 section will show unconfigured
    } finally {
      setS3Loading(false);
    }
  }

  async function loadS3Remote() {
    setS3RemoteLoading(true);
    try {
      const res = await api.s3List() as { objects: S3Object[] };
      setS3Remote(res.objects ?? []);
    } catch {
      setS3Remote([]);
    } finally {
      setS3RemoteLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadS3Status();
    const interval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleS3Save() {
    const err = validateS3ConfigClient(s3Form);
    if (err) { show(err, 'error'); return; }
    setS3Saving(true);
    try {
      await api.s3ConfigSave({
        endpoint: s3Form.endpoint.trim(),
        region: s3Form.region.trim(),
        bucket: s3Form.bucket.trim(),
        accessKeyId: s3Form.accessKeyId.trim(),
        secretAccessKey: s3Form.secretAccessKey,
        prefix: s3Form.prefix.trim() || undefined,
      });
      await loadS3Status();
      setS3Form({ endpoint: '', region: '', bucket: '', accessKeyId: '', secretAccessKey: '', prefix: '' });
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setS3Saving(false);
    }
  }

  async function handleS3Test() {
    setS3Testing(true);
    try {
      await api.s3Test();
      show(t('backups.s3TestOk'), 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setS3Testing(false);
    }
  }

  async function handleS3Delete() {
    setS3Deleting(true);
    try {
      await api.s3ConfigDelete();
      setS3Configured(false);
      setS3Config(null);
      setS3Remote([]);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setS3Deleting(false);
    }
  }

  async function handleS3Push(name: string) {
    setPushingName(name);
    try {
      await api.s3Upload(name);
      show(t('backups.s3Pushed'), 'success');
      await loadS3Remote();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setPushingName(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-input, var(--bg-surface))',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-primary)',
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      {/* ── S3 Section ── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Cloud size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 600 }}>{t('backups.s3Title')}</h3>
        </div>

        {s3Loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
            <Spinner size={20} />
          </div>
        ) : !s3Configured ? (
          /* ── Configure card ── */
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '16px',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              {t('backups.s3NotConfigured')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('backups.s3Endpoint')}</label>
                <input
                  style={inputStyle}
                  placeholder="https://s3.amazonaws.com"
                  value={s3Form.endpoint}
                  onChange={e => setS3Form(f => ({ ...f, endpoint: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('backups.s3Region')}</label>
                <input
                  style={inputStyle}
                  placeholder="us-east-1"
                  value={s3Form.region}
                  onChange={e => setS3Form(f => ({ ...f, region: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('backups.s3Bucket')}</label>
                <input
                  style={inputStyle}
                  placeholder="my-bucket"
                  value={s3Form.bucket}
                  onChange={e => setS3Form(f => ({ ...f, bucket: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('backups.s3AccessKey')}</label>
                <input
                  style={inputStyle}
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  value={s3Form.accessKeyId}
                  onChange={e => setS3Form(f => ({ ...f, accessKeyId: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('backups.s3SecretKey')}</label>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="••••••••"
                  value={s3Form.secretAccessKey}
                  onChange={e => setS3Form(f => ({ ...f, secretAccessKey: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('backups.s3Prefix')}</label>
                <input
                  style={inputStyle}
                  placeholder="backups/"
                  value={s3Form.prefix}
                  onChange={e => setS3Form(f => ({ ...f, prefix: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <Btn variant="primary" onClick={handleS3Save} disabled={s3Saving}>
                {s3Saving ? <><Spinner size={13} /> {t('backups.s3Save')}</> : t('backups.s3Save')}
              </Btn>
            </div>
          </div>
        ) : (
          /* ── Configured view ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Summary + actions */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}>
              <div>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {s3Config?.endpoint}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {s3Config?.bucket}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Btn size="sm" variant="default" onClick={handleS3Test} disabled={s3Testing}>
                  {s3Testing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  {t('backups.s3Test')}
                </Btn>
                <Btn size="sm" variant="ghost" onClick={handleS3Delete} disabled={s3Deleting}>
                  <Trash2 size={13} strokeWidth={1.75} />
                  {t('backups.s3Delete')}
                </Btn>
              </div>
            </div>

            {/* Remote objects list */}
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{t('backups.s3Remote')}</p>
              {s3RemoteLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                  <Spinner size={18} />
                </div>
              ) : s3Remote.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>{t('backups.s3Empty')}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Key</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s3Remote.map(obj => (
                        <tr key={obj.key} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{obj.key}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatBytes(obj.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Local Backups Section ── */}
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
              pushing={pushingName === b.name}
              s3Configured={s3Configured}
              onDownload={() => handleDownload(b.name)}
              onRestore={() => handleRestore(b.name)}
              onDelete={() => handleDelete(b.name)}
              onPush={() => handleS3Push(b.name)}
              labelDownload={t('backups.download')}
              labelRestore={t('backups.restore')}
              labelDelete={t('backups.delete')}
              labelPush={t('backups.s3Push')}
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
  pushing: boolean;
  s3Configured: boolean;
  onDownload: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onPush: () => void;
  labelDownload: string;
  labelRestore: string;
  labelDelete: string;
  labelPush: string;
}

function BackupRow({ backup, busy, pushing, s3Configured, onDownload, onRestore, onDelete, onPush, labelDownload, labelRestore, labelDelete, labelPush }: BackupRowProps) {
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
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
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
        {s3Configured && (
          <Btn size="sm" variant="default" onClick={onPush} disabled={pushing || busy} aria-label={labelPush}>
            {pushing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Cloud size={13} strokeWidth={1.75} />}
            {labelPush}
          </Btn>
        )}
      </div>
    </div>
  );
}
