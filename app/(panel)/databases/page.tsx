'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Database, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast, Badge } from '@/components/ui';
import { DatabaseCard } from '@/components/databases/DatabaseCard';
import { CreateDatabaseModal } from '@/components/databases/CreateDatabaseModal';

interface DbRow {
  id: string;
  name: string;
  engine: string;
  state: string;
  hostPort?: number;
}

interface DbxConn {
  ref: string;
  engine: string;
  image: string;
  source: 'panel' | 'external';
}

export default function DatabasesPage() {
  const t = useTranslations();
  const router = useRouter();
  const [databases, setDatabases] = useState<DbRow[]>([]);
  const [connections, setConnections] = useState<DbxConn[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const [dbs, conns] = await Promise.all([
        api.getDatabases(),
        api.dbxConnections().catch(() => [] as DbxConn[]),
      ]);
      setDatabases(dbs);
      setConnections(conns);
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

  const engineColor: Record<string, 'blue' | 'green' | 'red'> = {
    postgres: 'blue',
    mysql: 'green',
    redis: 'red',
  };

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
      ) : (
        <>
          {/* Panel one-click databases section */}
          {databases.length === 0 && connections.length === 0 ? (
            <EmptyState
              icon={<Database size={32} strokeWidth={1.5} />}
              title={t('databases.emptyTitle')}
              subtitle={t('databases.emptySubtitle')}
            />
          ) : (
            <>
              {databases.length > 0 && (
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

              {/* Discovered connections section */}
              {connections.length > 0 && (
                <div style={{ marginTop: databases.length > 0 ? '20px' : '0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {connections.map(conn => (
                      <div
                        key={conn.ref}
                        className="domain-card"
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-lg)',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500 }}>{conn.ref}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                            {conn.image}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Badge color={engineColor[conn.engine] ?? 'default'}>
                            {conn.engine}
                          </Badge>
                          <Badge color={conn.source === 'panel' ? 'blue' : 'default'}>
                            {conn.source === 'panel' ? t('dbx.panel') : t('dbx.external')}
                          </Badge>
                        </div>

                        <button
                          onClick={() => router.push(`/databases/${encodeURIComponent(conn.ref)}`)}
                          title={t('dbx.open')}
                          aria-label={t('dbx.open')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            padding: '4px 10px',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <ExternalLink size={12} strokeWidth={1.75} />
                          {t('dbx.open')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
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
