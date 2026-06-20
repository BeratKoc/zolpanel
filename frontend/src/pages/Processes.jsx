import { useState, useEffect } from 'react';
import { api } from '../api';
import { Btn, Badge, StatusDot, Modal, FormField, Spinner, EmptyState, useToast } from '../components/ui';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}

function formatUptime(ms) {
  if (!ms) return '-';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 86400) + 'd';
}

export default function Processes() {
  const [data, setData] = useState({ available: false, processes: [] });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showLogs, setShowLogs] = useState(null);
  const [showStart, setShowStart] = useState(false);
  const { show, ToastContainer } = useToast();

  async function load() {
    try {
      const res = await api.getProcesses();
      setData(res);
    } catch (e) {
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

  async function handleAction(name, action) {
    setActionLoading(name + action);
    try {
      if (action === 'stop') await api.stopProcess(name);
      else if (action === 'restart') await api.restartProcess(name);
      else if (action === 'delete') {
        if (!window.confirm(`"${name}" process'i silinsin mi?`)) return;
        await api.deleteProcess(name);
      }
      show(`${name} ${action} başarılı`, 'success');
      load();
    } catch (e) {
      show(e.message, 'error');
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor = {
    online: 'green', stopped: 'red', errored: 'red',
    stopping: 'yellow', launching: 'yellow',
  };

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 500 }}>Processes</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {!data.available ? 'PM2 bulunamadı' : `${data.processes.length} process`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Btn variant="default" onClick={load}>↻ Yenile</Btn>
          {data.available && (
            <Btn variant="primary" onClick={() => setShowStart(true)}>+ Process Başlat</Btn>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : !data.available ? (
        <EmptyState
          icon="⚙️"
          title="PM2 kurulu değil"
          subtitle="Process yönetimi için PM2 gerekli. SSH ile bağlanıp kurun: npm install -g pm2"
        />
      ) : data.processes.length === 0 ? (
        <EmptyState
          icon="⚡"
          title="Çalışan process yok"
          subtitle="PM2 ile yönetilen bir uygulama başlatın"
          action={<Btn variant="primary" onClick={() => setShowStart(true)}>+ Process Başlat</Btn>}
        />
      ) : (
        <div>
          {/* Header */}
          <div style={{
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
            <span>İsim</span>
            <span>Durum</span>
            <span>CPU</span>
            <span>RAM</span>
            <span>Restart</span>
            <span>Uptime</span>
            <span style={{ textAlign: 'right' }}>Aksiyon</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.processes.map(p => (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 16px',
                  display: 'grid',
                  gridTemplateColumns: '7px 1fr 80px 80px 70px 70px 80px 120px',
                  gap: '12px',
                  alignItems: 'center',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <StatusDot status={p.status === 'online' ? 'active' : 'offline'} />

                <div>
                  <span style={{ fontSize: '13px', fontWeight: 400 }}>{p.name}</span>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
                    pid {p.pid || '-'}
                  </p>
                </div>

                <Badge color={statusColor[p.status] || 'default'}>{p.status}</Badge>

                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  color: p.cpu > 50 ? 'var(--yellow)' : 'var(--text-secondary)',
                }}>
                  {p.cpu}%
                </span>

                <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {formatBytes(p.memory)}
                </span>

                <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: p.restarts > 5 ? 'var(--red)' : 'var(--text-secondary)' }}>
                  {p.restarts}
                </span>

                <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {formatUptime(p.uptime)}
                </span>

                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <ProcBtn
                    onClick={() => setShowLogs(p.name)}
                    title="Loglar"
                    loading={actionLoading === p.name + 'logs'}
                  >📋</ProcBtn>

                  {p.status === 'online' ? (
                    <ProcBtn
                      onClick={() => handleAction(p.name, 'stop')}
                      title="Durdur"
                      loading={actionLoading === p.name + 'stop'}
                    >⏸</ProcBtn>
                  ) : (
                    <ProcBtn
                      onClick={() => handleAction(p.name, 'restart')}
                      title="Başlat"
                      loading={actionLoading === p.name + 'restart'}
                    >▶</ProcBtn>
                  )}

                  <ProcBtn
                    onClick={() => handleAction(p.name, 'restart')}
                    title="Yeniden Başlat"
                    loading={actionLoading === p.name + 'restart'}
                  >↺</ProcBtn>

                  <ProcBtn
                    onClick={() => handleAction(p.name, 'delete')}
                    title="Sil"
                    danger
                    loading={actionLoading === p.name + 'delete'}
                  >🗑</ProcBtn>
                </div>
              </div>
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
          onSuccess={() => { setShowStart(false); load(); show('Process başlatıldı', 'success'); }}
          onError={msg => show(msg, 'error')}
        />
      )}
    </div>
  );
}

function ProcBtn({ children, onClick, title, danger, loading }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={loading}
      style={{
        width: '26px', height: '26px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        fontSize: '12px',
        color: danger ? 'var(--red)' : 'var(--text-secondary)',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {loading ? <Spinner size={10} /> : children}
    </button>
  );
}

function LogModal({ name, onClose }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(100);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getProcessLogs(name, lines);
      setLogs(data.logs || 'Log bulunamadı');
    } catch (e) {
      setLogs('Log alınamadı: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [lines]);

  return (
    <Modal title={`Loglar: ${name}`} onClose={onClose} width={720}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Son</span>
        {[50, 100, 200].map(n => (
          <Btn
            key={n}
            size="sm"
            variant={lines === n ? 'primary' : 'default'}
            onClick={() => setLines(n)}
          >
            {n} satır
          </Btn>
        ))}
        <Btn size="sm" variant="ghost" onClick={load}>↻</Btn>
      </div>

      <div style={{
        background: 'var(--bg-base)',
        borderRadius: 'var(--radius)',
        padding: '12px',
        height: '360px',
        overflow: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <Spinner />
          </div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{logs}</pre>
        )}
      </div>
    </Modal>
  );
}

function StartProcessModal({ onClose, onSuccess, onError }) {
  const [form, setForm] = useState({ name: '', script: '', cwd: '/var/www' });
  const [submitting, setSubmitting] = useState(false);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.startProcess(form);
      onSuccess();
    } catch (e) {
      onError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Process Başlat" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Process ismi">
          <input placeholder="myapp" value={form.name} onChange={e => update('name', e.target.value)} required autoFocus />
        </FormField>
        <FormField label="Script yolu" hint="Çalıştırılacak dosya (ör: server.js, index.js)">
          <input placeholder="server.js" value={form.script} onChange={e => update('script', e.target.value)} required />
        </FormField>
        <FormField label="Çalışma dizini">
          <input placeholder="/var/www/myapp" value={form.cwd} onChange={e => update('cwd', e.target.value)} />
        </FormField>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <Btn type="button" variant="ghost" onClick={onClose}>İptal</Btn>
          <Btn type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner size={13} /> : 'Başlat'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
