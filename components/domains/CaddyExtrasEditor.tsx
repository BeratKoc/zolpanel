'use client';

import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { FormField } from '@/components/ui';

// ---------------------------------------------------------------------------
// Types (client-side mirror — do NOT import from server db.ts)
// ---------------------------------------------------------------------------

export interface CaddyExtrasValue {
  headers: { key: string; value: string }[];
  redirects: { from: string; to: string; permanent: boolean }[];
  basicAuth: { username: string; password: string }[]; // password '' = unchanged / none
  ipMode: 'allow' | 'deny';
  ipCidrs: string; // textarea, newline/comma separated; parsed on submit by the modal
}

export function emptyCaddyExtras(): CaddyExtrasValue {
  return { headers: [], redirects: [], basicAuth: [], ipMode: 'deny', ipCidrs: '' };
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Editor value -> API caddyExtras (only include non-empty parts) */
export function toCaddyExtrasPayload(v: CaddyExtrasValue) {
  const cidrs = v.ipCidrs
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const payload: any = {};
  if (v.headers.length)
    payload.headers = v.headers.filter((h) => h.key.trim());
  if (v.redirects.length)
    payload.redirects = v.redirects.filter((r) => r.from.trim() && r.to.trim());
  if (v.basicAuth.length)
    payload.basicAuth = v.basicAuth
      .filter((u) => u.username.trim())
      .map((u) => ({
        username: u.username.trim(),
        ...(u.password ? { password: u.password } : {}),
      }));
  if (cidrs.length) payload.ipRules = { mode: v.ipMode, cidrs };
  return Object.keys(payload).length ? payload : undefined;
}

/** Existing domain.caddyExtras -> editor value (for EditModal init) */
export function fromDomainCaddyExtras(x: any): CaddyExtrasValue {
  return {
    headers: x?.headers ?? [],
    redirects: x?.redirects ?? [],
    basicAuth: (x?.basicAuth ?? []).map((u: any) => ({
      username: u.username,
      password: '',
    })),
    ipMode: x?.ipRules?.mode ?? 'deny',
    ipCidrs: (x?.ipRules?.cidrs ?? []).join(', '),
  };
}

// ---------------------------------------------------------------------------
// Shared icon-button style
// ---------------------------------------------------------------------------

const iconBtnStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--red)',
  cursor: 'pointer',
  padding: 0,
};

const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'transparent',
  border: '1px dashed var(--border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  padding: '4px 10px',
  cursor: 'pointer',
  marginTop: '4px',
};

const sectionHeadStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '6px',
  marginTop: '4px',
};

const wrapStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: '16px',
  marginTop: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  value: CaddyExtrasValue;
  onChange: (v: CaddyExtrasValue) => void;
}

export function CaddyExtrasEditor({ value, onChange }: Props) {
  const t = useTranslations();

  // ---- Headers ------------------------------------------------------------

  function addHeader() {
    onChange({ ...value, headers: [...value.headers, { key: '', value: '' }] });
  }
  function removeHeader(i: number) {
    onChange({ ...value, headers: value.headers.filter((_, idx) => idx !== i) });
  }
  function updateHeader(i: number, field: 'key' | 'value', val: string) {
    onChange({
      ...value,
      headers: value.headers.map((h, idx) =>
        idx === i ? { ...h, [field]: val } : h
      ),
    });
  }

  // ---- Redirects ----------------------------------------------------------

  function addRedirect() {
    onChange({
      ...value,
      redirects: [...value.redirects, { from: '', to: '', permanent: false }],
    });
  }
  function removeRedirect(i: number) {
    onChange({ ...value, redirects: value.redirects.filter((_, idx) => idx !== i) });
  }
  function updateRedirect(
    i: number,
    field: 'from' | 'to' | 'permanent',
    val: string | boolean
  ) {
    onChange({
      ...value,
      redirects: value.redirects.map((r, idx) =>
        idx === i ? { ...r, [field]: val } : r
      ),
    });
  }

  // ---- Basic-Auth ---------------------------------------------------------

  function addUser() {
    onChange({ ...value, basicAuth: [...value.basicAuth, { username: '', password: '' }] });
  }
  function removeUser(i: number) {
    onChange({ ...value, basicAuth: value.basicAuth.filter((_, idx) => idx !== i) });
  }
  function updateUser(i: number, field: 'username' | 'password', val: string) {
    onChange({
      ...value,
      basicAuth: value.basicAuth.map((u, idx) =>
        idx === i ? { ...u, [field]: val } : u
      ),
    });
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div style={wrapStyle}>
      {/* Section title */}
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {t('domains.caddyAdvanced')}
      </div>

      {/* --- Headers --- */}
      <div>
        <div style={sectionHeadStyle}>{t('domains.headers')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {value.headers.map((h, i) => (
            <div key={i} className="route-row">
              <input
                placeholder={t('domains.headerKey')}
                value={h.key}
                onChange={(e) => updateHeader(i, 'key', e.target.value)}
                style={{ flex: 1 }}
                aria-label={t('domains.headerKey')}
              />
              <input
                placeholder={t('domains.headerValue')}
                value={h.value}
                onChange={(e) => updateHeader(i, 'value', e.target.value)}
                style={{ flex: 2 }}
                aria-label={t('domains.headerValue')}
              />
              <button
                type="button"
                onClick={() => removeHeader(i)}
                aria-label={t('domains.removeRoute')}
                style={iconBtnStyle}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addHeader} style={addBtnStyle}>
          <Plus size={12} strokeWidth={2} />
          {t('domains.addHeader')}
        </button>
      </div>

      {/* --- Redirects --- */}
      <div>
        <div style={sectionHeadStyle}>{t('domains.redirects')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {value.redirects.map((r, i) => (
            <div key={i} className="route-row">
              <input
                placeholder={t('domains.redirectFrom')}
                value={r.from}
                onChange={(e) => updateRedirect(i, 'from', e.target.value)}
                style={{ flex: 2 }}
                aria-label={t('domains.redirectFrom')}
              />
              <input
                placeholder={t('domains.redirectTo')}
                value={r.to}
                onChange={(e) => updateRedirect(i, 'to', e.target.value)}
                style={{ flex: 2 }}
                aria-label={t('domains.redirectTo')}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={r.permanent}
                  onChange={(e) => updateRedirect(i, 'permanent', e.target.checked)}
                  style={{ margin: 0 }}
                />
                {t('domains.permanent')}
              </label>
              <button
                type="button"
                onClick={() => removeRedirect(i)}
                aria-label={t('domains.removeRoute')}
                style={iconBtnStyle}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRedirect} style={addBtnStyle}>
          <Plus size={12} strokeWidth={2} />
          {t('domains.addRedirect')}
        </button>
      </div>

      {/* --- Basic-Auth --- */}
      <div>
        <div style={sectionHeadStyle}>{t('domains.basicAuth')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {value.basicAuth.map((u, i) => (
            <div key={i} className="route-row">
              <input
                placeholder={t('domains.baUsername')}
                value={u.username}
                onChange={(e) => updateUser(i, 'username', e.target.value)}
                style={{ flex: 1 }}
                aria-label={t('domains.baUsername')}
                autoComplete="off"
              />
              <input
                type="password"
                placeholder={t('domains.baPasswordKeep')}
                value={u.password}
                onChange={(e) => updateUser(i, 'password', e.target.value)}
                style={{ flex: 1 }}
                aria-label={t('domains.baPassword')}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => removeUser(i)}
                aria-label={t('domains.removeRoute')}
                style={iconBtnStyle}
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addUser} style={addBtnStyle}>
          <Plus size={12} strokeWidth={2} />
          {t('domains.addUser')}
        </button>
      </div>

      {/* --- IP Rules --- */}
      <div>
        <div style={sectionHeadStyle}>{t('domains.ipRules')}</div>
        <FormField label={t('domains.ipMode')}>
          <select
            value={value.ipMode}
            onChange={(e) =>
              onChange({ ...value, ipMode: e.target.value as 'allow' | 'deny' })
            }
          >
            <option value="allow">{t('domains.ipAllow')}</option>
            <option value="deny">{t('domains.ipDeny')}</option>
          </select>
        </FormField>
        <FormField label={t('domains.ipCidrs')} hint={t('domains.ipCidrsHint')}>
          <textarea
            rows={3}
            value={value.ipCidrs}
            onChange={(e) => onChange({ ...value, ipCidrs: e.target.value })}
            placeholder="1.2.3.4, 10.0.0.0/8"
            style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          />
        </FormField>
      </div>
    </div>
  );
}
