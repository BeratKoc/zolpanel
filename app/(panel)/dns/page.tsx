'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Globe2, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, Modal, FormField, useToast } from '@/components/ui';
import { ConfirmDestructive } from '@/components/dbexplorer/ConfirmDestructive';
import { validateDnsRecord } from '@/lib/server/dns/validate';
import type { DnsRecordInput } from '@/lib/server/dns/validate';

interface Zone { id: string; name: string; }
interface DnsRecord { id: string; type: string; name: string; content: string; ttl: number; priority?: number; }

type ModalMode = 'add' | 'edit' | null;

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'] as const;

function emptyForm(): DnsRecordInput & { id?: string } {
  return { type: 'A', name: '', content: '', ttl: 1, priority: undefined };
}

export default function DnsPage() {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Token setup
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Zones
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [loadingZones, setLoadingZones] = useState(false);

  // Records
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [busy, setBusy] = useState(false);

  // Record modal
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<DnsRecordInput & { id?: string }>(emptyForm());

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<DnsRecord | null>(null);

  // Check token status on mount
  const checkStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await api.dnsTokenStatus() as { configured: boolean };
      setConfigured(data.configured);
      if (data.configured) {
        await loadZones();
      }
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setLoadingStatus(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  async function loadZones() {
    setLoadingZones(true);
    try {
      const data = await api.dnsZones() as { zones: Zone[] };
      setZones(data.zones);
      if (data.zones.length > 0) {
        setSelectedZone(data.zones[0].id);
        await loadRecords(data.zones[0].id);
      }
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setLoadingZones(false);
    }
  }

  const loadRecords = useCallback(async (zoneId: string) => {
    if (!zoneId) return;
    setLoadingRecords(true);
    try {
      const data = await api.dnsRecords(zoneId) as { records: DnsRecord[] };
      setRecords(data.records);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setLoadingRecords(false);
    }
  }, [show]);

  async function handleZoneChange(zoneId: string) {
    setSelectedZone(zoneId);
    await loadRecords(zoneId);
  }

  async function handleSaveToken() {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    try {
      await api.dnsTokenSave(tokenInput.trim());
      setTokenInput('');
      show(t('dns.tokenSaved'), 'success');
      await checkStatus();
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setSavingToken(false);
    }
  }

  async function handleChangeToken() {
    try {
      await api.dnsTokenDelete();
      setConfigured(false);
      setZones([]);
      setRecords([]);
      setSelectedZone('');
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  function openAdd() {
    setForm(emptyForm());
    setModalMode('add');
  }

  function openEdit(rec: DnsRecord) {
    setForm({ id: rec.id, type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl, priority: rec.priority });
    setModalMode('edit');
  }

  async function handleSaveRecord() {
    const input: DnsRecordInput = {
      type: form.type,
      name: form.name,
      content: form.content,
      ttl: form.ttl,
      priority: form.type === 'MX' ? form.priority : undefined,
    };
    const err = validateDnsRecord(input);
    if (err) {
      show(err, 'error');
      return;
    }
    setModalMode(null);
    setBusy(true);
    try {
      if (modalMode === 'add') {
        await api.dnsRecordCreate(selectedZone, input);
      } else if (modalMode === 'edit' && form.id) {
        await api.dnsRecordUpdate(selectedZone, form.id, input);
      }
      show(t('dns.save'), 'success');
      await loadRecords(selectedZone);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRecord() {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    setBusy(true);
    try {
      await api.dnsRecordDelete(selectedZone, deleteTarget.id);
      await loadRecords(selectedZone);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function updateForm(patch: Partial<typeof form>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  // Loading state
  if (loadingStatus) {
    return (
      <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
        <ToastContainer />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <Spinner size={24} />
        </div>
      </div>
    );
  }

  // Token setup card
  if (!configured) {
    return (
      <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
        <ToastContainer />
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('dns.title')}</h2>
        </div>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          maxWidth: '480px',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.55 }}>
            {t('dns.noToken')}
          </p>
          <FormField label={t('dns.tokenPlaceholder')}>
            <input
              type="password"
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              placeholder={t('dns.tokenPlaceholder')}
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
              autoFocus
            />
          </FormField>
          <div style={{ marginTop: '14px' }}>
            <Btn
              variant="primary"
              onClick={handleSaveToken}
              disabled={savingToken || !tokenInput.trim()}
            >
              {savingToken ? <Spinner size={14} /> : null}
              {t('dns.tokenSave')}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  // Main DNS management
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
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('dns.title')}</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn variant="ghost" size="sm" onClick={handleChangeToken} disabled={busy}>
            {t('dns.tokenChange')}
          </Btn>
          <Btn variant="primary" size="sm" onClick={openAdd} disabled={busy || !selectedZone}>
            {t('dns.addRecord')}
          </Btn>
        </div>
      </div>

      {/* Zone selector */}
      {loadingZones ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Spinner size={20} />
        </div>
      ) : zones.length === 0 ? (
        <EmptyState
          icon={<Globe2 size={32} strokeWidth={1.5} />}
          title={t('dns.selectZone')}
        />
      ) : (
        <>
          <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('dns.zone')}:</span>
            <select
              value={selectedZone}
              onChange={e => handleZoneChange(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '200px' }}
            >
              {zones.map(z => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>

          {/* Records table */}
          {loadingRecords ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <Spinner size={24} />
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={<Globe2 size={32} strokeWidth={1.5} />}
              title={t('dns.empty')}
              action={
                <Btn variant="primary" size="sm" onClick={openAdd}>
                  {t('dns.addRecord')}
                </Btn>
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>{t('dns.type')}</th>
                    <th style={thStyle}>{t('dns.name')}</th>
                    <th style={thStyle}>{t('dns.content')}</th>
                    <th style={thStyle}>{t('dns.ttl')}</th>
                    <th style={thStyle}>{t('dns.priority')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(rec => (
                    <tr
                      key={rec.id}
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: '10px',
                          background: 'rgba(99,102,241,0.15)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(99,102,241,0.3)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {rec.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {rec.name}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: '280px' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '280px',
                        }}
                          title={rec.content}
                        >
                          {rec.content}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {rec.ttl === 1 ? t('dns.auto') : rec.ttl}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {rec.priority !== undefined ? rec.priority : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <Btn
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(rec)}
                            disabled={busy}
                            aria-label={t('dns.edit')}
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Pencil size={13} strokeWidth={1.75} />
                          </Btn>
                          <Btn
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(rec)}
                            disabled={busy}
                            aria-label={t('dns.delete')}
                            style={{ color: 'var(--red)' }}
                          >
                            <Trash2 size={13} strokeWidth={1.75} />
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add / Edit record modal */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <Modal
          title={modalMode === 'add' ? t('dns.addRecord') : t('dns.edit')}
          onClose={() => setModalMode(null)}
          width={480}
        >
          <FormField label={t('dns.type')}>
            <select
              value={form.type}
              onChange={e => updateForm({ type: e.target.value, priority: e.target.value === 'MX' ? (form.priority ?? 10) : undefined })}
              style={inputStyle}
              autoFocus
            >
              {DNS_TYPES.map(t2 => (
                <option key={t2} value={t2}>{t2}</option>
              ))}
            </select>
          </FormField>
          <FormField label={t('dns.name')}>
            <input
              type="text"
              value={form.name}
              onChange={e => updateForm({ name: e.target.value })}
              placeholder="@ or subdomain"
              style={inputStyle}
            />
          </FormField>
          <FormField label={t('dns.content')}>
            <input
              type="text"
              value={form.content}
              onChange={e => updateForm({ content: e.target.value })}
              placeholder={form.type === 'A' ? '1.2.3.4' : form.type === 'MX' ? 'mail.example.com' : 'value'}
              style={inputStyle}
            />
          </FormField>
          <FormField label={`${t('dns.ttl')} (1 = ${t('dns.auto')})`}>
            <input
              type="number"
              value={form.ttl}
              onChange={e => updateForm({ ttl: parseInt(e.target.value, 10) || 1 })}
              min={1}
              style={inputStyle}
            />
          </FormField>
          {form.type === 'MX' && (
            <FormField label={t('dns.priority')}>
              <input
                type="number"
                value={form.priority ?? 10}
                onChange={e => updateForm({ priority: parseInt(e.target.value, 10) || 0 })}
                min={0}
                style={inputStyle}
              />
            </FormField>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('dns.cancel')}
            </Btn>
            <Btn
              variant="primary"
              size="sm"
              onClick={handleSaveRecord}
              disabled={!form.name.trim() || !form.content.trim()}
            >
              {t('dns.save')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDestructive
          reason={t('dns.deleteConfirm', { name: deleteTarget.name })}
          onConfirm={handleDeleteRecord}
          onCancel={() => setDeleteTarget(null)}
        />
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
