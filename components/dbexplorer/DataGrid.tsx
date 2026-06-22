'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2, Plus, Save, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner, Btn, useToast } from '@/components/ui';

interface DataGridProps {
  connRef: string;
  db: string;
  schema: string;
  table: string;
  canWrite: boolean;
  engine: string;
}

interface GridData {
  columns: string[];
  rows: string[][];
  pk: string[];
}

interface EditingCell {
  rowIdx: number;
  colIdx: number;
  value: string;
}

interface NewRow {
  [col: string]: string;
}

const LIMIT = 50;

export function DataGrid({ connRef, db, schema, table, canWrite, engine }: DataGridProps) {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  const [data, setData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [savingCell, setSavingCell] = useState(false);

  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow] = useState<NewRow>({});
  const [savingRow, setSavingRow] = useState(false);

  const [deletingRowIdx, setDeletingRowIdx] = useState<number | null>(null);

  const cellInputRef = useRef<HTMLInputElement>(null);

  const fetchRows = useCallback(async (currentOffset: number) => {
    setLoading(true);
    try {
      const result = await api.dbxRows(connRef, {
        db,
        schema,
        table,
        limit: String(LIMIT),
        offset: String(currentOffset),
      });
      setData(result as GridData);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [connRef, db, schema, table, show]);

  useEffect(() => {
    setOffset(0);
    setEditingCell(null);
    setAddingRow(false);
    setNewRow({});
  }, [connRef, db, schema, table]);

  useEffect(() => {
    fetchRows(offset);
  }, [fetchRows, offset]);

  useEffect(() => {
    if (editingCell && cellInputRef.current) {
      cellInputRef.current.focus();
      cellInputRef.current.select();
    }
  }, [editingCell]);

  function buildPk(rowData: string[], columns: string[], pkCols: string[]): Record<string, string> {
    const pk: Record<string, string> = {};
    for (const pkCol of pkCols) {
      const idx = columns.indexOf(pkCol);
      if (idx !== -1) pk[pkCol] = rowData[idx] ?? '';
    }
    return pk;
  }

  function handleCellClick(rowIdx: number, colIdx: number, value: string) {
    if (!canWrite || !data || data.pk.length === 0) return;
    if (savingCell) return;
    setEditingCell({ rowIdx, colIdx, value });
  }

  async function commitCellEdit() {
    if (!editingCell || !data) return;
    const { rowIdx, colIdx, value } = editingCell;
    const original = data.rows[rowIdx][colIdx] ?? '';
    if (value === original) {
      setEditingCell(null);
      return;
    }
    const col = data.columns[colIdx];
    const pkObj = buildPk(data.rows[rowIdx], data.columns, data.pk);
    setSavingCell(true);
    try {
      await api.dbxRowUpdate(connRef, { db, schema, table, values: { [col]: value }, pk: pkObj }, canWrite);
      setData(prev => {
        if (!prev) return prev;
        const updated = prev.rows.map((row, ri) =>
          ri === rowIdx ? row.map((cell, ci) => ci === colIdx ? value : cell) : row,
        );
        return { ...prev, rows: updated };
      });
      show(t('dbx.save'), 'success');
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSavingCell(false);
      setEditingCell(null);
    }
  }

  function handleCellKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCellEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }

  async function handleAddRow() {
    if (!data) return;
    const values: Record<string, string> = {};
    for (const col of data.columns) {
      if (newRow[col] !== undefined && newRow[col] !== '') {
        values[col] = newRow[col];
      }
    }
    setSavingRow(true);
    try {
      await api.dbxRowInsert(connRef, { db, schema, table, values }, canWrite);
      setAddingRow(false);
      setNewRow({});
      await fetchRows(offset);
      show(t('dbx.save'), 'success');
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSavingRow(false);
    }
  }

  async function handleDeleteRow(rowIdx: number) {
    if (!data) return;
    const pkObj = buildPk(data.rows[rowIdx], data.columns, data.pk);
    const confirmed = window.confirm(t('dbx.deleteRow') + '?');
    if (!confirmed) return;
    setDeletingRowIdx(rowIdx);
    try {
      await api.dbxRowDelete(connRef, { db, schema, table, pk: pkObj }, canWrite);
      await fetchRows(offset);
      show(t('dbx.deleteRow'), 'success');
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setDeletingRowIdx(null);
    }
  }

  const hasPk = data ? data.pk.length > 0 : false;
  const canEdit = canWrite && hasPk;
  const canDelete = canWrite && hasPk;

  if (loading && !data) {
    return <GridSkeleton />;
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <ToastContainer />

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0 8px 0',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Row count */}
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: 'auto' }}>
          {t('dbx.rowsShown', { n: data.rows.length })}
          {!hasPk && canWrite && (
            <span style={{
              marginLeft: '10px',
              color: 'var(--yellow)',
              background: 'rgba(245,158,11,0.08)',
              borderRadius: '4px',
              padding: '2px 7px',
              fontSize: '11px',
            }}>
              {t('dbx.noPk')}
            </span>
          )}
        </span>

        {/* Pagination */}
        <Btn
          size="sm"
          variant="default"
          disabled={offset === 0 || loading}
          onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
        >
          {t('dbx.prev')}
        </Btn>
        <Btn
          size="sm"
          variant="default"
          disabled={data.rows.length < LIMIT || loading}
          onClick={() => setOffset(o => o + LIMIT)}
        >
          {t('dbx.next')}
        </Btn>

        {/* Add row */}
        {canWrite && !addingRow && (
          <Btn
            size="sm"
            variant="primary"
            onClick={() => { setAddingRow(true); setNewRow({}); }}
          >
            <Plus size={13} strokeWidth={2} />
            {t('dbx.addRow')}
          </Btn>
        )}
      </div>

      {/* Refetch progress (içerik kaybolmaz) */}
      {loading && data && <div className="progress-indeterminate" aria-hidden="true" />}

      {/* Table */}
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'auto',
        minHeight: 0,
        opacity: loading && data ? 0.55 : 1,
        pointerEvents: loading && data ? 'none' : 'auto',
        transition: 'opacity 0.15s',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          tableLayout: 'auto',
        }}>
          <thead>
            <tr>
              {(canWrite) && (
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-elevated)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  width: '32px',
                }} />
              )}
              {data.columns.map(col => (
                <th
                  key={col}
                  style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontWeight: 500,
                    color: data.pk.includes(col) ? 'var(--accent)' : 'var(--text-secondary)',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  {col}
                  {data.pk.includes(col) && (
                    <span style={{ marginLeft: '4px', fontSize: '9px', opacity: 0.7, fontFamily: 'var(--font-sans)' }}>PK</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* New row inputs — canWrite kapanırsa formu da gizle (salt-okunur tutarlılığı) */}
            {addingRow && canWrite && (
              <tr style={{ background: 'rgba(59,130,246,0.04)' }}>
                {canWrite && (
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        disabled={savingRow}
                        onClick={handleAddRow}
                        aria-label={t('dbx.save')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '3px', borderRadius: '4px',
                          background: 'transparent', border: 'none',
                          color: 'var(--green)', cursor: savingRow ? 'not-allowed' : 'pointer',
                          opacity: savingRow ? 0.5 : 1,
                        }}
                      >
                        {savingRow ? <Spinner size={13} /> : <Save size={13} strokeWidth={2} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingRow(false); setNewRow({}); }}
                        aria-label={t('dbx.cancel')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '3px', borderRadius: '4px',
                          background: 'transparent', border: 'none',
                          color: 'var(--text-muted)', cursor: 'pointer',
                        }}
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                )}
                {data.columns.map(col => (
                  <td key={col} style={{ padding: '2px 4px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      value={newRow[col] ?? ''}
                      onChange={e => setNewRow(prev => ({ ...prev, [col]: e.target.value }))}
                      placeholder={col}
                      style={{
                        width: '100%',
                        minWidth: '80px',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--accent)',
                        borderRadius: '3px',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        padding: '3px 6px',
                        outline: 'none',
                      }}
                    />
                  </td>
                ))}
              </tr>
            )}

            {/* Data rows */}
            {data.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                style={{
                  background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'; }}
              >
                {/* Row actions */}
                {canWrite && (
                  <td style={{ padding: '2px 6px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle', width: '32px' }}>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={deletingRowIdx === rowIdx}
                        onClick={() => handleDeleteRow(rowIdx)}
                        aria-label={t('dbx.deleteRow')}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: '3px', borderRadius: '4px',
                          background: 'transparent', border: 'none',
                          color: 'var(--text-muted)', cursor: deletingRowIdx === rowIdx ? 'not-allowed' : 'pointer',
                          opacity: deletingRowIdx === rowIdx ? 0.5 : 1,
                          transition: 'color 0.1s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        {deletingRowIdx === rowIdx ? <Spinner size={12} /> : <Trash2 size={12} strokeWidth={1.75} />}
                      </button>
                    )}
                  </td>
                )}

                {/* Data cells */}
                {row.map((cell, colIdx) => {
                  const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === colIdx;
                  return (
                    <td
                      key={colIdx}
                      onClick={() => handleCellClick(rowIdx, colIdx, cell ?? '')}
                      style={{
                        padding: isEditing ? '2px 4px' : '5px 10px',
                        borderBottom: '1px solid var(--border)',
                        color: cell === null || cell === undefined
                          ? 'var(--text-muted)'
                          : 'var(--text-primary)',
                        fontStyle: cell === null || cell === undefined ? 'italic' : 'normal',
                        cursor: canEdit ? 'text' : 'default',
                        maxWidth: '280px',
                        verticalAlign: 'middle',
                        whiteSpace: isEditing ? 'normal' : 'nowrap',
                        overflow: isEditing ? 'visible' : 'hidden',
                        textOverflow: isEditing ? 'clip' : 'ellipsis',
                      }}
                    >
                      {isEditing ? (
                        <input
                          ref={cellInputRef}
                          value={editingCell.value}
                          onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : prev)}
                          onBlur={commitCellEdit}
                          onKeyDown={handleCellKeyDown}
                          disabled={savingCell}
                          style={{
                            width: '100%',
                            minWidth: '120px',
                            background: 'var(--bg-base)',
                            border: '1px solid var(--accent)',
                            borderRadius: '3px',
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            padding: '3px 6px',
                            outline: 'none',
                          }}
                        />
                      ) : (
                        cell === null || cell === undefined ? 'NULL' : String(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {data.rows.length === 0 && !addingRow && (
              <tr>
                <td
                  colSpan={data.columns.length + (canWrite ? 1 : 0)}
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {t('dbx.tablesEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 4px' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
