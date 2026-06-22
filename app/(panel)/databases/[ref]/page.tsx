'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Database } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner, EmptyState, useToast } from '@/components/ui';
import { DbTree } from '@/components/dbexplorer/DbTree';
import { DataGrid } from '@/components/dbexplorer/DataGrid';
import { SqlConsole } from '@/components/dbexplorer/SqlConsole';
import { RedisBrowser } from '@/components/dbexplorer/RedisBrowser';

interface DbxConn {
  ref: string;
  engine: string;
  image: string;
  source: 'panel' | 'external';
}

interface Selected {
  db: string;
  schema: string;
  table: string;
}

type ActiveTab = 'data' | 'sql';

export default function DbEditorPage() {
  const t = useTranslations();
  const params = useParams();
  const ref = decodeURIComponent(params.ref as string);

  const [conn, setConn] = useState<DbxConn | null>(null);
  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('data');
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    api.dbxConnections()
      .then((conns: DbxConn[]) => {
        const found = conns.find(c => c.ref === ref);
        if (found) {
          setConn(found);
          setCanWrite(found.source !== 'external');
        }
      })
      .catch((e: Error) => show(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [ref]);

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <Spinner size={24} />
      </div>
    );
  }

  if (!conn) {
    return (
      <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
        <ToastContainer />
        <EmptyState
          icon={<Database size={32} strokeWidth={1.5} />}
          title={ref}
          subtitle={t('dbx.tablesEmpty')}
        />
      </div>
    );
  }

  // Redis: full browser with header + read-only toggle
  if (conn.engine === 'redis') {
    return (
      <div className="page" style={{ animation: 'fadeIn 0.2s ease', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <ToastContainer />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('dbx.editorTitle')}</h2>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ref}</span>
          </div>

          {/* Read-only toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {canWrite ? t('dbx.enableEdit') : t('dbx.readOnly')}
            </span>
            <div
              role="switch"
              aria-checked={canWrite}
              onClick={() => setCanWrite(v => !v)}
              style={{
                position: 'relative',
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                background: canWrite ? 'var(--accent)' : 'var(--border-light)',
                transition: 'background 0.2s',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: canWrite ? '19px' : '3px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
          </label>
        </div>

        <RedisBrowser connRef={ref} canWrite={canWrite} />
      </div>
    );
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ToastContainer />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('dbx.editorTitle')}</h2>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ref}</span>
        </div>

        {/* Read-only toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {canWrite ? t('dbx.enableEdit') : t('dbx.readOnly')}
          </span>
          <div
            role="switch"
            aria-checked={canWrite}
            onClick={() => setCanWrite(v => !v)}
            style={{
              position: 'relative',
              width: '36px',
              height: '20px',
              borderRadius: '10px',
              background: canWrite ? 'var(--accent)' : 'var(--border-light)',
              transition: 'background 0.2s',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: '3px',
              left: canWrite ? '19px' : '3px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
        </label>
      </div>

      {/* Main layout: tree left + content right */}
      <div className="dbx-layout">

        {/* Left: DB tree */}
        <div className="dbx-sidebar" style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px',
        }}>
          <DbTree
            connRef={ref}
            engine={conn.engine}
            onSelectTable={(db, schema, table) => {
              setSelected({ db, schema, table });
              setActiveTab('data');
            }}
          />
        </div>

        {/* Right: content area */}
        <div className="dbx-content" style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState
                icon={<Database size={28} strokeWidth={1.5} />}
                title={t('dbx.tablesEmpty')}
              />
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border)',
                padding: '0 16px',
                gap: '4px',
                flexShrink: 0,
              }}>
                {(['data', 'sql'] as ActiveTab[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: activeTab === tab ? 500 : 400,
                      color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'color 0.15s',
                      marginBottom: '-1px',
                    }}
                    onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    {tab === 'data' ? t('dbx.data') : t('dbx.sqlConsole')}
                  </button>
                ))}
              </div>

              {/* Tab content area */}
              <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  {selected.db} / {selected.schema !== 'public' && selected.schema ? `${selected.schema}.` : ''}{selected.table}
                </div>
                {activeTab === 'data' ? (
                  <DataGrid
                    connRef={ref}
                    db={selected.db}
                    schema={selected.schema}
                    table={selected.table}
                    canWrite={canWrite}
                    engine={conn.engine}
                  />
                ) : (
                  <SqlConsole
                    connRef={ref}
                    db={selected?.db ?? ''}
                    canWrite={canWrite}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
