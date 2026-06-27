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
    <div
      className="page"
      style={{
        animation: 'fadeIn 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* h2 required by e2e — visually hidden but still in DOM */}
      <h2
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
      >
        {t('terminal.title')}
      </h2>

      {/* The select must be reachable inside .page for e2e (.page select).
          It lives inside TerminalView's header, which is rendered here. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalView
          key={target}
          target={target}
          containers={containers}
          onTargetChange={setTarget}
        />
      </div>
    </div>
  );
}
