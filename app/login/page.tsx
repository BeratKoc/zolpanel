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

  // 2FA step state
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (totpStep) {
      // Second step: submit with TOTP code
      setError('');
      setLoading(true);
      try {
        const data = await api.login(username, password, totpCode) as any;
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        router.push('/');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('login.errorGeneric'));
      } finally {
        setLoading(false);
      }
      return;
    }

    // First step: normal login
    if (!username || !password) return setError(t('login.errorEmpty'));
    setError('');
    setLoading(true);
    try {
      const data = await api.login(username, password) as any;
      if (data.twoFactorRequired === true) {
        // Switch to TOTP step — do NOT clear username/password
        setTotpStep(true);
        setTotpCode('');
        setLoading(false);
        return;
      }
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
            {totpStep ? t('login.totpPrompt') : t('login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {!totpStep ? (
            <>
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
            </>
          ) : (
            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder={t('login.totpCode')}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
          )}

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
            disabled={loading || (totpStep && totpCode.length !== 6)}
            style={{ width: '100%', justifyContent: 'center', padding: '9px' }}
          >
            {loading ? <Spinner size={14} /> : t('login.submit')}
          </Btn>

          {totpStep && (
            <button
              type="button"
              onClick={() => { setTotpStep(false); setTotpCode(''); setError(''); }}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              {t('common.cancel')}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
