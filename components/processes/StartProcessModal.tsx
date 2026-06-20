'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Modal, FormField, Spinner } from '@/components/ui';

export function StartProcessModal({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [form, setForm] = useState({ name: '', script: '', cwd: '/var/www' });
  const [submitting, setSubmitting] = useState(false);

  function update(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.startProcess(form);
      onSuccess();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('processes.startProcessTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label={t('processes.processName')}>
          <input placeholder="myapp" value={form.name} onChange={e => update('name', e.target.value)} required autoFocus />
        </FormField>
        <FormField label={t('processes.scriptPath')} hint={t('processes.scriptPathHint')}>
          <input placeholder="server.js" value={form.script} onChange={e => update('script', e.target.value)} required />
        </FormField>
        <FormField label={t('processes.workingDir')}>
          <input placeholder="/var/www/myapp" value={form.cwd} onChange={e => update('cwd', e.target.value)} />
        </FormField>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : t('processes.start')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
