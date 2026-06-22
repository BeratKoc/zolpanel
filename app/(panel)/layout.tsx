'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Globe, Cpu, Container, Database, Archive, ScrollText, Settings as SettingsIcon, Menu, Rocket, type LucideIcon } from 'lucide-react';
import AuthGate from '@/components/AuthGate';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import Logo from '@/components/Logo';

interface NavItemDef {
  id: string;
  icon: LucideIcon;
  href: string;
}

const NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'domains', icon: Globe, href: '/domains' },
  { id: 'processes', icon: Cpu, href: '/processes' },
  { id: 'apps', icon: Rocket, href: '/apps' },
  { id: 'docker', icon: Container, href: '/docker' },
  { id: 'databases', icon: Database, href: '/databases' },
  { id: 'backups', icon: Archive, href: '/backups' },
  { id: 'logs', icon: ScrollText, href: '/logs' },
  { id: 'settings', icon: SettingsIcon, href: '/settings' },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const [user, setUser] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setUser(localStorage.getItem('username') || '');
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.push('/login');
  }

  const activeItem = NAV_ITEMS.find(n => pathname === n.href || pathname.startsWith(n.href + '/'));

  return (
    <AuthGate>
      <div className="app-shell" style={{ background: 'var(--bg-base)' }}>
        {/* Sidebar */}
        <aside
          className={'sidebar' + (drawerOpen ? ' open' : '')}
          style={{
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div style={{
            padding: '18px 16px 14px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Logo size={22} />
              <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
                Zolpanel
              </p>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              {user}
            </p>
          </div>

          {/* Navigation */}
          <nav style={{ padding: '10px 8px', flex: 1 }}>
            {NAV_ITEMS.map(item => (
              <NavItem
                key={item.id}
                item={item}
                label={t(`nav.${item.id}`)}
                active={activeItem?.id === item.id}
                onNavigate={() => setDrawerOpen(false)}
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
              {t('common.online')}
            </span>
          </div>
        </aside>

        {/* Backdrop (mobile only) */}
        {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />}

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
            <button
              className="hamburger"
              aria-label={t('common.menu')}
              onClick={() => setDrawerOpen(true)}
              style={{ marginRight: 12 }}
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeItem ? t(`nav.${activeItem.id}`) : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LanguageSwitcher />
              <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                padding: '5px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
            >
              {t('nav.logout')}
            </button>
            </div>
          </div>

          {/* Page content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {children}
          </div>
        </main>
      </div>
    </AuthGate>
  );
}

function NavItem({
  item,
  label,
  active,
  onNavigate,
}: {
  item: NavItemDef;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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
        textDecoration: 'none',
      }}
    >
      <span style={{
        opacity: active ? 1 : 0.6,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
      }}>
        <item.icon size={18} strokeWidth={1.75} />
      </span>
      {label}
    </Link>
  );
}
