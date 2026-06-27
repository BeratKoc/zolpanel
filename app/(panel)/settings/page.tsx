'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, FormField, Spinner, useToast } from '@/components/ui';

export default function Settings() {
  const t = useTranslations();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [caddyConfig, setCaddyConfig] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErr, setPwErr] = useState<{ next?: string; confirm?: string }>({});
  const { show, ToastContainer } = useToast();

  // 2FA state
  const [twofaEnabled, setTwofaEnabled] = useState<boolean | null>(null);
  const [twofaLoading, setTwofaLoading] = useState(false);
  const [twofaSetupData, setTwofaSetupData] = useState<{ secret: string; otpauth: string } | null>(null);
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaVerifying, setTwofaVerifying] = useState(false);

  // API Tokens state
  const [tokens, setTokens] = useState<{ id: string; name: string; createdAt: string; lastUsed: string | null }[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem('username') || '');
    api.getCaddyConfig().then(d => setCaddyConfig(d.content)).catch(() => {});
    api.getMetrics().then(setMetrics).catch(() => {});
    // Fetch 2FA status
    api.twofaStatus().then((d: any) => setTwofaEnabled(d.enabled)).catch(() => {});
    // Fetch tokens
    fetchTokens();
  }, []);

  const fetchTokens = useCallback(() => {
    setTokensLoading(true);
    api.tokensList()
      .then((d: any) => setTokens(d.tokens ?? []))
      .catch(() => {})
      .finally(() => setTokensLoading(false));
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.push('/login');
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) return show(t('settings.passwordMismatch'), 'error');
    if (pwForm.next.length < 12 || !/[A-Z]/.test(pwForm.next) || !/[0-9]/.test(pwForm.next))
      return show(t('settings.passwordTooShort'), 'error');
    setPwLoading(true);
    try {
      await api.changePassword(pwForm.current, pwForm.next);
      show(t('settings.passwordUpdated'), 'success');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setPwLoading(false);
    }
  }

  // 2FA handlers
  async function handleTwofaEnable() {
    setTwofaLoading(true);
    try {
      const d = await api.twofaSetup() as any;
      setTwofaSetupData({ secret: d.secret, otpauth: d.otpauth });
      setTwofaCode('');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setTwofaLoading(false);
    }
  }

  async function handleTwofaVerify(e: React.FormEvent) {
    e.preventDefault();
    setTwofaVerifying(true);
    try {
      await api.twofaEnable(twofaCode);
      setTwofaEnabled(true);
      setTwofaSetupData(null);
      setTwofaCode('');
      show(t('twofa.verified'), 'success');
    } catch (e: any) {
      show(t('twofa.invalidCode'), 'error');
    } finally {
      setTwofaVerifying(false);
    }
  }

  async function handleTwofaDisable() {
    if (!confirm(t('twofa.disableConfirm'))) return;
    setTwofaLoading(true);
    try {
      await api.twofaDisable();
      setTwofaEnabled(false);
      setTwofaSetupData(null);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setTwofaLoading(false);
    }
  }

  // API Token handlers
  async function handleTokenCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    setCreatingToken(true);
    try {
      const d = await api.tokenCreate(newTokenName.trim()) as any;
      setNewTokenValue(d.token);
      setNewTokenName('');
      fetchTokens();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleTokenRevoke(id: string) {
    if (!confirm(t('apitokens.revokeConfirm'))) return;
    try {
      await api.tokenDelete(id);
      fetchTokens();
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  function handleCopyToken(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function formatDate(iso: string | null) {
    if (!iso) return t('apitokens.never');
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>{t('settings.title')}</h2>

      <div className="cols-2" style={{ alignItems: 'start' }}>

        {/* Şifre değiştir */}
        <Section title={t('settings.changePassword')}>
          <form onSubmit={handleChangePassword}>
            <FormField label={t('settings.currentPassword')}>
              <input
                type="password"
                value={pwForm.current}
                onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                required
              />
            </FormField>
            <FormField label={t('settings.newPassword')} error={pwErr.next}>
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                onBlur={e => {
                  const v = e.target.value;
                  if (v && (v.length < 12 || !/[A-Z]/.test(v) || !/[0-9]/.test(v))) {
                    setPwErr(prev => ({ ...prev, next: t('settings.passwordTooShort') }));
                  } else {
                    setPwErr(prev => ({ ...prev, next: undefined }));
                  }
                }}
                aria-invalid={!!pwErr.next}
                required
              />
            </FormField>
            <FormField label={t('settings.newPasswordConfirm')} error={pwErr.confirm}>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                onBlur={e => {
                  const v = e.target.value;
                  if (v && v !== pwForm.next) {
                    setPwErr(prev => ({ ...prev, confirm: t('settings.passwordMismatch') }));
                  } else {
                    setPwErr(prev => ({ ...prev, confirm: undefined }));
                  }
                }}
                aria-invalid={!!pwErr.confirm}
                required
              />
            </FormField>
            <Btn type="submit" variant="primary" disabled={pwLoading}>
              {pwLoading ? <Spinner size={13} /> : t('settings.update')}
            </Btn>
          </form>
        </Section>

        {/* Sistem bilgisi */}
        <Section title={t('settings.systemInfo')}>
          {metrics ? (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {([
                  [t('settings.operatingSystem'), `${metrics.os?.distro} ${metrics.os?.release}`],
                  [t('settings.hostname'), metrics.os?.hostname],
                  ['CPU', t('settings.cpuUsage', { load: metrics.cpu?.load, cores: metrics.cpu?.cores })],
                  ['RAM', `${formatBytes(metrics.memory?.realUsed)} / ${formatBytes(metrics.memory?.effectiveTotal)}${metrics.memory?.balloon > 1073741824 ? ` (balloon: ${formatBytes(metrics.memory?.balloon)})` : ''}`],
                  ['Disk', `${formatBytes(metrics.disk?.used)} / ${formatBytes(metrics.disk?.total)} (${metrics.disk?.percent}%)`],
                  ['Caddy', metrics.caddy?.running
                    ? <><CheckCircle2 size={14} strokeWidth={1.75} style={{ color: 'var(--green)', verticalAlign: '-2px', marginRight: 4 }} />{t('settings.running')}</>
                    : <><XCircle size={14} strokeWidth={1.75} style={{ color: 'var(--red)', verticalAlign: '-2px', marginRight: 4 }} />{t('settings.stopped')}</>
                  ],
                ] as [string, React.ReactNode][]).map(([k, v]) => (
                  <tr key={String(k)}>
                    <td style={{ padding: '6px 0', color: 'var(--text-muted)', width: '40%' }}>{k}</td>
                    <td className={['RAM', 'Disk', 'CPU'].includes(String(k)) ? 'tabular' : undefined}
                        style={{ padding: '6px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : <Spinner />}
        </Section>

        {/* Caddy config */}
        <Section title="Caddyfile" style={{ gridColumn: '1 / -1' }}>
          <pre style={{
            background: 'var(--bg-base)',
            borderRadius: 'var(--radius)',
            padding: '16px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            overflow: 'auto',
            maxHeight: '300px',
            border: '1px solid var(--border)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {caddyConfig || t('settings.caddyfileEmpty')}
          </pre>
        </Section>

        {/* 2FA */}
        <Section title={t('twofa.title')}>
          {twofaEnabled === null ? (
            <Spinner />
          ) : (
            <div>
              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('twofa.status')}:</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: twofaEnabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                  color: twofaEnabled ? 'var(--green)' : 'var(--red)',
                }}>
                  {twofaEnabled
                    ? <><CheckCircle2 size={11} />{t('twofa.enabled')}</>
                    : <><XCircle size={11} />{t('twofa.disabled')}</>
                  }
                </span>
              </div>

              {/* Setup flow */}
              {!twofaEnabled && !twofaSetupData && (
                <Btn variant="primary" onClick={handleTwofaEnable} disabled={twofaLoading}>
                  {twofaLoading ? <Spinner size={13} /> : t('twofa.enable')}
                </Btn>
              )}

              {!twofaEnabled && twofaSetupData && (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    {t('twofa.setupScan')}
                  </p>

                  <div style={{ marginBottom: '10px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {t('twofa.secret')}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{
                        flex: 1,
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '6px 10px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        wordBreak: 'break-all',
                      }}>
                        {twofaSetupData.secret}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(twofaSetupData.secret)}
                        title={t('apitokens.copy')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {t('twofa.otpauth')}
                    </p>
                    <p style={{
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '6px 10px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      wordBreak: 'break-all',
                    }}>
                      {twofaSetupData.otpauth}
                    </p>
                  </div>

                  <form onSubmit={handleTwofaVerify}>
                    <FormField label={t('twofa.enterCode')}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={twofaCode}
                        onChange={e => setTwofaCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        required
                        autoComplete="one-time-code"
                      />
                    </FormField>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <Btn type="submit" variant="primary" disabled={twofaVerifying || twofaCode.length !== 6}>
                        {twofaVerifying ? <Spinner size={13} /> : t('twofa.verify')}
                      </Btn>
                      <Btn type="button" variant="ghost" onClick={() => { setTwofaSetupData(null); setTwofaCode(''); }}>
                        {t('common.cancel')}
                      </Btn>
                    </div>
                  </form>
                </div>
              )}

              {twofaEnabled && (
                <Btn variant="danger" onClick={handleTwofaDisable} disabled={twofaLoading}>
                  {twofaLoading ? <Spinner size={13} /> : t('twofa.disable')}
                </Btn>
              )}
            </div>
          )}
        </Section>

        {/* API Tokens */}
        <Section title={t('apitokens.title')}>
          {/* Create form */}
          <form onSubmit={handleTokenCreate} style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newTokenName}
              onChange={e => setNewTokenName(e.target.value)}
              placeholder={t('apitokens.namePlaceholder')}
              style={{ flex: '1', minWidth: '140px' }}
            />
            <Btn type="submit" variant="primary" disabled={creatingToken || !newTokenName.trim()}>
              {creatingToken ? <Spinner size={13} /> : t('apitokens.create')}
            </Btn>
          </form>

          {/* Newly created token display */}
          {newTokenValue && (
            <div style={{
              background: 'rgba(234,179,8,0.08)',
              border: '1px solid rgba(234,179,8,0.3)',
              borderRadius: 'var(--radius)',
              padding: '12px',
              marginBottom: '16px',
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {t('apitokens.tokenOnce')}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code style={{
                  flex: 1,
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  wordBreak: 'break-all',
                  overflowWrap: 'anywhere',
                }}>
                  {newTokenValue}
                </code>
                <button
                  onClick={() => handleCopyToken(newTokenValue)}
                  title={t('apitokens.copy')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--text-muted)', padding: '4px', flexShrink: 0 }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <button
                onClick={() => setNewTokenValue(null)}
                style={{ marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', padding: 0 }}
              >
                {t('common.close')}
              </button>
            </div>
          )}

          {/* Tokens table */}
          {tokensLoading ? (
            <Spinner />
          ) : tokens.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('apitokens.empty')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {[t('apitokens.name'), t('apitokens.created'), t('apitokens.lastUsed'), ''].map((h, i) => (
                      <th key={i} style={{
                        textAlign: 'left',
                        padding: '4px 0 8px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        fontWeight: 400,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: '1px solid var(--border)',
                        paddingRight: i < 3 ? '12px' : 0,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tokens.map(tok => (
                    <tr key={tok.id}>
                      <td style={{ padding: '8px 12px 8px 0', color: 'var(--text-primary)' }}>{tok.name}</td>
                      <td style={{ padding: '8px 12px 8px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(tok.createdAt)}</td>
                      <td style={{ padding: '8px 12px 8px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(tok.lastUsed)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>
                        <Btn variant="danger" onClick={() => handleTokenRevoke(tok.id)} style={{ padding: '3px 8px', fontSize: '11px' }}>
                          {t('apitokens.revoke')}
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Oturum */}
        <Section title={t('settings.session')}>
          <div className="info-row" style={{ alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{username}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{t('settings.loggedIn')}</p>
            </div>
            <Btn variant="danger" onClick={handleLogout}>{t('settings.logout')}</Btn>
          </div>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children, style }: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      ...style,
    }}>
      <p style={{
        fontSize: '11px',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '16px',
        fontWeight: 400,
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}
