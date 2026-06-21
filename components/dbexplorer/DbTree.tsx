'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Database, Table2, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner } from '@/components/ui';

interface DbNode {
  name: string;
  expanded: boolean;
  loading: boolean;
  tables: { schema: string; table: string }[];
  loaded: boolean;
}

interface DbTreeProps {
  ref: string;
  engine: string;
  onSelectTable: (db: string, schema: string, table: string) => void;
}

export function DbTree({ ref, engine, onSelectTable }: DbTreeProps) {
  const t = useTranslations();
  const [rootLoading, setRootLoading] = useState(true);
  const [dbs, setDbs] = useState<DbNode[]>([]);

  useEffect(() => {
    setRootLoading(true);
    api.dbxTree(ref)
      .then((res: { databases: string[] }) => {
        setDbs((res.databases || []).map(name => ({
          name,
          expanded: false,
          loading: false,
          tables: [],
          loaded: false,
        })));
      })
      .catch(() => {})
      .finally(() => setRootLoading(false));
  }, [ref]);

  async function toggleDb(idx: number) {
    const db = dbs[idx];
    if (db.expanded) {
      setDbs(prev => prev.map((d, i) => i === idx ? { ...d, expanded: false } : d));
      return;
    }
    if (db.loaded) {
      setDbs(prev => prev.map((d, i) => i === idx ? { ...d, expanded: true } : d));
      return;
    }
    setDbs(prev => prev.map((d, i) => i === idx ? { ...d, expanded: true, loading: true } : d));
    try {
      const res: { tables: { schema: string; table: string }[] } = await api.dbxTree(ref, db.name);
      setDbs(prev => prev.map((d, i) =>
        i === idx ? { ...d, loading: false, loaded: true, tables: res.tables || [] } : d,
      ));
    } catch {
      setDbs(prev => prev.map((d, i) =>
        i === idx ? { ...d, loading: false, loaded: true, tables: [] } : d,
      ));
    }
  }

  if (rootLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
        <Spinner size={18} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {dbs.map((db, idx) => (
        <div key={db.name}>
          {/* Database node */}
          <button
            type="button"
            onClick={() => toggleDb(idx)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              padding: '6px 8px',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              textAlign: 'left',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {db.expanded
              ? <ChevronDown size={13} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
              : <ChevronRight size={13} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
            }
            <Database size={13} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--accent)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{db.name}</span>
          </button>

          {/* Tables under this db */}
          {db.expanded && (
            <div style={{ paddingLeft: '22px' }}>
              {db.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px' }}>
                  <Spinner size={12} />
                </div>
              ) : db.tables.length === 0 ? (
                <div style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {t('dbx.tablesEmpty')}
                </div>
              ) : (
                db.tables.map(({ schema, table }) => (
                  <button
                    key={`${schema}.${table}`}
                    type="button"
                    onClick={() => onSelectTable(db.name, schema, table)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      padding: '5px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Table2 size={12} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {schema !== 'public' && schema ? `${schema}.${table}` : table}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
