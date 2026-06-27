'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Wrench, RefreshCw, Package, HardDrive, Trash2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, Modal, useToast } from '@/components/ui';

// ── Types ────────────────────────────────────────────────────────────────────

interface UpdatePackage {
  name: string;
  current: string;
  candidate: string;
}

interface Filesystem {
  filesystem: string;
  size: number;
  used: number;
  avail: number;
  usePercent: number;
  mount: string;
}

interface DockerUsage {
  type: string;
  total: string;
  active: string;
  size: string;
  reclaimable: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function percentColor(pct: number): string {
  if (pct >= 90) return 'var(--red, #ef4444)';
  if (pct >= 75) return 'var(--yellow, #f59e0b)';
  return 'var(--green, #22c55e)';
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ title, body, onConfirm, onCancel }: ConfirmModalProps) {
  const t = useTranslations();
  const inFlight = useRef(false);
  function handleConfirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    onConfirm();
  }
  return (
    <Modal title={title} onClose={onCancel} width={440}>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '20px' }}>
        {body}
      </p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Btn variant="default" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Btn>
        <Btn
          variant="danger"
          size="sm"
          onClick={handleConfirm}
          style={{ background: 'var(--red)', border: '1px solid var(--red)', color: '#fff' }}
        >
          {title}
        </Btn>
      </div>
    </Modal>
  );
}

// ── Output Modal ──────────────────────────────────────────────────────────────

interface OutputModalProps {
  title: string;
  output: string;
  onClose: () => void;
}

function OutputModal({ title, output, onClose }: OutputModalProps) {
  const t = useTranslations();
  return (
    <Modal title={title} onClose={onClose} width={660}>
      <pre style={{
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '12px',
        maxHeight: '400px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        margin: 0,
        marginBottom: '16px',
      }}>
        {output || '(no output)'}
      </pre>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn variant="default" size="sm" onClick={onClose}>
          {t('common.close')}
        </Btn>
      </div>
    </Modal>
  );
}

// ── Section Header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
      <span style={{ color: 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>{icon}</span>
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
    </div>
  );
}

// ── Table Wrapper ─────────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  color: 'var(--text-muted)',
  fontWeight: 500,
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '7px 10px',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border)',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  // Updates state
  const [packages, setPackages] = useState<UpdatePackage[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);

  // Disk state
  const [filesystems, setFilesystems] = useState<Filesystem[]>([]);
  const [dockerUsage, setDockerUsage] = useState<DockerUsage[]>([]);
  const [diskLoading, setDiskLoading] = useState(true);

  // Modal state
  const [confirmAction, setConfirmAction] = useState<null | { title: string; body: string; onConfirm: () => void }>(null);
  const [outputModal, setOutputModal] = useState<null | { title: string; output: string }>(null);

  // Busy states
  const [applying, setApplying] = useState(false);
  const [pruning, setPruning] = useState<string | null>(null);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadUpdates = useCallback(async () => {
    setUpdatesLoading(true);
    try {
      const data = await api.updatesList() as { packages: UpdatePackage[] };
      setPackages(data.packages ?? []);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setUpdatesLoading(false);
    }
  }, [show]);

  const loadDisk = useCallback(async () => {
    setDiskLoading(true);
    try {
      const data = await api.diskInfo() as { filesystems: Filesystem[]; docker: DockerUsage[] };
      setFilesystems(data.filesystems ?? []);
      setDockerUsage(data.docker ?? []);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setDiskLoading(false);
    }
  }, [show]);

  const loadAll = useCallback(() => {
    loadUpdates();
    loadDisk();
  }, [loadUpdates, loadDisk]);

  useEffect(() => {
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleApplyUpdates() {
    setConfirmAction({
      title: t('maintenance.applyUpdates'),
      body: t('maintenance.applyConfirm'),
      onConfirm: async () => {
        setConfirmAction(null);
        setApplying(true);
        try {
          const res = await api.updatesApply() as { output: string };
          setOutputModal({ title: t('maintenance.applyOutput'), output: res.output });
          await loadUpdates();
        } catch (e: any) {
          show(e.message, 'error');
        } finally {
          setApplying(false);
        }
      },
    });
  }

  function handlePrune(target: 'images' | 'builder' | 'system', label: string) {
    setConfirmAction({
      title: label,
      body: t('maintenance.pruneConfirm'),
      onConfirm: async () => {
        setConfirmAction(null);
        setPruning(target);
        try {
          const res = await api.dockerPrune(target) as { output: string };
          setOutputModal({ title: `${t('maintenance.output')}: ${label}`, output: res.output });
          await loadDisk();
        } catch (e: any) {
          show(e.message, 'error');
        } finally {
          setPruning(null);
        }
      },
    });
  }

  const busy = applying || pruning !== null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      {/* Modals */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          body={confirmAction.body}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {outputModal && (
        <OutputModal
          title={outputModal.title}
          output={outputModal.output}
          onClose={() => setOutputModal(null)}
        />
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('maintenance.title')}</h2>
        </div>
        <Btn variant="default" onClick={loadAll} disabled={busy || updatesLoading || diskLoading}>
          <RefreshCw size={13} strokeWidth={1.75} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} />
          {t('maintenance.refresh')}
        </Btn>
      </div>

      {/* ── Section 1: Updates ── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <SectionHeader icon={<Package size={15} strokeWidth={1.75} />} title={t('maintenance.updates')} />
            <Btn
              variant="danger"
              size="sm"
              onClick={handleApplyUpdates}
              disabled={busy || packages.length === 0 || updatesLoading}
            >
              {applying
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> {t('maintenance.running')}</>
                : t('maintenance.applyUpdates')}
            </Btn>
          </div>

          {updatesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Spinner size={20} />
            </div>
          ) : packages.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
              {t('maintenance.upToDate')}
            </p>
          ) : (
            <>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                {t('maintenance.upgradable')}: {packages.length}
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>{t('maintenance.package')}</th>
                      <th style={thStyle}>{t('maintenance.current')}</th>
                      <th style={thStyle}>{t('maintenance.candidate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map(pkg => (
                      <tr key={pkg.name}>
                        <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 500 }}>{pkg.name}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{pkg.current}</td>
                        <td style={{ ...tdStyle, color: 'var(--green, #22c55e)' }}>{pkg.candidate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section 2: Disk ── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px',
        }}>
          <SectionHeader icon={<HardDrive size={15} strokeWidth={1.75} />} title={t('maintenance.disk')} />

          {diskLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Spinner size={20} />
            </div>
          ) : (
            <>
              {/* Filesystems */}
              {filesystems.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: '18px' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>{t('maintenance.mount')}</th>
                        <th style={thStyle}>{t('maintenance.used')}</th>
                        <th style={thStyle}>{t('maintenance.available')}</th>
                        <th style={thStyle}>{t('maintenance.usePercent')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filesystems.map(fs => {
                        const pct = Math.max(0, Math.min(100, fs.usePercent));
                        const color = percentColor(pct);
                        return (
                          <tr key={fs.mount}>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>{fs.mount}</td>
                            <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{formatBytes(fs.used)}</td>
                            <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{formatBytes(fs.avail)}</td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                  width: 80,
                                  height: 6,
                                  background: 'var(--bg-elevated, rgba(255,255,255,0.08))',
                                  borderRadius: 3,
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                }}>
                                  <div style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: color,
                                    borderRadius: 3,
                                    transition: 'width 0.3s ease',
                                  }} />
                                </div>
                                <span style={{ color, fontSize: '11px', whiteSpace: 'nowrap' }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Docker disk usage */}
              {dockerUsage.length > 0 && (
                <>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    {t('maintenance.dockerUsage')}
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>{t('maintenance.type')}</th>
                          <th style={thStyle}>{t('maintenance.size')}</th>
                          <th style={thStyle}>{t('maintenance.reclaimable')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dockerUsage.map(d => (
                          <tr key={d.type}>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>{d.type}</td>
                            <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{d.size}</td>
                            <td style={{ ...tdStyle, color: 'var(--yellow, #f59e0b)' }}>{d.reclaimable}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {filesystems.length === 0 && dockerUsage.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>—</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Section 3: Docker Cleanup ── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px',
        }}>
          <SectionHeader icon={<Trash2 size={15} strokeWidth={1.75} />} title="Docker" />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Btn
              variant="danger"
              size="sm"
              onClick={() => handlePrune('images', t('maintenance.pruneImages'))}
              disabled={busy}
            >
              {pruning === 'images'
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> {t('maintenance.running')}</>
                : t('maintenance.pruneImages')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={() => handlePrune('builder', t('maintenance.pruneBuilder'))}
              disabled={busy}
            >
              {pruning === 'builder'
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> {t('maintenance.running')}</>
                : t('maintenance.pruneBuilder')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={() => handlePrune('system', t('maintenance.pruneSystem'))}
              disabled={busy}
            >
              {pruning === 'system'
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> {t('maintenance.running')}</>
                : t('maintenance.pruneSystem')}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
