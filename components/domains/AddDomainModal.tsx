'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shuffle, Folder, SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Modal, FormField, Spinner } from '@/components/ui';
import { APP_TYPES, Route } from '@/components/domains/shared';
import {
  CaddyExtrasEditor,
  CaddyExtrasValue,
  emptyCaddyExtras,
  toCaddyExtrasPayload,
} from '@/components/domains/CaddyExtrasEditor';

export function AddDomainModal({ onClose, onSuccess, onError }: {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations();
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
  const [extras, setExtras] = useState<CaddyExtrasValue>(emptyCaddyExtras);
  const [loadingPort, setLoadingPort] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [domainErr, setDomainErr] = useState<string | undefined>(undefined);

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
          onError(t('domains.routeRequired'));
          setSubmitting(false);
          return;
        }
        payload.routes = routes;
      }

      const caddyExtras = toCaddyExtrasPayload(extras);
      if (caddyExtras) payload.caddyExtras = caddyExtras;

      await api.createDomain(payload);
      onSuccess();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t('domains.addDomainTitle')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label={t('domains.domainName')} error={domainErr}>
          <input
            placeholder="example.com"
            value={form.domain}
            onChange={e => update('domain', e.target.value)}
            onBlur={e => {
              const v = e.target.value;
              if (v && !/^[a-z0-9.-]+$/i.test(v)) {
                setDomainErr(t('domains.errInvalidDomain'));
              } else {
                setDomainErr(undefined);
              }
            }}
            aria-invalid={!!domainErr}
            required
            autoFocus
          />
        </FormField>

        <FormField label={t('domains.type')}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { v: 'proxy', icon: <Shuffle size={16} strokeWidth={1.75} />, label: t('domains.typeProxy') },
              { v: 'static', icon: <Folder size={16} strokeWidth={1.75} />, label: t('domains.typeStatic') },
              { v: 'advanced', icon: <SlidersHorizontal size={16} strokeWidth={1.75} />, label: t('domains.typeAdvanced') },
            ].map(({ v, icon, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => update('type', v)}
                style={{
                  flex: 1, padding: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: form.type === v ? 'var(--accent)' : 'var(--bg-elevated)',
                  border: `1px solid ${form.type === v ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  color: form.type === v ? '#fff' : 'var(--text-secondary)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </FormField>

        {form.type === 'proxy' && (
          <FormField label={t('domains.port')} hint={t('domains.portHint')}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="3000"
                value={form.port}
                onChange={e => update('port', e.target.value)}
                required
              />
              <Btn type="button" variant="default" onClick={autoPort} disabled={loadingPort} style={{ flexShrink: 0 }}>
                {loadingPort ? <Spinner size={12} /> : t('domains.auto')}
              </Btn>
            </div>
          </FormField>
        )}

        {form.type === 'static' && (
          <FormField label={t('domains.folderPath')} hint={t('domains.folderPathHint', { path: '/var/www/{domain}' })}>
            <input
              placeholder="/var/www/sitem"
              value={form.rootPath}
              onChange={e => update('rootPath', e.target.value)}
            />
          </FormField>
        )}

        {form.type === 'advanced' && (
          <FormField label={t('domains.routes')} hint={t('domains.routesHint')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {form.routes.map((r, i) => (
                <div key={i} className="route-row">
                  <input
                    placeholder="/api/*"
                    value={r.path}
                    onChange={e => updateRoute(i, 'path', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    placeholder={t('domains.portPlaceholder')}
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
                    title={t('domains.removeRoute')}
                    aria-label={t('domains.removeRoute')}
                    className="icon-btn"
                    style={{
                      width: '30px', height: '30px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--red)',
                      cursor: form.routes.length === 1 ? 'not-allowed' : 'pointer',
                      opacity: form.routes.length === 1 ? 0.4 : 1,
                    }}
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              <Btn type="button" variant="default" onClick={addRoute} style={{ alignSelf: 'flex-start' }}>
                {t('domains.addRoute')}
              </Btn>
            </div>
          </FormField>
        )}

        <FormField label={t('domains.appType')}>
          <select value={form.appType} onChange={e => update('appType', e.target.value)}>
            {APP_TYPES.map(at => <option key={at} value={at}>{at}</option>)}
          </select>
        </FormField>

        <FormField label={t('domains.aliasDomains')} hint={t('domains.aliasHintAdd')}>
          <input
            placeholder="example.net, example.org"
            value={form.aliases}
            onChange={e => update('aliases', e.target.value)}
          />
        </FormField>

        <FormField label={t('domains.notes')}>
          <textarea
            rows={2}
            placeholder={t('domains.notesPlaceholder')}
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            style={{ resize: 'none' }}
          />
        </FormField>

        <CaddyExtrasEditor value={extras} onChange={setExtras} />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : t('common.add')}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
