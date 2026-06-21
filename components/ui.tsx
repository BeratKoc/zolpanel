'use client';

import { useState } from 'react';
import type React from 'react';
import { X, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Button
type BtnVariant = 'default' | 'primary' | 'danger' | 'ghost';
type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps {
  children?: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export function Btn({ children, variant = 'default', size = 'md', onClick, disabled, type = 'button', style, 'aria-label': ariaLabel }: BtnProps) {
  const styles: Record<BtnVariant, React.CSSProperties> = {
    default: {
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-light)',
      color: 'var(--text-primary)',
    },
    primary: {
      background: 'var(--accent)',
      border: '1px solid var(--accent)',
      color: '#fff',
    },
    danger: {
      background: 'transparent',
      border: '1px solid var(--border)',
      color: 'var(--red)',
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'var(--text-secondary)',
    },
  };

  const sizes: Record<BtnSize, React.CSSProperties> = {
    sm: { padding: '4px 10px', fontSize: '12px', borderRadius: '5px' },
    md: { padding: '7px 14px', fontSize: '13px', borderRadius: 'var(--radius)' },
    lg: { padding: '10px 20px', fontSize: '14px', borderRadius: 'var(--radius)' },
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontWeight: 400,
        transition: 'all 0.15s',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        ...styles[variant],
        ...sizes[size],
        ...style,
      }}
      onMouseEnter={e => {
        if (disabled) return;
        if (variant === 'primary') e.currentTarget.style.background = 'var(--accent-hover)';
        else if (variant !== 'ghost') e.currentTarget.style.background = 'var(--bg-hover)';
        else e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={e => {
        if (disabled) return;
        e.currentTarget.style.background = styles[variant].background as string;
        e.currentTarget.style.color = styles[variant].color as string;
      }}
    >
      {children}
    </button>
  );
}

// Badge
type BadgeColor = 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';

interface BadgeProps {
  children?: React.ReactNode;
  color?: BadgeColor;
}

export function Badge({ children, color = 'default' }: BadgeProps) {
  const colors: Record<BadgeColor, { bg: string; color: string }> = {
    default: { bg: 'var(--bg-hover)', color: 'var(--text-secondary)' },
    green: { bg: 'rgba(34,197,94,0.1)', color: 'var(--green)' },
    yellow: { bg: 'rgba(245,158,11,0.1)', color: 'var(--yellow)' },
    red: { bg: 'rgba(239,68,68,0.1)', color: 'var(--red)' },
    blue: { bg: 'rgba(59,130,246,0.1)', color: 'var(--accent)' },
    purple: { bg: 'rgba(167,139,250,0.1)', color: 'var(--purple)' },
  };
  const c = colors[color] || colors.default;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 400,
      background: c.bg,
      color: c.color,
      fontFamily: 'var(--font-sans)',
    }}>
      {children}
    </span>
  );
}

// StatusDot
interface StatusDotProps {
  status: string;
}

export function StatusDot({ status }: StatusDotProps) {
  const colors: Record<string, string> = {
    active: 'var(--green)',
    offline: 'var(--red)',
    pending: 'var(--yellow)',
    online: 'var(--green)',
    stopped: 'var(--red)',
    errored: 'var(--red)',
  };
  const isPulsing = status === 'active' || status === 'online';
  return (
    <span style={{
      display: 'inline-block',
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: colors[status] || 'var(--text-muted)',
      flexShrink: 0,
      animation: isPulsing ? 'pulse 2s infinite' : 'none',
    }} />
  );
}

// Spinner
interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 16 }: SpinnerProps) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: '2px solid var(--border-light)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// Modal
interface ModalProps {
  title?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 480 }: ModalProps) {
  const t = useTranslations();
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: `min(${width}px, calc(100vw - 24px))`,
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflow: 'auto',
        animation: 'fadeIn 0.2s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>{title}</span>
          <Btn variant="ghost" size="sm" onClick={onClose} style={{ padding: '4px 6px' }} aria-label={t('common.close')}><X size={16} strokeWidth={1.75} /></Btn>
        </div>
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// FormField
interface FormFieldProps {
  label?: React.ReactNode;
  children?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export function FormField({ label, children, hint, error }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '6px',
          fontWeight: 400,
        }}>
          {label}
        </label>
      )}
      {children}
      {hint && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>{error}</p>
      )}
    </div>
  );
}

// Toast notification
type ToastType = 'info' | 'error' | 'success';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  };

  const ToastContainer = () => (
    <div className="toast-wrap" style={{
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: 999, display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'var(--bg-elevated)',
          border: `1px solid ${t.type === 'error' ? 'var(--red)' : t.type === 'success' ? 'var(--green)' : 'var(--border-light)'}`,
          borderRadius: 'var(--radius)',
          padding: '10px 16px',
          fontSize: '13px',
          color: 'var(--text-primary)',
          animation: 'fadeIn 0.2s ease',
          maxWidth: '320px',
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );

  return { show, ToastContainer };
}

// Empty state
interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 20px', gap: '12px',
      color: 'var(--text-muted)',
    }}>
      <span style={{ fontSize: '32px', opacity: 0.4 }}>{icon}</span>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>{title}</p>
      {subtitle && <p style={{ fontSize: '12px', textAlign: 'center', maxWidth: 280 }}>{subtitle}</p>}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
}

// Metric card
interface MetricCardProps {
  label?: React.ReactNode;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  // Verilirse sağ üstte bir (i) ikonu çıkar; tıklayınca açıklama pop-up'ı açılır.
  info?: string;
}

export function MetricCard({ label, value, sub, color, info }: MetricCardProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      position: 'relative',
    }}>
      {info && (
        <>
          <button
            type="button"
            aria-label={info}
            title={info}
            aria-expanded={infoOpen}
            onClick={() => setInfoOpen(o => !o)}
            className="icon-btn"
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: '50%',
              color: infoOpen ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: 'pointer', padding: 0,
            }}
          >
            <Info size={15} strokeWidth={1.75} />
          </button>
          {infoOpen && (
            <>
              {/* dışarı tıklayınca kapat */}
              <div onClick={() => setInfoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div role="tooltip" style={{
                position: 'absolute', top: 36, right: 8, zIndex: 41,
                width: 260, maxWidth: '80vw',
                background: 'var(--bg-base)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius)', padding: '12px 14px',
                fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                textAlign: 'left', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
                whiteSpace: 'normal',
              }}>
                {info}
              </div>
            </>
          )}
        </>
      )}
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingRight: info ? '24px' : 0 }}>
        {label}
      </p>
      <p className="tabular" style={{ fontSize: '24px', fontWeight: 500, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</p>}
    </div>
  );
}
