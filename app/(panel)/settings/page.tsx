'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, XCircle } from 'lucide-react';
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

  useEffect(() => {
    setUsername(localStorage.getItem('username') || '');
    api.getCaddyConfig().then(d => setCaddyConfig(d.content)).catch(() => {});
    api.getMetrics().then(setMetrics).catch(() => {});
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
