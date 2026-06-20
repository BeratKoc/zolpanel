'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Modal, FormField, Spinner } from '@/components/ui';
import { APP_TYPES } from '@/components/domains/shared';

export function EditDomainModal({ domain, onClose, onSuccess, onError }: {
  domain: any;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [form, setForm] = useState({
    aliases: domain.aliases?.join(', ') || '',
    appType: domain.appType || 'other',
    notes: domain.notes || '',
    status: domain.status,
  });
  const [submitting, setSubmitting] = useState(false);

  function update(key: string, val: string) { setForm(prev => ({ ...prev, [key]: val })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.updateDomain(domain._id, {
        aliases: form.aliases ? form.aliases.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        appType: form.appType,
        notes: form.notes,
        status: form.status,
      });
      onSuccess();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('domains.editTitle', { domain: domain.domain })} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {domain.type === 'proxy'
            ? `reverse_proxy localhost:${domain.port}`
            : domain.type === 'advanced'
            ? (domain.routes || []).map((r: any) => `${r.path} → :${r.port}${r.type === 'websocket' ? ' (ws)' : ''}`).join('\n')
            : `root * ${domain.rootPath}`}
        </div>

        <FormField label={t('domains.status')}>
          <select value={form.status} onChange={e => update('status', e.target.value)}>
            <option value="active">{t('domains.statusActive')}</option>
            <option value="offline">{t('domains.statusOffline')}</option>
          </select>
        </FormField>

        <FormField label={t('domains.appType')}>
          <select value={form.appType} onChange={e => update('appType', e.target.value)}>
            {APP_TYPES.map(at => <option key={at} value={at}>{at}</option>)}
          </select>
        </FormField>

        <FormField label={t('domains.aliasDomains')} hint={t('domains.aliasHintEdit')}>
          <input
            placeholder="ornek.net, ornek.org"
            value={form.aliases}
            onChange={e => update('aliases', e.target.value)}
          />
        </FormField>

        <FormField label={t('domains.notes')}>
          <textarea
            rows={2}
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            style={{ resize: 'none' }}
          />
        </FormField>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : t('common.save')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
