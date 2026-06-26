'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Play, Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, Modal, FormField, useToast } from '@/components/ui';

// Client-side schedule validation — mirrors lib/server/cron/crontab.ts (pure, no node imports)
const CRON_SPECIALS = new Set(['@reboot', '@hourly', '@daily', '@weekly', '@monthly', '@yearly', '@annually']);
const FIELD_RE = /^[0-9*,\-/]+$/;
function isValidSchedule(s: string): boolean {
  const t = s.trim();
  if (CRON_SPECIALS.has(t)) return true;
  const parts = t.split(/\s+/);
  return parts.length === 5 && parts.every(f => FIELD_RE.test(f));
}

interface CronJob {
  id: number;
  schedule: string;
  command: string;
  enabled: boolean;
}

type ModalMode = 'add' | 'edit' | 'run' | 'delete' | null;

export default function CronPage() {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editJob, setEditJob] = useState<CronJob | null>(null);
  const [scheduleInput, setScheduleInput] = useState('');
  const [commandInput, setCommandInput] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CronJob | null>(null);
  const [saving, setSaving] = useState(false);
  const runIdRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api.cronList();
      setJobs(data.jobs ?? []);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveJobs(newJobs: CronJob[]) {
    setSaving(true);
    try {
      const data = await api.cronSave(newJobs);
      setJobs(data.jobs ?? []);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setEditJob(null);
    setScheduleInput('');
    setCommandInput('');
    setModalMode('add');
  }

  function openEdit(job: CronJob) {
    setEditJob(job);
    setScheduleInput(job.schedule);
    setCommandInput(job.command);
    setModalMode('edit');
  }

  async function handleSaveJob() {
    const sch = scheduleInput.trim();
    const cmd = commandInput.trim();
    if (!sch || !cmd) return;
    if (!isValidSchedule(sch)) {
      show(t('cron.invalidSchedule'), 'error');
      return;
    }
    let newJobs: CronJob[];
    if (modalMode === 'edit' && editJob !== null) {
      newJobs = jobs.map(j =>
        j.id === editJob.id ? { ...j, schedule: sch, command: cmd } : j
      );
    } else {
      const nextId = jobs.length > 0 ? Math.max(...jobs.map(j => j.id)) + 1 : 0;
      newJobs = [...jobs, { id: nextId, schedule: sch, command: cmd, enabled: true }];
    }
    setModalMode(null);
    await saveJobs(newJobs);
  }

  async function handleToggle(job: CronJob) {
    const newJobs = jobs.map(j =>
      j.id === job.id ? { ...j, enabled: !j.enabled } : j
    );
    await saveJobs(newJobs);
  }

  function openDelete(job: CronJob) {
    setDeleteTarget(job);
    setModalMode('delete');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const newJobs = jobs.filter(j => j.id !== deleteTarget.id);
    setModalMode(null);
    await saveJobs(newJobs);
  }

  async function handleRun(job: CronJob) {
    const runId = ++runIdRef.current;
    setRunOutput('');
    setModalMode('run');
    setRunLoading(true);
    try {
      const data = await api.cronRun(job.command);
      if (runIdRef.current === runId) {
        setRunOutput(data.output ?? '(no output)');
      }
    } catch (e: unknown) {
      if (runIdRef.current === runId) {
        setRunOutput((e as Error).message);
      }
    } finally {
      if (runIdRef.current === runId) {
        setRunLoading(false);
      }
    }
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('cron.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {jobs.length} {t('cron.title').toLowerCase()}
          </p>
        </div>
        <Btn variant="primary" onClick={openAdd} disabled={saving}>
          {t('cron.add')}
        </Btn>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Clock size={32} strokeWidth={1.5} />}
          title={t('cron.empty')}
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>{t('cron.schedule')}</th>
                <th style={{ ...thStyle, width: '40%' }}>{t('cron.command')}</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>{t('cron.enabled')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <CronRow
                  key={job.id}
                  job={job}
                  saving={saving}
                  onEdit={() => openEdit(job)}
                  onToggle={() => handleToggle(job)}
                  onDelete={() => openDelete(job)}
                  onRun={() => handleRun(job)}
                  labelEdit={t('cron.edit')}
                  labelEnable={t('cron.enable')}
                  labelDisable={t('cron.disable')}
                  labelDelete={t('cron.delete')}
                  labelRun={t('cron.run')}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <Modal
          title={modalMode === 'edit' ? t('cron.edit') : t('cron.add')}
          onClose={() => setModalMode(null)}
          width={480}
        >
          <FormField label={t('cron.schedule')}>
            <input
              type="text"
              value={scheduleInput}
              onChange={e => setScheduleInput(e.target.value)}
              placeholder={t('cron.schedulePlaceholder')}
              style={inputStyle}
              autoFocus
            />
          </FormField>
          <FormField label={t('cron.command')}>
            <input
              type="text"
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              placeholder={t('cron.commandPlaceholder')}
              style={inputStyle}
            />
          </FormField>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('cron.cancel')}
            </Btn>
            <Btn variant="primary" size="sm" onClick={handleSaveJob} disabled={!scheduleInput.trim() || !commandInput.trim()}>
              {t('cron.save')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {modalMode === 'delete' && deleteTarget && (
        <Modal
          title={t('cron.delete')}
          onClose={() => setModalMode(null)}
          width={420}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '20px' }}>
            {t('cron.deleteConfirm')}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '20px', wordBreak: 'break-all' }}>
            {deleteTarget.schedule} {deleteTarget.command}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('cron.cancel')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
              style={{ background: 'var(--red)', border: '1px solid var(--red)', color: '#fff' }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
              {t('cron.delete')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Run output modal */}
      {modalMode === 'run' && (
        <Modal
          title={t('cron.runOutput')}
          onClose={() => setModalMode(null)}
          width={600}
        >
          {runLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
              <Spinner size={20} />
            </div>
          ) : (
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '14px',
              overflowY: 'auto',
              maxHeight: '400px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}>
              {runOutput}
            </pre>
          )}
        </Modal>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  padding: '7px 10px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

interface CronRowProps {
  job: CronJob;
  saving: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRun: () => void;
  labelEdit: string;
  labelEnable: string;
  labelDisable: string;
  labelDelete: string;
  labelRun: string;
}

function CronRow({
  job, saving, onEdit, onToggle, onDelete, onRun,
  labelEdit, labelEnable, labelDisable, labelDelete, labelRun,
}: CronRowProps) {
  return (
    <tr style={{
      borderBottom: '1px solid var(--border)',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
    >
      {/* Schedule */}
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-primary)',
          opacity: job.enabled ? 1 : 0.5,
        }}>
          {job.schedule}
        </span>
      </td>

      {/* Command */}
      <td style={{ padding: '10px 12px', maxWidth: 0 }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          opacity: job.enabled ? 1 : 0.5,
        }}>
          {job.command}
        </span>
      </td>

      {/* Enabled toggle */}
      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <button
          type="button"
          onClick={onToggle}
          disabled={saving}
          aria-label={job.enabled ? labelDisable : labelEnable}
          title={job.enabled ? labelDisable : labelEnable}
          style={{
            background: 'none',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            padding: '2px',
            display: 'inline-flex',
            alignItems: 'center',
            color: job.enabled ? 'var(--green)' : 'var(--text-muted)',
            opacity: saving ? 0.5 : 1,
            transition: 'color 0.15s',
          }}
        >
          {job.enabled
            ? <ToggleRight size={22} strokeWidth={1.75} />
            : <ToggleLeft size={22} strokeWidth={1.75} />
          }
        </button>
      </td>

      {/* Actions */}
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
          <Btn size="sm" variant="ghost" onClick={onRun} disabled={saving} aria-label={labelRun}>
            <Play size={13} strokeWidth={1.75} />
          </Btn>
          <Btn size="sm" variant="ghost" onClick={onEdit} disabled={saving} aria-label={labelEdit}>
            <Edit2 size={13} strokeWidth={1.75} />
          </Btn>
          <Btn size="sm" variant="ghost" onClick={onDelete} disabled={saving} aria-label={labelDelete}
            style={{ color: 'var(--red)' }}>
            <Trash2 size={13} strokeWidth={1.75} />
          </Btn>
        </div>
      </td>
    </tr>
  );
}
