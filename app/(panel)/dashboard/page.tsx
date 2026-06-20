'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, TrendingUp, Check, RotateCw, Clock, Lock } from 'lucide-react';
import { api } from '@/lib/api-client';
import { MetricCard, StatusDot, Badge, Spinner, Btn } from '@/components/ui';

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}

// Mini sparkline SVG
function Sparkline({ data, color = 'var(--accent)', width = 80, height = 28 }: { data?: number[]; color?: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Anomali badge
function AnomalyBadge({ anomaly, trend }: { anomaly?: any; trend?: string }) {
  const t = useTranslations();
  if (anomaly) return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: 'rgba(255,80,80,0.15)', color: 'var(--red)',
      border: '1px solid rgba(255,80,80,0.3)', fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <AlertTriangle size={12} strokeWidth={1.75} /> {t('dashboard.leakSuspect')}
    </span>
  );
  if (trend === 'growing') return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: 'rgba(255,180,0,0.12)', color: 'var(--yellow)',
      border: '1px solid rgba(255,180,0,0.25)',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <TrendingUp size={12} strokeWidth={1.75} /> {t('dashboard.trendGrowing')}
    </span>
  );
  if (trend === 'stable') return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: 'rgba(0,200,100,0.1)', color: 'var(--green)',
      border: '1px solid rgba(0,200,100,0.2)',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <Check size={12} strokeWidth={1.75} /> {t('dashboard.trendStable')}
    </span>
  );
  return null;
}

function ServiceMemoryRow({ svc }: { svc: any }) {
  const sparkColor = svc.anomaly ? 'var(--red)' : svc.trend === 'growing' ? 'var(--yellow)' : 'var(--green)';
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${svc.anomaly ? 'rgba(255,80,80,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: svc.type === 'docker' ? 'var(--accent)' : 'var(--green)',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{svc.name}</span>
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 3,
            background: 'var(--bg-elevated)', color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>{svc.type}</span>
          <AnomalyBadge anomaly={svc.anomaly} trend={svc.trend} />
        </div>
        {svc.anomaly && (
          <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
            {svc.anomaly.message}
          </p>
        )}
      </div>

      <Sparkline data={svc.sparkline} color={sparkColor} />

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p className="tabular" style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          {svc.current} MB
        </p>
        <p className="tabular" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          max {svc.max} MB
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const t = useTranslations();
  const [metrics, setMetrics] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [domains, setDomains] = useState<any[]>([]);
  const [memoryStats, setMemoryStats] = useState<any[]>([]);
  const [memHours, setMemHours] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);

  async function loadData() {
    try {
      const [m, s, d] = await Promise.all([
        api.getMetrics(),
        api.getStats(),
        api.getDomains(),
      ]);
      setMetrics(m);
      setStats(s);
      setDomains(d.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadMemoryStats() {
    try {
      const data = await api.getMemoryStats(memHours);
      setMemoryStats(data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    loadData();
    loadMemoryStats();
    const interval = setInterval(() => {
      loadData();
      loadMemoryStats();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadMemoryStats(); }, [memHours]);

  async function handleReloadCaddy() {
    setReloading(true);
    try { await api.reloadCaddy(); } finally { setReloading(false); }
  }

  const anomalyCount = memoryStats.filter(s => s.anomaly).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <Spinner size={24} />
    </div>
  );

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>

      {/* Sistem metrikleri */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          {t('dashboard.system')}
        </p>
        <div className="grid-5">
          <MetricCard label="CPU" value={`${metrics?.cpu?.load ?? '–'}%`} sub={`${metrics?.cpu?.cores ?? '?'} ${t('dashboard.cores')}`}
            color={metrics?.cpu?.load > 80 ? 'var(--red)' : metrics?.cpu?.load > 50 ? 'var(--yellow)' : 'var(--text-primary)'} />
          <MetricCard label={t('dashboard.ramTotal')} value={formatBytes(metrics?.memory?.used)} sub={`/ ${formatBytes(metrics?.memory?.total)}`}
            color={metrics?.memory?.percent > 80 ? 'var(--red)' : 'var(--text-primary)'} />
          <MetricCard label={t('dashboard.ramReal')} value={formatBytes(metrics?.memory?.active)} sub={`% ${metrics?.memory?.activePercent ?? '–'} ${t('dashboard.active')}`}
            color={metrics?.memory?.activePercent > 80 ? 'var(--red)' : 'var(--green)'} />
          <MetricCard label="Disk" value={`${metrics?.disk?.percent ?? '–'}%`}
            sub={`${formatBytes(metrics?.disk?.used)} / ${formatBytes(metrics?.disk?.total)}`} />
          <MetricCard label="Caddy" value={metrics?.caddy?.running ? t('dashboard.running') : t('dashboard.stopped')}
            sub={metrics?.os?.hostname || ''}
            color={metrics?.caddy?.running ? 'var(--green)' : 'var(--red)'} />
        </div>
      </div>

      {/* Domain istatistikleri */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          {t('dashboard.domains')}
        </p>
        <div className="grid-4">
          <MetricCard label={t('dashboard.total')} value={stats?.total ?? 0} />
          <MetricCard label={t('dashboard.activeLabel')} value={stats?.active ?? 0} color="var(--green)" />
          <MetricCard label={t('dashboard.offline')} value={stats?.offline ?? 0} color={stats?.offline > 0 ? 'var(--red)' : 'var(--text-primary)'} />
          <MetricCard label={t('dashboard.sslActive')} value={stats?.sslActive ?? 0} color="var(--accent)" />
        </div>
      </div>

      {/* Servis memory bölümü */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('dashboard.serviceMemoryUsage')}
            </p>
            {anomalyCount > 0 && (
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 4,
                background: 'rgba(255,80,80,0.15)', color: 'var(--red)',
                border: '1px solid rgba(255,80,80,0.3)', fontWeight: 600,
              }}>
                {t('dashboard.anomalies', { n: anomalyCount })}
              </span>
            )}
          </div>
          {/* Zaman penceresi seçici */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 6, 24].map(h => (
              <button key={h} onClick={() => setMemHours(h)} style={{
                padding: '3px 10px', borderRadius: 'var(--radius)', fontSize: 11,
                background: memHours === h ? 'var(--accent)' : 'var(--bg-elevated)',
                border: `1px solid ${memHours === h ? 'var(--accent)' : 'var(--border)'}`,
                color: memHours === h ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}>
                {t('dashboard.hoursShort', { h })}
              </button>
            ))}
          </div>
        </div>

        {memoryStats.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '24px', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            {t('dashboard.noDataYet')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {memoryStats
              .slice()
              .sort((a, b) => (b.anomaly ? 1 : 0) - (a.anomaly ? 1 : 0) || b.current - a.current)
              .map(svc => <ServiceMemoryRow key={svc.name} svc={svc} />)}
          </div>
        )}
      </div>

      {/* Son domainler */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {t('dashboard.recentDomains')}
          </p>
          <Btn variant="ghost" size="sm" onClick={handleReloadCaddy} disabled={reloading}>
            {reloading ? <Spinner size={12} /> : <RotateCw size={12} strokeWidth={1.75} />} {t('dashboard.caddyReload')}
          </Btn>
        </div>
        {domains.length === 0 ? (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 32,
            textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
          }}>
            {t('dashboard.noDomainsYet')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {domains.map(d => <DomainRow key={d._id} domain={d} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function DomainRow({ domain }: { domain: any }) {
  const t = useTranslations();
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <StatusDot status={domain.status} />
      <span style={{ flex: 1, fontSize: 13 }}>{domain.domain}</span>
      {domain.aliases?.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dashboard.aliasCount', { n: domain.aliases.length })}</span>
      )}
      <Badge color={domain.type === 'proxy' ? 'blue' : 'purple'}>
        {domain.type === 'proxy' ? `proxy :${domain.port}` : 'static'}
      </Badge>
      <Badge color={domain.sslStatus === 'active' ? 'green' : 'yellow'}>
        {domain.sslStatus === 'active'
          ? <><Lock size={12} strokeWidth={1.75} style={{ verticalAlign: '-2px', marginRight: 3 }} />SSL</>
          : <><Clock size={12} strokeWidth={1.75} style={{ verticalAlign: '-2px', marginRight: 3 }} />SSL</>}
      </Badge>
    </div>
  );
}
