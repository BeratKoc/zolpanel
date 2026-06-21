'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Spinner, useToast } from '@/components/ui';
import { ConfirmDestructive } from './ConfirmDestructive';

interface SqlConsoleProps {
  connRef: string;
  db: string;
  canWrite: boolean;
}

interface SqlResult {
  columns: string[];
  rows: string[][];
  rowCount: number;
}

interface SqlResponse {
  result?: SqlResult;
  blocked?: boolean;
  destructive?: boolean;
  reason?: string;
  error?: string;
}

export function SqlConsole({ connRef, db, canWrite }: SqlConsoleProps) {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  const [sql, setSql] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [pending, setPending] = useState<{ reason: string } | null>(null);

  // Use refs to read latest sql/db at call time — avoids stale-closure bugs
  const sqlRef = useRef(sql);
  sqlRef.current = sql;
  const dbRef = useRef(db);
  dbRef.current = db;

  async function runSql(opts: { write: boolean; confirm?: boolean }) {
    const currentSql = sqlRef.current.trim();
    const currentDb = dbRef.current;
    if (!currentSql) return;

    setRunning(true);
    try {
      const res = await api.dbxSql(
        connRef,
        { db: currentDb, sql: currentSql },
        { write: opts.write, confirm: opts.confirm },
      ) as SqlResponse;

      if (res.result) {
        setResult(res.result);
        setPending(null);
      } else if (res.blocked && res.destructive) {
        setPending({ reason: res.reason ?? '' });
      } else if (res.error) {
        show(res.error, 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // 403 external read-only → show readOnly label
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('salt-okunur') || msg.toLowerCase().includes('read-only')) {
        show(t('dbx.readOnly'), 'error');
      } else {
        show(msg, 'error');
      }
    } finally {
      setRunning(false);
    }
  }

  function handleRun() {
    runSql({ write: canWrite });
  }

  function handleConfirm() {
    setPending(null);
    runSql({ write: canWrite, confirm: true });
  }

  function handleCancel() {
    setPending(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      <ToastContainer />

      {pending && (
        <ConfirmDestructive
          reason={pending.reason}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* SQL editor area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
        <textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          placeholder="SELECT ..."
          rows={6}
          aria-label={t('dbx.sqlConsole')}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            padding: '10px 12px',
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.55,
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Btn
            variant="primary"
            size="sm"
            onClick={handleRun}
            disabled={running || !sql.trim()}
          >
            {running ? <Spinner size={13} /> : null}
            {t('dbx.run')}
          </Btn>
          {result && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {t('dbx.rowsShown', { n: result.rowCount ?? result.rows.length })}
            </span>
          )}
        </div>
      </div>

      {/* Results grid */}
      {result && (
        <div style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          minHeight: 0,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-elevated)',
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
                {result.columns.map(col => (
                  <th
                    key={col}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-elevated)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  style={{
                    background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                >
                  {row.map((cell, colIdx) => (
                    <td
                      key={colIdx}
                      style={{
                        padding: '5px 10px',
                        borderBottom: '1px solid var(--border)',
                        color: cell === null || cell === undefined
                          ? 'var(--text-muted)'
                          : 'var(--text-primary)',
                        fontStyle: cell === null || cell === undefined ? 'italic' : 'normal',
                        whiteSpace: 'nowrap',
                        maxWidth: '280px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                      }}
                    >
                      {cell === null || cell === undefined ? 'NULL' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={result.columns.length}
                    style={{
                      padding: '24px',
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
      )}
    </div>
  );
}
