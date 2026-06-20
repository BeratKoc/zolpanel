'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import {
  Btn, Badge, StatusDot, Modal, FormField,
  Spinner, EmptyState, useToast
} from '@/components/ui';

const APP_TYPES = ['next.js', 'node.js', 'python', 'go', 'php', 'static', 'other'];

interface Route {
  path: string;
  port: string;
  type: string;
}

export default function Domains() {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<any>(null);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const data = await api.getDomains();
      setDomains(data);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(domain: any) {
    if (!window.confirm(`"${domain.domain}" silinsin mi?`)) return;
    setDeleting(domain._id);
    try {
      await api.deleteDomain(domain._id);
      show(`${domain.domain} silindi`, 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function handleStatusToggle(domain: any) {
    const newStatus = domain.status === 'active' ? 'offline' : 'active';
    try {
      await api.updateDomain(domain._id, { status: newStatus });
      setDomains(prev => prev.map(d => d._id === domain._id ? { ...d, status: newStatus } : d));
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 500 }}>Domainler</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {domains.length} domain kayıtlı
          </p>
        </div>
        <Btn variant="primary" onClick={() => setShowAdd(true)}>
          + Domain Ekle
        </Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : domains.length === 0 ? (
        <EmptyState
          icon="🌐"
          title="Henüz domain yok"
          subtitle="İlk domainini ekleyerek başla"
          action={<Btn variant="primary" onClick={() => setShowAdd(true)}>+ Domain Ekle</Btn>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {domains.map(d => (
            <DomainCard
              key={d._id}
              domain={d}
              onDelete={() => handleDelete(d)}
              onEdit={() => setSelectedDomain(d)}
              onToggle={() => handleStatusToggle(d)}
              deleting={deleting === d._id}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddDomainModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load(); show('Domain eklendi', 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}

      {selectedDomain && (
        <EditDomainModal
          domain={selectedDomain}
          onClose={() => setSelectedDomain(null)}
          onSuccess={() => { setSelectedDomain(null); load(); show('Domain güncellendi', 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}

function DomainCard({ domain, onDelete, onEdit, onToggle, deleting }: {
  domain: any;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: () => void;
  deleting: boolean;
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <StatusDot status={domain.status} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{domain.domain}</span>
          {domain.aliases?.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              + {domain.aliases.join(', ')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {domain.type === 'proxy'
              ? `→ :${domain.port}`
              : domain.type === 'advanced'
              ? `${domain.routes?.length || 0} route`
              : domain.rootPath}
          </span>
          {domain.appType && domain.appType !== 'other' && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{domain.appType}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge color={domain.type === 'proxy' ? 'blue' : 'purple'}>
          {domain.type}
        </Badge>
        <Badge color={domain.sslStatus === 'active' ? 'green' : 'yellow'}>
          {domain.sslStatus === 'active' ? '🔒' : '⏳'} SSL
        </Badge>
      </div>

      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <IconBtn onClick={onToggle} title={domain.status === 'active' ? 'Durdur' : 'Aktif Et'}>
          {domain.status === 'active' ? '⏸' : '▶'}
        </IconBtn>
        <IconBtn onClick={onEdit} title="Düzenle">✏️</IconBtn>
        <IconBtn onClick={onDelete} title="Sil" danger disabled={deleting}>
          {deleting ? <Spinner size={12} /> : '🗑'}
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, danger, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: '13px',
        color: danger ? 'var(--red)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}

function AddDomainModal({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<{
    domain: string;
    type: string;
    port: string;
    rootPath: string;
    aliases: string;
    appType: string;
    notes: string;
    routes: Route[];
  }>({
    domain: '',
    type: 'proxy',
    port: '',
    rootPath: '',
    aliases: '',
    appType: 'other',
    notes: '',
    routes: [{ path: '/api/*', port: '', type: 'http' }],
  });
  const [loadingPort, setLoadingPort] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function update(key: string, val: string) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function updateRoute(i: number, key: string, val: string) {
    setForm(prev => ({
      ...prev,
      routes: prev.routes.map((r, idx) => idx === i ? { ...r, [key]: val } : r),
    }));
  }
  function addRoute() {
    setForm(prev => ({ ...prev, routes: [...prev.routes, { path: '/*', port: '', type: 'http' }] }));
  }
  function removeRoute(i: number) {
    setForm(prev => ({ ...prev, routes: prev.routes.filter((_, idx) => idx !== i) }));
  }

  async function autoPort() {
    setLoadingPort(true);
    try {
      const data = await api.getNextPort();
      update('port', data.port.toString());
    } catch (e: any) {
      onError(e.message);
    } finally {
      setLoadingPort(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        domain: form.domain.trim(),
        type: form.type,
        appType: form.appType,
        notes: form.notes,
        aliases: form.aliases ? form.aliases.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      if (form.type === 'proxy') payload.port = parseInt(form.port);
      if (form.type === 'static') payload.rootPath = form.rootPath || `/var/www/${form.domain}`;
      if (form.type === 'advanced') {
        const routes = form.routes
          .map(r => ({ path: r.path.trim(), port: parseInt(r.port), type: r.type }))
          .filter(r => r.path && !isNaN(r.port));
        if (routes.length === 0) {
          onError('En az bir geçerli route (path + port) gerekli');
          setSubmitting(false);
          return;
        }
        payload.routes = routes;
      }

      await api.createDomain(payload);
      onSuccess();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Domain Ekle" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Domain adı">
          <input
            placeholder="ornek.com"
            value={form.domain}
            onChange={e => update('domain', e.target.value)}
            required
            autoFocus
          />
        </FormField>

        <FormField label="Tip">
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { v: 'proxy', label: '🔀 Proxy' },
              { v: 'static', label: '📁 Static' },
              { v: 'advanced', label: '⚙️ Gelişmiş' },
            ].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => update('type', v)}
                style={{
                  flex: 1, padding: '8px',
                  background: form.type === v ? 'var(--accent)' : 'var(--bg-elevated)',
                  border: `1px solid ${form.type === v ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  color: form.type === v ? '#fff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </FormField>

        {form.type === 'proxy' && (
          <FormField label="Port" hint="Uygulamanın çalıştığı port numarası">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="3000"
                value={form.port}
                onChange={e => update('port', e.target.value)}
                required
              />
              <Btn type="button" variant="default" onClick={autoPort} disabled={loadingPort} style={{ flexShrink: 0 }}>
                {loadingPort ? <Spinner size={12} /> : 'Otomatik'}
              </Btn>
            </div>
          </FormField>
        )}

        {form.type === 'static' && (
          <FormField label="Klasör yolu" hint="Boş bırakırsan /var/www/{domain} kullanılır">
            <input
              placeholder="/var/www/sitem"
              value={form.rootPath}
              onChange={e => update('rootPath', e.target.value)}
            />
          </FormField>
        )}

        {form.type === 'advanced' && (
          <FormField label="Route'lar" hint="Path → port eşlemesi. WS = websocket (uzun bağlantı).">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {form.routes.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    placeholder="/api/*"
                    value={r.path}
                    onChange={e => updateRoute(i, 'path', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder="port"
                    value={r.port}
                    onChange={e => updateRoute(i, 'port', e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <select
                    value={r.type}
                    onChange={e => updateRoute(i, 'type', e.target.value)}
                    style={{ flexShrink: 0 }}
                  >
                    <option value="http">HTTP</option>
                    <option value="websocket">WS</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRoute(i)}
                    disabled={form.routes.length === 1}
                    title="Route sil"
                    style={{
                      width: '30px', height: '30px', flexShrink: 0,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--red)',
                      cursor: form.routes.length === 1 ? 'not-allowed' : 'pointer',
                      opacity: form.routes.length === 1 ? 0.4 : 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Btn type="button" variant="default" onClick={addRoute} style={{ alignSelf: 'flex-start' }}>
                + Route ekle
              </Btn>
            </div>
          </FormField>
        )}

        <FormField label="Uygulama tipi">
          <select value={form.appType} onChange={e => update('appType', e.target.value)}>
            {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>

        <FormField label="Alias domainler" hint="Virgülle ayır: site.net, site.org">
          <input
            placeholder="ornek.net, ornek.org"
            value={form.aliases}
            onChange={e => update('aliases', e.target.value)}
          />
        </FormField>

        <FormField label="Notlar">
          <textarea
            rows={2}
            placeholder="Opsiyonel not..."
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            style={{ resize: 'none' }}
          />
        </FormField>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>İptal</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : 'Ekle'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

function EditDomainModal({ domain, onClose, onSuccess, onError }: {
  domain: any;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    aliases: domain.aliases?.join(', ') || '',
    appType: domain.appType || 'other',
    notes: domain.notes || '',
    status: domain.status,
  });
  const [submitting, setSubmitting] = useState(false);

  function update(key: string, val: string) { setForm(prev => ({ ...prev, [key]: val })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.updateDomain(domain._id, {
        aliases: form.aliases ? form.aliases.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        appType: form.appType,
        notes: form.notes,
        status: form.status,
      });
      onSuccess();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Düzenle: ${domain.domain}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {domain.type === 'proxy'
            ? `reverse_proxy localhost:${domain.port}`
            : domain.type === 'advanced'
            ? (domain.routes || []).map((r: any) => `${r.path} → :${r.port}${r.type === 'websocket' ? ' (ws)' : ''}`).join('\n')
            : `root * ${domain.rootPath}`}
        </div>

        <FormField label="Durum">
          <select value={form.status} onChange={e => update('status', e.target.value)}>
            <option value="active">Aktif</option>
            <option value="offline">Offline</option>
          </select>
        </FormField>

        <FormField label="Uygulama tipi">
          <select value={form.appType} onChange={e => update('appType', e.target.value)}>
            {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FormField>

        <FormField label="Alias domainler" hint="Virgülle ayır">
          <input
            placeholder="ornek.net, ornek.org"
            value={form.aliases}
            onChange={e => update('aliases', e.target.value)}
          />
        </FormField>

        <FormField label="Notlar">
          <textarea
            rows={2}
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            style={{ resize: 'none' }}
          />
        </FormField>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>İptal</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : 'Kaydet'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
