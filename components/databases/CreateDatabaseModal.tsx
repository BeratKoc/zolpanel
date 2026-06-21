'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Modal, FormField, Spinner } from '@/components/ui';

export function CreateDatabaseModal({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [engine, setEngine] = useState<'postgres' | 'mysql' | 'redis'>('postgres');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createDatabase({ engine, name: name.trim() || undefined });
      onSuccess();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title={t('databases.create')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label={t('databases.engine')}>
          <select
            value={engine}
            onChange={e => setEngine(e.target.value as 'postgres' | 'mysql' | 'redis')}
            disabled={creating}
          >
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="redis">Redis</option>
          </select>
        </FormField>

        <FormField label={t('databases.nameOptional')}>
          <input
            placeholder={engine}
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={creating}
          />
        </FormField>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Btn type="button" variant="ghost" onClick={onClose} disabled={creating}>
            {t('common.cancel')}
          </Btn>
          <Btn type="submit" variant="primary" disabled={creating}>
            {creating ? (
              <>
                <Spinner size={13} />
                <span>{t('databases.creating')}</span>
              </>
            ) : (
              t('databases.create')
            )}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
