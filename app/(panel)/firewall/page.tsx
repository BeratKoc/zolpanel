'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Shield, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, Modal, FormField, useToast } from '@/components/ui';
import { validateRule, isProtectedPort } from '@/lib/server/firewall/ufw';
import type { UfwStatus, UfwRule, RuleInput } from '@/lib/server/firewall/ufw';

type ModalMode = 'add' | 'delete' | 'enable' | 'disable' | null;

export default function FirewallPage() {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  const [status, setStatus] = useState<UfwStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<UfwRule | null>(null);

  // Add rule form
  const [ruleAction, setRuleAction] = useState<'allow' | 'deny'>('allow');
  const [rulePort, setRulePort] = useState('');
  const [ruleProto, setRuleProto] = useState<'tcp' | 'udp' | 'any'>('tcp');
  const [ruleFrom, setRuleFrom] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.fwStatus();
      setStatus(data.status);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(enable: boolean) {
    setModalMode(null);
    setBusy(true);
    try {
      const data = await api.fwToggle(enable);
      setStatus(data.status);
      show(enable ? t('firewall.active') : t('firewall.inactive'), 'success');
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function openDelete(rule: UfwRule) {
    setDeleteTarget(rule);
    setModalMode('delete');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setModalMode(null);
    setBusy(true);
    try {
      const data = await api.fwDelete(deleteTarget.num);
      setStatus(data.status);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setDeleteTarget(null);
    }
  }

  async function handleAddRule() {
    const portNum = parseInt(rulePort, 10);
    const input: RuleInput = {
      action: ruleAction,
      port: portNum,
      proto: ruleProto,
      from: ruleFrom.trim() || undefined,
    };
    const err = validateRule(input);
    if (err) {
      show(err, 'error');
      return;
    }
    setModalMode(null);
    setBusy(true);
    try {
      const data = await api.fwAdd(input);
      setStatus(data.status);
      show(t('firewall.addRule'), 'success');
      setRulePort('');
      setRuleFrom('');
      setRuleAction('allow');
      setRuleProto('tcp');
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const active = status?.active ?? false;
  const rules = status?.rules ?? [];

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
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('firewall.title')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('firewall.status')}:</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
              background: active ? 'rgba(34,197,94,0.15)' : 'rgba(115,115,135,0.15)',
              color: active ? 'var(--green)' : 'var(--text-muted)',
              border: `1px solid ${active ? 'rgba(34,197,94,0.3)' : 'rgba(115,115,135,0.3)'}`,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: active ? 'var(--green)' : 'var(--text-muted)',
                display: 'inline-block',
              }} />
              {active ? t('firewall.active') : t('firewall.inactive')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {active ? (
            <Btn variant="danger" size="sm" onClick={() => setModalMode('disable')} disabled={busy || loading}>
              {t('firewall.disable')}
            </Btn>
          ) : (
            <Btn variant="default" size="sm" onClick={() => setModalMode('enable')} disabled={busy || loading}>
              {t('firewall.enable')}
            </Btn>
          )}
          <Btn variant="primary" onClick={() => setModalMode('add')} disabled={busy || loading}>
            {t('firewall.addRule')}
          </Btn>
        </div>
      </div>

      {/* Rules table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={<Shield size={32} strokeWidth={1.5} />}
          title={t('firewall.empty')}
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>{t('firewall.num')}</th>
                <th style={thStyle}>{t('firewall.to')}</th>
                <th style={thStyle}>{t('firewall.action')}</th>
                <th style={thStyle}>{t('firewall.from')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const portNum = parseInt(rule.to.split('/')[0], 10);
                const isProtected = rule.action === 'ALLOW' && !isNaN(portNum) && isProtectedPort(portNum);
                return (
                  <RuleRow
                    key={rule.num}
                    rule={rule}
                    isProtected={isProtected}
                    busy={busy}
                    onDelete={() => openDelete(rule)}
                    labelDelete={t('firewall.delete')}
                    sshWarning={t('firewall.sshWarning')}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Enable confirm modal */}
      {modalMode === 'enable' && (
        <Modal title={t('firewall.enable')} onClose={() => setModalMode(null)} width={440}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '20px' }}>
            {t('firewall.enableWarning')}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => handleToggle(true)}>
              {t('firewall.enable')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Disable confirm modal */}
      {modalMode === 'disable' && (
        <Modal title={t('firewall.disable')} onClose={() => setModalMode(null)} width={420}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '20px' }}>
            {t('firewall.disable')}?
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={() => handleToggle(false)}
              style={{ background: 'var(--red)', border: '1px solid var(--red)', color: '#fff' }}
            >
              {t('firewall.disable')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {modalMode === 'delete' && deleteTarget && (
        <Modal title={t('firewall.delete')} onClose={() => setModalMode(null)} width={420}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '20px' }}>
            {t('firewall.deleteConfirm', { num: deleteTarget.num })}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '20px' }}>
            {deleteTarget.to} · {deleteTarget.action} · {deleteTarget.from}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={handleDelete}
              style={{ background: 'var(--red)', border: '1px solid var(--red)', color: '#fff' }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
              {t('firewall.delete')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Add rule modal */}
      {modalMode === 'add' && (
        <Modal title={t('firewall.addRule')} onClose={() => setModalMode(null)} width={480}>
          <FormField label={t('firewall.action')}>
            <select
              value={ruleAction}
              onChange={e => setRuleAction(e.target.value as 'allow' | 'deny')}
              style={inputStyle}
            >
              <option value="allow">{t('firewall.allow')}</option>
              <option value="deny">{t('firewall.deny')}</option>
            </select>
          </FormField>
          <FormField label={t('firewall.port')}>
            <input
              type="number"
              min={1}
              max={65535}
              value={rulePort}
              onChange={e => setRulePort(e.target.value)}
              placeholder="80"
              style={inputStyle}
              autoFocus
            />
          </FormField>
          <FormField label={t('firewall.protocol')}>
            <select
              value={ruleProto}
              onChange={e => setRuleProto(e.target.value as 'tcp' | 'udp' | 'any')}
              style={inputStyle}
            >
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="any">any</option>
            </select>
          </FormField>
          <FormField label={t('firewall.from')}>
            <input
              type="text"
              value={ruleFrom}
              onChange={e => setRuleFrom(e.target.value)}
              placeholder={t('firewall.anywhere')}
              style={inputStyle}
            />
          </FormField>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Btn variant="default" size="sm" onClick={() => setModalMode(null)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant="primary" size="sm" onClick={handleAddRule} disabled={!rulePort.trim()}>
              {t('common.add')}
            </Btn>
          </div>
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

interface RuleRowProps {
  rule: UfwRule;
  isProtected: boolean;
  busy: boolean;
  onDelete: () => void;
  labelDelete: string;
  sshWarning: string;
}

function RuleRow({ rule, isProtected, busy, onDelete, labelDelete, sshWarning }: RuleRowProps) {
  const isAllow = rule.action === 'ALLOW';
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
    >
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {rule.num}
        </span>
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-primary)' }}>
          {rule.to}
        </span>
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: '11px',
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: '12px',
          background: isAllow ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: isAllow ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${isAllow ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {rule.action}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {rule.from}
        </span>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span title={isProtected ? sshWarning : labelDelete} style={{ display: 'inline-flex' }}>
          <Btn
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={busy || isProtected}
            aria-label={labelDelete}
            style={{ color: isProtected ? 'var(--text-muted)' : 'var(--red)', opacity: isProtected ? 0.4 : 1 }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </Btn>
        </span>
      </td>
    </tr>
  );
}
