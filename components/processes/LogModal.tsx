'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Modal, Spinner } from '@/components/ui';

export function LogModal({ name, onClose }: { name: string; onClose: () => void }) {
  const t = useTranslations();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getProcessLogs(name, lines);
      setLogs(data.logs || t('processes.logNotFound'));
    } catch (e: any) {
      setLogs(t('processes.logFetchFailed') + ' ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [lines]);

  return (
    <Modal title={t('processes.logsTitle', { name })} onClose={onClose} width={720}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('processes.last')}</span>
        {[50, 100, 200].map(n => (
          <Btn
            key={n}
            size="sm"
            variant={lines === n ? 'primary' : 'default'}
            onClick={() => setLines(n)}
          >
            {t('processes.lines', { n })}
          </Btn>
        ))}
        <Btn size="sm" variant="ghost" onClick={load}><RotateCw size={12} strokeWidth={1.75} /></Btn>
      </div>

      <div style={{
        background: 'var(--bg-base)',
        borderRadius: 'var(--radius)',
        padding: '12px',
        height: '360px',
        overflow: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <Spinner />
          </div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{logs}</pre>
        )}
      </div>
    </Modal>
  );
}
