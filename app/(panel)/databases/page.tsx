'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Database } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast } from '@/components/ui';
import { DatabaseCard } from '@/components/databases/DatabaseCard';
import { CreateDatabaseModal } from '@/components/databases/CreateDatabaseModal';

interface DbRow {
  id: string;
  name: string;
  engine: string;
  state: string;
  hostPort?: number;
}

export default function DatabasesPage() {
  const t = useTranslations();
  const [databases, setDatabases] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const data = await api.getDatabases();
      setDatabases(data);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('databases.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t('databases.registered', { n: databases.length })}
          </p>
        </div>
        <Btn variant="primary" onClick={() => setShowCreate(true)}>
          {t('databases.create')}
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : databases.length === 0 ? (
        <EmptyState
          icon={<Database size={32} strokeWidth={1.5} />}
          title={t('databases.emptyTitle')}
          subtitle={t('databases.emptySubtitle')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {databases.map(db => (
            <DatabaseCard
              key={db.id}
              db={db}
              onDeleted={() => {
                show(db.name || db.id, 'success');
                load();
              }}
              onError={msg => show(msg, 'error')}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDatabaseModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            show(t('databases.create'), 'success');
            load();
          }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}
