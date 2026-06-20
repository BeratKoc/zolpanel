import { useState, useEffect } from 'react';
import './index.css';
import { api } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Domains from './pages/Domains';
import Processes from './pages/Processes';
import Logs from './pages/Logs';
import Settings from './pages/Settings';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'domains', label: 'Domains', icon: '⬡' },
  { id: 'processes', label: 'Processes', icon: '⚙' },
  { id: 'logs', label: 'Logs', icon: '≡' },
  { id: 'settings', label: 'Settings', icon: '◎' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setChecking(false); return; }
    api.verify()
      .then(data => { setUser(data.username); })
      .catch(() => { localStorage.removeItem('token'); })
      .finally(() => setChecking(false));
  }, []);

  function handleLogin(username) { setUser(username); }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setUser(null);
    setPage('dashboard');
  }

  if (checking) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{
          width: 20, height: 20,
          border: '2px solid var(--border-light)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  const pages = {
    dashboard: <Dashboard />,
    domains: <Domains />,
    processes: <Processes />,
    logs: <Logs />,
    settings: <Settings username={user} onLogout={handleLogout} />,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-width)',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
            Zolpanel
          </p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', fontFamily: 'var(--font-mono)' }}>
            {user}
          </p>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <NavItem
              key={item.id}
              item={item}
              active={page === item.id}
              onClick={() => setPage(item.id)}
            />
          ))}
        </nav>

        {/* Bottom */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--green)',
              animation: 'pulse 2s infinite',
              display: 'inline-block',
            }} />
            online
          </span>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div style={{
          height: 'var(--topbar-height)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {NAV_ITEMS.find(n => n.id === page)?.label}
          </span>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {pages[page]}
        </div>
      </main>
    </div>
  );
}

function NavItem({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px 10px',
        borderRadius: 'var(--radius)',
        marginBottom: '2px',
        background: active ? 'var(--bg-hover)' : hovered ? 'var(--bg-elevated)' : 'transparent',
        border: 'none',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        fontSize: '13px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.1s',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{
        fontSize: '15px',
        opacity: active ? 1 : 0.6,
        lineHeight: 1,
      }}>
        {item.icon}
      </span>
      {item.label}
    </button>
  );
}
