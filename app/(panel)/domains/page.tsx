'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast } from '@/components/ui';
import { DomainCard } from '@/components/domains/DomainCard';
import { AddDomainModal } from '@/components/domains/AddDomainModal';
import { EditDomainModal } from '@/components/domains/EditDomainModal';

export default function Domains() {
  const t = useTranslations();
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<any>(null);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const data = await api.getDomains();
      setDomains(data);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(domain: any) {
    if (!window.confirm(t('domains.confirmDelete', { domain: domain.domain }))) return;
    setDeleting(domain._id);
    try {
      await api.deleteDomain(domain._id);
      show(t('domains.deleted', { domain: domain.domain }), 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function handleStatusToggle(domain: any) {
    const newStatus = domain.status === 'active' ? 'offline' : 'active';
    try {
      await api.updateDomain(domain._id, { status: newStatus });
      setDomains(prev => prev.map(d => d._id === domain._id ? { ...d, status: newStatus } : d));
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 500 }}>{t('domains.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t('domains.registered', { n: domains.length })}
          </p>
        </div>
        <Btn variant="primary" onClick={() => setShowAdd(true)}>
          {t('domains.addDomain')}
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : domains.length === 0 ? (
        <EmptyState
          icon="🌐"
          title={t('domains.emptyTitle')}
          subtitle={t('domains.emptySubtitle')}
          action={<Btn variant="primary" onClick={() => setShowAdd(true)}>{t('domains.addDomain')}</Btn>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {domains.map(d => (
            <DomainCard
              key={d._id}
              domain={d}
              onDelete={() => handleDelete(d)}
              onEdit={() => setSelectedDomain(d)}
              onToggle={() => handleStatusToggle(d)}
              deleting={deleting === d._id}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddDomainModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load(); show(t('domains.added'), 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}

      {selectedDomain && (
        <EditDomainModal
          domain={selectedDomain}
          onClose={() => setSelectedDomain(null)}
          onSuccess={() => { setSelectedDomain(null); load(); show(t('domains.updated'), 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}
