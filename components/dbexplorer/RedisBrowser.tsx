'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Key, Search, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner, Btn, useToast } from '@/components/ui';

interface RedisBrowserProps {
  connRef: string;
  canWrite: boolean;
}

interface RedisValue {
  type: string;
  value: unknown;
}

export function RedisBrowser({ connRef, canWrite }: RedisBrowserProps) {
  const t = useTranslations();
  const { show, ToastContainer } = useToast();

  const [keys, setKeys] = useState<string[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [searchPattern, setSearchPattern] = useState('');

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyData, setKeyData] = useState<RedisValue | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);

  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasLoaded = useRef(false);

  const fetchKeys = useCallback(async (pattern?: string) => {
    setKeysLoading(true);
    try {
      const result = await api.dbxTree(connRef, undefined, pattern || undefined) as { keys: string[] };
      setKeys(result.keys ?? []);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setKeysLoading(false);
    }
  }, [connRef, show]);

  // Load keys on first render
  if (!hasLoaded.current) {
    hasLoaded.current = true;
    fetchKeys();
  }

  async function selectKey(key: string) {
    setSelectedKey(key);
    setKeyData(null);
    setEditValue('');
    setKeyLoading(true);
    try {
      const result = await api.dbxRows(connRef, { key }) as RedisValue;
      setKeyData(result);
      if (result.type === 'string') {
        setEditValue(typeof result.value === 'string' ? result.value : String(result.value ?? ''));
      }
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setKeyLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedKey || !canWrite) return;
    setSaving(true);
    try {
      await api.dbxRedisSet(connRef, { key: selectedKey, value: editValue }, true);
      show(t('dbx.saveValue'), 'success');
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedKey || !canWrite) return;
    const confirmed = window.confirm(t('dbx.confirmDeleteKey', { key: selectedKey }));
    if (!confirmed) return;
    setDeleting(true);
    try {
      await api.dbxRedisDel(connRef, { key: selectedKey }, true);
      setSelectedKey(null);
      setKeyData(null);
      setEditValue('');
      await fetchKeys(searchPattern || undefined);
      show(t('dbx.deleteKey'), 'success');
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setDeleting(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchKeys(searchPattern || undefined);
  }

  function renderValue(data: RedisValue) {
    const { type, value } = data;

    if (type === 'string') {
      return (
        <textarea
          readOnly={!canWrite}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          style={{
            width: '100%',
            minHeight: '120px',
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            padding: '8px 10px',
            outline: 'none',
            resize: 'vertical',
          }}
        />
      );
    }

    // hash/list/set/zset — render as table/list
    if (type === 'hash' && value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, string>);
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr>
                {['field', 'value'].map(col => (
                  <th key={col} style={{
                    padding: '5px 10px',
                    textAlign: 'left',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(([field, val]) => (
                <tr key={field}>
                  <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--accent)' }}>{field}</td>
                  <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>{String(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if ((type === 'list' || type === 'set' || type === 'zset') && Array.isArray(value)) {
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr>
                <th style={{
                  padding: '5px 10px',
                  textAlign: 'left',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-elevated)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11px',
                  width: '40px',
                }}>#</th>
                <th style={{
                  padding: '5px 10px',
                  textAlign: 'left',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-elevated)',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11px',
                }}>value</th>
              </tr>
            </thead>
            <tbody>
              {(value as string[]).map((item, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{idx}</td>
                  <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>{String(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // Fallback
    return (
      <pre style={{
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-primary)',
        background: 'var(--bg-base)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '10px',
        overflowX: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return (
    <div style={{ display: 'flex', flex: 1, gap: '12px', minHeight: 0, overflow: 'hidden' }}>
      <ToastContainer />

      {/* Left: key list */}
      <div style={{
        width: '240px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        {/* Search bar */}
        <form onSubmit={handleSearchSubmit} style={{ padding: '8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={12} strokeWidth={1.75} style={{
                position: 'absolute', left: '7px', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none',
              }} />
              <input
                type="text"
                value={searchPattern}
                onChange={e => setSearchPattern(e.target.value)}
                placeholder={t('dbx.keySearch')}
                style={{
                  width: '100%',
                  paddingLeft: '24px',
                  paddingRight: '6px',
                  paddingTop: '5px',
                  paddingBottom: '5px',
                  fontSize: '11px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={keysLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '5px 7px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-muted)',
                cursor: keysLoading ? 'not-allowed' : 'pointer',
                opacity: keysLoading ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              {keysLoading ? <Spinner size={12} /> : <Search size={12} strokeWidth={1.75} />}
            </button>
          </div>
        </form>

        {/* Key list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
          {keysLoading && keys.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Spinner size={16} />
            </div>
          ) : keys.length === 0 ? (
            <div style={{
              padding: '20px 12px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}>
              {t('dbx.noKeys')}
            </div>
          ) : (
            keys.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => selectKey(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '6px 8px',
                  background: selectedKey === key ? 'var(--bg-hover)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  color: selectedKey === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (selectedKey !== key) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (selectedKey !== key) e.currentTarget.style.background = 'transparent'; }}
              >
                <Key size={11} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: value panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {!selectedKey ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}>
            {t('dbx.selectKey')}
          </div>
        ) : keyLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={20} />
          </div>
        ) : keyData ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: '12px', overflowY: 'auto', minHeight: 0 }}>
            {/* Key header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <Key size={14} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedKey}
              </span>
            </div>

            {/* Type badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('dbx.keyType')}
              </span>
              <span style={{
                fontSize: '11px',
                padding: '1px 7px',
                borderRadius: '4px',
                background: 'rgba(59,130,246,0.1)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 500,
              }}>
                {keyData.type}
              </span>
            </div>

            {/* Value label */}
            <div style={{ flexShrink: 0 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('dbx.value')}
              </span>
            </div>

            {/* Value content */}
            <div style={{ flex: 1, minHeight: 0 }}>
              {renderValue(keyData)}
            </div>

            {/* Write actions */}
            {canWrite && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                {keyData.type === 'string' && (
                  <Btn
                    size="sm"
                    variant="primary"
                    disabled={saving}
                    onClick={handleSave}
                  >
                    {saving ? <Spinner size={12} /> : <Save size={13} strokeWidth={1.75} />}
                    {t('dbx.saveValue')}
                  </Btn>
                )}
                <Btn
                  size="sm"
                  variant="danger"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? <Spinner size={12} /> : <Trash2 size={13} strokeWidth={1.75} />}
                  {t('dbx.deleteKey')}
                </Btn>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
