'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Btn, Spinner } from '@/components/ui';
import Logo from '@/components/Logo';

export default function Login() {
  const router = useRouter();
  const t = useTranslations();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username || !password) return setError(t('login.errorEmpty'));
    setError('');
    setLoading(true);
    try {
      const data = await api.login(username, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div className="login-card" style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        animation: 'fadeIn 0.3s ease',
      }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Logo size={40} title="Zolpanel" />
            <h1 style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Zolpanel
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text"
              placeholder={t('login.username')}
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password"
              placeholder={t('login.password')}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p style={{
              fontSize: '12px',
              color: 'var(--red)',
              marginBottom: '16px',
              padding: '8px 12px',
              background: 'rgba(239,68,68,0.08)',
              borderRadius: 'var(--radius)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              {error}
            </p>
          )}

          <Btn
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '9px' }}
          >
            {loading ? <Spinner size={14} /> : t('login.submit')}
          </Btn>
        </form>
      </div>
    </div>
  );
}
