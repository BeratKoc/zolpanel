'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  SquareTerminal,
  Minus,
  Plus,
  Eraser,
  Maximize2,
  Minimize2,
  RotateCw,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui';

/* ── types ─────────────────────────────────────────────────────────────── */
interface TerminalViewProps {
  target: string;
  containers: string[];
  onTargetChange: (t: string) => void;
}

/* ── icon button ────────────────────────────────────────────────────────── */
function IconBtn({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius)',
        color: danger ? 'var(--red)' : 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'background 150ms ease, color 150ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
        (e.currentTarget as HTMLButtonElement).style.color = danger
          ? 'var(--red)'
          : 'var(--text-primary)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = danger
          ? 'var(--red)'
          : 'var(--text-secondary)';
      }}
    >
      {children}
    </button>
  );
}

/* ── main component ─────────────────────────────────────────────────────── */
export function TerminalView({ target, containers, onTargetChange }: TerminalViewProps) {
  const t = useTranslations();
  const { show } = useToast();

  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef('');

  const [closed, setClosed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [fontSize, setFontSize] = useState(13);
  const [fullscreen, setFullscreen] = useState(false);

  /* ── fit + resize helper (stable ref) ───────────────────────────────── */
  const doResize = useCallback(() => {
    if (!fitRef.current || !termRef.current) return;
    fitRef.current.fit();
    const id = sessionIdRef.current;
    if (id) {
      api.terminalResize(id, termRef.current.cols, termRef.current.rows).catch(() => {});
    }
  }, []);

  /* ── xterm session lifecycle ─────────────────────────────────────────── */
  useEffect(() => {
    if (!hostRef.current) return;
    let aborted = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const term = new XTerm({
      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
      fontSize,
      cursorBlink: true,
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#3b82f6',
        selectionBackground: '#3b82f640',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Hoisted to effect scope so cleanup can always remove it regardless of
    // whether boot() succeeded or threw (fixes resize-listener leak on error).
    let onWinResize: (() => void) | undefined;

    const token =
      typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';

    async function boot() {
      try {
        const res = (await api.terminalCreate(target)) as {
          sessionId: string;
          error?: string;
        };
        if (aborted) return;
        sessionIdRef.current = res.sessionId;

        term.onData(d => {
          api.terminalInput(res.sessionId, d).catch(() => {});
        });

        onWinResize = () => {
          if (fitRef.current && termRef.current) {
            fitRef.current.fit();
            api
              .terminalResize(res.sessionId, termRef.current.cols, termRef.current.rows)
              .catch(() => {});
          }
        };
        window.addEventListener('resize', onWinResize);

        fitRef.current?.fit();
        api
          .terminalResize(res.sessionId, term.cols, term.rows)
          .catch(() => {});

        // stream
        const stream = await fetch(
          `/api/terminal/${encodeURIComponent(res.sessionId)}/stream`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!stream.body) throw new Error('stream yok');
        reader = stream.body.getReader();
        const decoder = new TextDecoder();

        setConnected(true);

        while (!aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          term.write(decoder.decode(value, { stream: true }));
        }

        if (!aborted) {
          setConnected(false);
          setClosed(true);
        }
      } catch (e: unknown) {
        if (!aborted) {
          show(e instanceof Error ? e.message : String(e), 'error');
          setConnected(false);
          setClosed(true);
        }
      }
    }

    boot();

    return () => {
      aborted = true;
      reader?.cancel().catch(() => {});
      if (onWinResize) window.removeEventListener('resize', onWinResize);
      const id = sessionIdRef.current;
      if (id) api.terminalDelete(id).catch(() => {});
      sessionIdRef.current = '';
      termRef.current = null;
      fitRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reconnectKey, show]);

  /* ── escape key exits fullscreen ─────────────────────────────────────── */
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  /* ── re-fit after fullscreen toggle ──────────────────────────────────── */
  useEffect(() => {
    const id = setTimeout(doResize, 80);
    return () => clearTimeout(id);
  }, [fullscreen, doResize]);

  /* ── font size ───────────────────────────────────────────────────────── */
  const changeFontSize = useCallback(
    (delta: number) => {
      setFontSize(prev => {
        const next = Math.min(20, Math.max(11, prev + delta));
        if (termRef.current) {
          termRef.current.options.fontSize = next;
          setTimeout(doResize, 30);
        }
        return next;
      });
    },
    [doResize],
  );

  /* ── clear ───────────────────────────────────────────────────────────── */
  const clearTerminal = useCallback(() => {
    termRef.current?.clear();
  }, []);

  /* ── reconnect ───────────────────────────────────────────────────────── */
  const reconnect = useCallback(() => {
    setClosed(false);
    setConnected(false);
    setReconnectKey(k => k + 1);
  }, []);

  /* ── shared styles ───────────────────────────────────────────────────── */
  const windowStyle: React.CSSProperties = fullscreen
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-base)',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      };

  return (
    <div style={windowStyle}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 8px',
          height: '44px',
          flexShrink: 0,
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          rowGap: '4px',
        }}
      >
        {/* left: icon + title + target selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 auto', minWidth: 0 }}>
          <SquareTerminal size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {t('terminal.title')}
          </span>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ display: 'none' }} aria-hidden="true">{t('terminal.target')}</span>
            <select
              value={target}
              onChange={e => onTargetChange(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                padding: '4px 8px',
                height: '28px',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '180px',
              }}
            >
              <option value="host">{t('terminal.host')}</option>
              {containers.map(c => (
                <option key={c} value={c}>
                  {t('terminal.container')}: {c}
                </option>
              ))}
            </select>
          </label>

          {/* connection status: color + text (satisfies color-not-only rule) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              color: connected ? 'var(--green)' : 'var(--red)',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: connected ? 'var(--green)' : 'var(--red)',
                flexShrink: 0,
                boxShadow: connected ? '0 0 6px var(--green)' : 'none',
              }}
            />
            {connected ? t('terminal.connected') : t('terminal.disconnected')}
          </div>
        </div>

        {/* right: toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <IconBtn onClick={() => changeFontSize(-1)} title={t('terminal.fontDecrease')}>
            <Minus size={14} />
          </IconBtn>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
              minWidth: '22px',
              textAlign: 'center',
              userSelect: 'none',
            }}
          >
            {fontSize}
          </span>
          <IconBtn onClick={() => changeFontSize(1)} title={t('terminal.fontIncrease')}>
            <Plus size={14} />
          </IconBtn>

          <div
            style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px', flexShrink: 0 }}
          />

          <IconBtn onClick={clearTerminal} title={t('terminal.clear')}>
            <Eraser size={14} />
          </IconBtn>

          <IconBtn onClick={reconnect} title={t('terminal.reconnect')}>
            <RotateCw size={14} />
          </IconBtn>

          <div
            style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px', flexShrink: 0 }}
          />

          <IconBtn
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? t('terminal.exitFullscreen') : t('terminal.fullscreen')}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </IconBtn>
        </div>
      </div>

      {/* ── TERMINAL BODY ──────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          background: '#0d0d0d',
          padding: '10px',
          overflow: 'hidden',
        }}
        onClick={() => termRef.current?.focus()}
      >
        {/* xterm mount point */}
        <div ref={hostRef} style={{ width: '100%', height: '100%' }} />

        {/* closed overlay */}
        {closed && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              background: 'rgba(13,13,13,0.88)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <SquareTerminal size={36} style={{ color: 'var(--text-muted)' }} />
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              {t('terminal.disconnected')}
            </p>
            <button
              type="button"
              onClick={reconnect}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                padding: '9px 20px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                transition: 'background 150ms ease',
              }}
              onMouseEnter={e =>
                ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)')
              }
              onMouseLeave={e =>
                ((e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)')
              }
            >
              <RotateCw size={14} />
              {t('terminal.reconnect')}
            </button>
          </div>
        )}
      </div>

      <style>{`
        /* xterm inside our window */
        .xterm { height: 100% !important; }
        .xterm-viewport { border-radius: 0 !important; }

        /* scrollbar */
        .xterm-viewport::-webkit-scrollbar { width: 6px; }
        .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
        .xterm-viewport::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
        .xterm-viewport::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

        /* select focus ring */
        select:focus {
          outline: 2px solid var(--accent);
          outline-offset: 1px;
        }

        /* mobile: no horizontal overflow — handled via inline flexWrap on header */
      `}</style>
    </div>
  );
}
