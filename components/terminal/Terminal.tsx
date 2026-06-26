'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui';

export function TerminalView({ target }: { target: string }) {
  const t = useTranslations();
  const { show } = useToast();
  const hostRef = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);

  useEffect(() => {
    if (!hostRef.current) return;
    let aborted = false;
    let sessionId = '';
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let cleanupResize: (() => void) | undefined;
    const term = new XTerm({
      fontFamily: 'var(--font-mono), monospace', fontSize: 13, cursorBlink: true,
      theme: { background: '#0d0d0d', foreground: '#e8e8e8' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';

    async function boot() {
      try {
        const res = await api.terminalCreate(target) as { sessionId: string; error?: string };
        if (aborted) return;
        sessionId = res.sessionId;
        term.onData((d) => { api.terminalInput(sessionId, d).catch(() => {}); });
        const doResize = () => {
          fit.fit();
          api.terminalResize(sessionId, term.cols, term.rows).catch(() => {});
        };
        window.addEventListener('resize', doResize);
        cleanupResize = () => window.removeEventListener('resize', doResize);
        doResize();

        // Output stream — fetch reader (Authorization header; not EventSource)
        const stream = await fetch(`/api/terminal/${encodeURIComponent(sessionId)}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!stream.body) throw new Error('stream yok');
        reader = stream.body.getReader();
        const decoder = new TextDecoder();
        while (!aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          term.write(decoder.decode(value, { stream: true }));
        }
        if (!aborted) setClosed(true);
      } catch (e: unknown) {
        if (!aborted) { show(e instanceof Error ? e.message : String(e), 'error'); setClosed(true); }
      }
    }
    boot();

    return () => {
      aborted = true;
      reader?.cancel().catch(() => {});
      cleanupResize?.();
      if (sessionId) api.terminalDelete(sessionId).catch(() => {});
      term.dispose();
    };
  }, [target, reconnectKey, show]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, background: '#0d0d0d', borderRadius: 'var(--radius)', padding: '8px', overflow: 'hidden' }} />
      {closed && (
        <div style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {t('terminal.disconnected')}
          <button type="button" onClick={() => { setClosed(false); setReconnectKey(k => k + 1); }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '5px 12px', cursor: 'pointer', fontSize: '12px' }}>
            {t('terminal.reconnect')}
          </button>
        </div>
      )}
    </div>
  );
}
