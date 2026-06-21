'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Spinner, EmptyState, Modal, useToast } from '@/components/ui';
import { ContainerCard } from '@/components/docker/ContainerCard';

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export default function Docker() {
  const t = useTranslations();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsContainer, setLogsContainer] = useState<DockerContainer | null>(null);
  const [logsContent, setLogsContent] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const data = await api.getContainers();
      setContainers(data);
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleStart(container: DockerContainer) {
    setBusyId(container.id);
    try {
      await api.startContainer(container.id);
      show(t('docker.start') + ' — ' + container.name, 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleStop(container: DockerContainer) {
    setBusyId(container.id);
    try {
      await api.stopContainer(container.id);
      show(t('docker.stop') + ' — ' + container.name, 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestart(container: DockerContainer) {
    setBusyId(container.id);
    try {
      await api.restartContainer(container.id);
      show(t('docker.restart') + ' — ' + container.name, 'success');
      load();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleLogs(container: DockerContainer) {
    setLogsContainer(container);
    setLogsContent('');
    setLogsLoading(true);
    try {
      const res = await api.getContainerLogs(container.id);
      setLogsContent(res.logs || '');
    } catch (e: any) {
      setLogsContent(e.message);
    } finally {
      setLogsLoading(false);
    }
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('docker.title')}</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {t('docker.registered', { n: containers.length })}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : containers.length === 0 ? (
        <EmptyState
          icon={<Container size={32} strokeWidth={1.5} />}
          title={t('docker.emptyTitle')}
          subtitle={t('docker.emptySubtitle')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {containers.map(c => (
            <ContainerCard
              key={c.id}
              container={c}
              onStart={() => handleStart(c)}
              onStop={() => handleStop(c)}
              onRestart={() => handleRestart(c)}
              onLogs={() => handleLogs(c)}
              busy={busyId === c.id}
            />
          ))}
        </div>
      )}

      {logsContainer && (
        <Modal
          title={t('docker.logsTitle')}
          onClose={() => setLogsContainer(null)}
          width={700}
        >
          {logsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Spinner size={20} />
            </div>
          ) : (
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
              maxHeight: '60vh',
              overflowY: 'auto',
            }}>
              {logsContent || '(empty)'}
            </pre>
          )}
        </Modal>
      )}
    </div>
  );
}
