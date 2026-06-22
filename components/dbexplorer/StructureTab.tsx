'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Plus, Save, X, Pencil } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner, Btn, useToast } from '@/components/ui';
import { ConfirmDestructive } from './ConfirmDestructive';

interface ColumnDef { name: string; type: string; nullable: boolean; default: string | null; isPk: boolean; }
interface Props { connRef: string; db: string; schema: string; table: string; canWrite: boolean; engine: string; }

// Yıkıcı işlem onayı bekleyen op (confirm sonrası tekrar gönderilir).
interface PendingDestructive { body: Record<string, unknown>; reason: string; }

const PG_TYPE_OPTIONS = ['text', 'varchar(255)', 'integer', 'bigint', 'boolean', 'numeric(10,2)', 'date', 'timestamp', 'uuid', 'jsonb'];
const MY_TYPE_OPTIONS = ['varchar(255)', 'text', 'int', 'bigint', 'tinyint', 'decimal(10,2)', 'date', 'datetime', 'timestamp', 'json'];

export function StructureTab({ connRef, db, schema, table, canWrite, engine }: Props) {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();
  const [cols, setCols] = useState<ColumnDef[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCol, setNewCol] = useState({ name: '', type: '', nullable: true, default: '' });
  const [renaming, setRenaming] = useState<{ name: string; value: string } | null>(null);
  const [pending, setPending] = useState<PendingDestructive | null>(null);

  const typeOptions = engine === 'mysql' ? MY_TYPE_OPTIONS : PG_TYPE_OPTIONS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.dbxStructure(connRef, db, schema, table) as { columns: ColumnDef[] };
      setCols(res.columns);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [connRef, db, schema, table, show]);

  useEffect(() => { load(); }, [load]);

  // Tek DDL gönderim noktası: blocked dönerse onay modalı aç.
  async function runDdl(body: Record<string, unknown>, confirm = false) {
    setBusy(true);
    try {
      const res = await api.dbxDdl(connRef, { db, schema, table, ...body }, { write: canWrite, confirm }) as
        { blocked?: boolean; reason?: string; error?: string };
      if (res.blocked) {
        setPending({ body, reason: res.reason ?? '' });
        return;
      }
      show(t('dbx.save'), 'success');
      setAdding(false);
      setNewCol({ name: '', type: '', nullable: true, default: '' });
      setRenaming(null);
      await load();
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  function confirmPending() {
    if (!pending) return;
    const body = pending.body;
    setPending(null);
    runDdl(body, true);
  }

  if (loading && !cols) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Spinner size={20} /></div>;
  }
  if (!cols) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
      <ToastContainer />
      {pending && (
        <ConfirmDestructive reason={pending.reason} onConfirm={confirmPending} onCancel={() => setPending(null)} />
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: 'auto' }}>
          {cols.length} {t('dbx.columnName')}
        </span>
        {canWrite && !adding && (
          <Btn size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus size={13} strokeWidth={2} />{t('dbx.addColumn')}
          </Btn>
        )}
      </div>

      {/* Add-column formu */}
      {adding && canWrite && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(59,130,246,0.04)', padding: '10px', borderRadius: 'var(--radius)' }}>
          <input
            value={newCol.name}
            onChange={e => setNewCol(p => ({ ...p, name: e.target.value }))}
            placeholder={t('dbx.columnName')}
            style={inputStyle}
          />
          <select value={newCol.type} onChange={e => setNewCol(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
            <option value="">{t('dbx.columnType')}</option>
            {typeOptions.map(ty => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <input
            value={newCol.default}
            onChange={e => setNewCol(p => ({ ...p, default: e.target.value }))}
            placeholder={t('dbx.defaultLabel')}
            style={inputStyle}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={newCol.nullable} onChange={e => setNewCol(p => ({ ...p, nullable: e.target.checked }))} />
            {t('dbx.nullableLabel')}
          </label>
          <button type="button" disabled={busy || !newCol.name || !newCol.type} aria-label={t('dbx.save')}
            onClick={() => runDdl({ op: 'addColumn', name: newCol.name, type: newCol.type, nullable: newCol.nullable, default: newCol.default || null })}
            style={{ ...iconBtn, color: 'var(--green)' }}>
            {busy ? <Spinner size={13} /> : <Save size={14} strokeWidth={2} />}
          </button>
          <button type="button" aria-label={t('dbx.cancel')} onClick={() => { setAdding(false); setNewCol({ name: '', type: '', nullable: true, default: '' }); }} style={{ ...iconBtn, color: 'var(--text-muted)' }}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Kolon tablosu */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr>
              {['', t('dbx.columnName'), t('dbx.columnType'), '', t('dbx.defaultLabel'), canWrite ? ' ' : ''].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cols.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>{t('dbx.structureEmpty')}</td></tr>
            )}
            {cols.map(c => (
              <tr key={c.name}>
                <td style={tdStyle}>{c.isPk && <span style={{ fontSize: '9px', color: 'var(--accent)', fontFamily: 'var(--font-sans)' }}>{t('dbx.colPk')}</span>}</td>
                <td style={{ ...tdStyle, color: 'var(--text-primary)' }}>
                  {renaming?.name === c.name ? (
                    <input autoFocus value={renaming.value} onChange={e => setRenaming({ name: c.name, value: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') runDdl({ op: 'renameColumn', name: c.name, newName: renaming!.value }); if (e.key === 'Escape') setRenaming(null); }}
                      style={inputStyle} />
                  ) : c.name}
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{c.type}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-sans)' }}>{c.nullable ? t('dbx.colNullable') : t('dbx.colNotNull')}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{c.default ?? ''}</td>
                {canWrite && (
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" aria-label={t('dbx.renameColumn')} disabled={busy}
                        onClick={() => setRenaming({ name: c.name, value: c.name })} style={{ ...iconBtn, color: 'var(--text-muted)' }}>
                        <Pencil size={12} strokeWidth={1.75} />
                      </button>
                      <button type="button" aria-label={t('dbx.dropColumn')} disabled={busy}
                        onClick={() => runDdl({ op: 'dropColumn', name: c.name })} style={{ ...iconBtn, color: 'var(--text-muted)' }}>
                        <Trash2 size={12} strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '3px',
  color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 7px', outline: 'none', minWidth: '110px',
};
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px',
  borderRadius: '4px', background: 'transparent', border: 'none', cursor: 'pointer',
};
const thStyle: React.CSSProperties = {
  padding: '6px 10px', textAlign: 'left', fontWeight: 500, color: 'var(--text-muted)',
  background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontSize: '11px', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' };
