'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Cpu, RotateCw, ServerOff } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, EmptyState, useToast } from '@/components/ui';
import { ProcessRow } from '@/components/processes/ProcessRow';
import { LogModal } from '@/components/processes/LogModal';
import { StartProcessModal } from '@/components/processes/StartProcessModal';

export default function Processes() {
  const t = useTranslations();
  const [data, setData] = useState<{ available: boolean; processes: any[] }>({ available: false, processes: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [showStart, setShowStart] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const res = await api.getProcesses();
      setData(res);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(name: string, action: string) {
    setActionLoading(name + action);
    try {
      if (action === 'stop') await api.stopProcess(name);
      else if (action === 'restart') await api.restartProcess(name);
      else if (action === 'delete') {
        if (!window.confirm(t('processes.confirmDelete', { name }))) return;
        await api.deleteProcess(name);
      }
      show(t('processes.actionSuccess', { name, action }), 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor: Record<string, any> = {
    online: 'green', stopped: 'red', errored: 'red',
    stopping: 'yellow', launching: 'yellow',
  };

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('processes.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {!data.available ? t('processes.pm2NotFound') : t('processes.processCount', { n: data.processes.length })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Btn variant="default" onClick={load}><RotateCw size={14} strokeWidth={1.75} style={{ marginRight: '6px' }} />{t('processes.refresh')}</Btn>
          {data.available && (
            <Btn variant="primary" onClick={() => setShowStart(true)}>{t('processes.startProcess')}</Btn>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : !data.available ? (
        <EmptyState
          icon={<Cpu size={32} strokeWidth={1.5} />}
          title={t('processes.pm2NotInstalled')}
          subtitle={t('processes.pm2InstallHint', { cmd: 'npm install -g pm2' })}
        />
      ) : data.processes.length === 0 ? (
        <EmptyState
          icon={<ServerOff size={32} strokeWidth={1.5} />}
          title={t('processes.noProcesses')}
          subtitle={t('processes.noProcessesSubtitle')}
          action={<Btn variant="primary" onClick={() => setShowStart(true)}>{t('processes.startProcess')}</Btn>}
        />
      ) : (
        <div>
          {/* Header */}
          <div className="proc-header" style={{
            display: 'grid',
            gridTemplateColumns: '7px 1fr 80px 80px 70px 70px 80px 120px',
            gap: '12px',
            padding: '6px 16px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '6px',
          }}>
            <span></span>
            <span>{t('processes.colName')}</span>
            <span>{t('processes.colStatus')}</span>
            <span>CPU</span>
            <span>RAM</span>
            <span>{t('processes.colRestarts')}</span>
            <span>{t('processes.colUptime')}</span>
            <span style={{ textAlign: 'right' }}>{t('processes.colAction')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.processes.map(p => (
              <ProcessRow
                key={p.id}
                p={p}
                statusColor={statusColor}
                actionLoading={actionLoading}
                onShowLogs={setShowLogs}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      )}

      {showLogs && (
        <LogModal name={showLogs} onClose={() => setShowLogs(null)} />
      )}

      {showStart && (
        <StartProcessModal
          onClose={() => setShowStart(false)}
          onSuccess={() => { setShowStart(false); load(); show(t('processes.started'), 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}
