'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Modal, FormField, Spinner } from '@/components/ui';

export function CreateAppModal({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [domain, setDomain] = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createApp({
        name: name.trim(),
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || 'main',
        domain: domain.trim() || undefined,
        containerPort: containerPort ? Number(containerPort) : undefined,
      });
      onSuccess();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title={t('apps.create')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label={t('apps.nameLabel')}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={creating}
            required
          />
        </FormField>

        <FormField label={t('apps.repoUrl')}>
          <input
            type="url"
            placeholder="https://github.com/user/repo"
            value={repoUrl}
            onChange={e => setRepoUrl(e.target.value)}
            disabled={creating}
            required
          />
        </FormField>

        <FormField label={t('apps.branch')}>
          <input
            placeholder="main"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            disabled={creating}
          />
        </FormField>

        <FormField label={t('apps.domainOptional')}>
          <input
            placeholder="app.example.com"
            value={domain}
            onChange={e => setDomain(e.target.value)}
            disabled={creating}
          />
        </FormField>

        <FormField label={t('apps.containerPort')}>
          <input
            type="number"
            placeholder="3000"
            value={containerPort}
            onChange={e => setContainerPort(e.target.value)}
            disabled={creating}
            min={1}
            max={65535}
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
                <span>{t('apps.deploying')}</span>
              </>
            ) : (
              t('apps.create')
            )}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
