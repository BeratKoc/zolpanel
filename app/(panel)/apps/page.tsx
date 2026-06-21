'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Rocket } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast } from '@/components/ui';
import { AppCard } from '@/components/apps/AppCard';
import { CreateAppModal } from '@/components/apps/CreateAppModal';

interface AppRow {
  _id: string;
  name: string;
  repoUrl: string;
  branch: string;
  domain?: string;
  hostPort?: number;
  status: string;
  state?: string;
}

export default function AppsPage() {
  const t = useTranslations();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const data = await api.getApps();
      setApps(data);
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
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('apps.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t('apps.registered', { n: apps.length })}
          </p>
        </div>
        <Btn variant="primary" onClick={() => setShowCreate(true)}>
          {t('apps.create')}
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Rocket size={32} strokeWidth={1.5} />}
          title={t('apps.emptyTitle')}
          subtitle={t('apps.emptySubtitle')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {apps.map(app => (
            <AppCard
              key={app._id}
              app={app}
              onRefresh={() => load()}
              onError={msg => show(msg, 'error')}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAppModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            show(t('apps.create'), 'success');
            load();
          }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}
