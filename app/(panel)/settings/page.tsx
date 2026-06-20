'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Btn, FormField, Spinner, useToast } from '@/components/ui';

export default function Settings() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [caddyConfig, setCaddyConfig] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
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
    if (pwForm.next !== pwForm.confirm) return show('Şifreler eşleşmiyor', 'error');
    if (pwForm.next.length < 6) return show('Şifre en az 6 karakter olmalı', 'error');
    setPwLoading(true);
    try {
      await api.changePassword(pwForm.current, pwForm.next);
      show('Şifre güncellendi', 'success');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setPwLoading(false);
    }
  }

  async function handleReloadCaddy() {
    setReloading(true);
    try {
      await api.reloadCaddy();
      show('Caddy yeniden yüklendi', 'success');
      const d = await api.getCaddyConfig();
      setCaddyConfig(d.content);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setReloading(false);
    }
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <h2 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '24px' }}>Ayarlar</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>

        {/* Şifre değiştir */}
        <Section title="Şifre Değiştir">
          <form onSubmit={handleChangePassword}>
            <FormField label="Mevcut şifre">
              <input
                type="password"
                value={pwForm.current}
                onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                required
              />
            </FormField>
            <FormField label="Yeni şifre">
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                required
              />
            </FormField>
            <FormField label="Yeni şifre (tekrar)">
              <input
                type="password"
                value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                required
              />
            </FormField>
            <Btn type="submit" variant="primary" disabled={pwLoading}>
              {pwLoading ? <Spinner size={13} /> : 'Güncelle'}
            </Btn>
          </form>
        </Section>

        {/* Sistem bilgisi */}
        <Section title="Sistem Bilgisi">
          {metrics ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {([
                  ['İşletim Sistemi', `${metrics.os?.distro} ${metrics.os?.release}`],
                  ['Hostname', metrics.os?.hostname],
                  ['CPU', `${metrics.cpu?.load}% kullanım (${metrics.cpu?.cores} çekirdek)`],
                  ['RAM', `${formatBytes(metrics.memory?.used)} / ${formatBytes(metrics.memory?.total)}`],
                  ['Disk', `${formatBytes(metrics.disk?.used)} / ${formatBytes(metrics.disk?.total)} (${metrics.disk?.percent}%)`],
                  ['Caddy', metrics.caddy?.running ? '✅ Çalışıyor' : '❌ Durdu'],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '6px 0', color: 'var(--text-muted)', width: '40%' }}>{k}</td>
                    <td style={{ padding: '6px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Spinner />}
        </Section>

        {/* Caddy config */}
        <Section title="Caddyfile" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
            <Btn variant="default" size="sm" onClick={handleReloadCaddy} disabled={reloading}>
              {reloading ? <Spinner size={12} /> : '↻'} Reload Caddy
            </Btn>
          </div>
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
            {caddyConfig || '# Caddyfile boş veya okunamadı'}
          </pre>
        </Section>

        {/* Oturum */}
        <Section title="Oturum">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{username}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Giriş yapıldı</p>
            </div>
            <Btn variant="danger" onClick={handleLogout}>Çıkış Yap</Btn>
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
  if (!bytes) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}
