import { useState } from 'react';
import { api } from '../api';
import { Btn, Spinner } from '../components/ui';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) return setError('Kullanıcı adı ve şifre girin');
    setError('');
    setLoading(true);
    try {
      const data = await api.login(username, password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      onLogin(data.username);
    } catch (err) {
      setError(err.message);
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
      <div style={{
        width: 360,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        animation: 'fadeIn 0.3s ease',
      }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{
            fontSize: '18px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: '4px',
          }}>
            VPS Panel
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Devam etmek için giriş yapın
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text"
              placeholder="Kullanıcı adı"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="password"
              placeholder="Şifre"
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
            {loading ? <Spinner size={14} /> : 'Giriş Yap'}
          </Btn>
        </form>
      </div>
    </div>
  );
}
