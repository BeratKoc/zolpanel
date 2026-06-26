'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api-client';

// xterm.js tarayıcı-only (modül yüklenirken `self`'e dokunur) → SSR'da import etme.
const TerminalView = dynamic(
  () => import('@/components/terminal/Terminal').then(m => ({ default: m.TerminalView })),
  { ssr: false },
);

export default function TerminalPage() {
  const t = useTranslations();
  const [target, setTarget] = useState('host');
  const [containers, setContainers] = useState<string[]>([]);

  useEffect(() => {
    api.listContainers?.().then((cs: { name: string; state?: string }[]) => {
      setContainers(cs.filter(c => c.state === 'running').map(c => c.name));
    }).catch(() => {});
  }, []);

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('terminal.title')}</h2>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {t('terminal.target')}
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-primary)', fontSize: '12px', padding: '4px 8px' }}>
            <option value="host">{t('terminal.host')}</option>
            {containers.map(c => <option key={c} value={c}>{t('terminal.container')}: {c}</option>)}
          </select>
        </label>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalView key={target} target={target} />
      </div>
    </div>
  );
}
