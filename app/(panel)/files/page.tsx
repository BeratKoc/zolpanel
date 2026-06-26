'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Folder, File, Upload, FolderPlus, Edit2, Download, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Btn, Spinner, Modal, useToast } from '@/components/ui';

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
}

interface FileEntry {
  name: string;
  type: 'file' | 'dir' | 'other';
  size: number;
  mtime: number;
  mode: string;
}

interface EditModal {
  path: string;
  content: string;
}

interface ConfirmDelete {
  name: string;
  path: string;
  isDir: boolean;
}

function buildChildPath(parentPath: string, name: string): string {
  return parentPath === '/' ? '/' + name : parentPath + '/' + name;
}

export default function FilesPage() {
  const t = useTranslations();
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const { show, ToastContainer } = useToast();
  const uploadRef = useRef<HTMLInputElement>(null);

  async function load(p: string) {
    setLoading(true);
    try {
      const data = await api.fileList(p);
      setEntries(data.entries ?? []);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Breadcrumb segments
  const segments = path === '/' ? [] : path.split('/').filter(Boolean);

  function navigateTo(idx: number) {
    if (idx < 0) { setPath('/'); return; }
    setPath('/' + segments.slice(0, idx + 1).join('/'));
  }

  async function handleEdit(entry: FileEntry) {
    const fullPath = buildChildPath(path, entry.name);
    try {
      const data = await api.fileRead(fullPath);
      if (data.tooLarge) { show(t('files.tooLarge'), 'error'); return; }
      setEditContent(data.content ?? '');
      setEditModal({ path: fullPath, content: data.content ?? '' });
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  async function handleSave() {
    if (!editModal) return;
    setEditSaving(true);
    try {
      await api.fileSave(editModal.path, editContent);
      show(t('files.save'), 'success');
      setEditModal(null);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDownload(entry: FileEntry) {
    const fullPath = buildChildPath(path, entry.name);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/files/download?path=' + encodeURIComponent(fullPath), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  async function handleRename(entry: FileEntry) {
    const oldPath = buildChildPath(path, entry.name);
    const newName = window.prompt(t('files.newName'), entry.name);
    if (!newName || newName === entry.name) return;
    const newPath = buildChildPath(path, newName);
    try {
      await api.fileRename(oldPath, newPath);
      show(t('files.rename'), 'success');
      load(path);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDelete) return;
    try {
      await api.fileDelete(confirmDelete.path, confirmDelete.isDir);
      show(t('files.delete'), 'success');
      setConfirmDelete(null);
      load(path);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  async function handleNewFolder() {
    const name = window.prompt(t('files.folderName'));
    if (!name) return;
    const newPath = buildChildPath(path, name);
    try {
      await api.fileMkdir(newPath);
      show(t('files.newFolder'), 'success');
      load(path);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  async function handleUpload(file: File) {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/files/upload?path=' + encodeURIComponent(path), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const msg = d.error || 'Upload failed';
        if (msg.includes('2MB') || msg.includes('200MB') || msg.includes('too large') || msg.includes('büyük')) {
          show(t('files.tooLarge'), 'error');
        } else {
          show(msg, 'error');
        }
        return;
      }
      show(t('files.upload'), 'success');
      load(path);
    } catch (e: unknown) {
      show((e as Error).message, 'error');
    }
  }

  return (
    <div className="page" style={{ animation: 'fadeIn 0.2s ease' }}>
      <ToastContainer />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{t('files.title')}</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Btn variant="default" size="sm" onClick={handleNewFolder}>
            <FolderPlus size={13} strokeWidth={1.75} />
            {t('files.newFolder')}
          </Btn>
          <Btn variant="default" size="sm" onClick={() => uploadRef.current?.click()}>
            <Upload size={13} strokeWidth={1.75} />
            {t('files.upload')}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => load(path)} aria-label="Refresh">
            <RefreshCw size={13} strokeWidth={1.75} />
          </Btn>
          <input
            ref={uploadRef}
            type="file"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) { handleUpload(file); e.target.value = ''; }
            }}
          />
        </div>
      </div>

      {/* Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '14px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)',
      }}>
        <button
          onClick={() => setPath('/')}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '0 2px' }}
        >
          /
        </button>
        {segments.map((seg, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <button
              onClick={() => navigateTo(i)}
              style={{
                background: 'none', border: 'none',
                color: i === segments.length - 1 ? 'var(--text-primary)' : 'var(--accent)',
                cursor: i === segments.length - 1 ? 'default' : 'pointer',
                fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '0 2px',
              }}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size={24} />
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <Folder size={32} strokeWidth={1.5} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          {t('files.empty')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>{t('files.name')}</th>
                <th style={{ ...thStyle, minWidth: '70px' }}>{t('files.size')}</th>
                <th style={{ ...thStyle, minWidth: '150px' }}>{t('files.modified')}</th>
                <th style={{ ...thStyle, minWidth: '80px' }}>{t('files.perms')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <FileRow
                  key={entry.name}
                  entry={entry}
                  t={t}
                  onOpen={() => {
                    if (entry.type === 'dir') setPath(buildChildPath(path, entry.name));
                  }}
                  onEdit={() => handleEdit(entry)}
                  onDownload={() => handleDownload(entry)}
                  onRename={() => handleRename(entry)}
                  onDelete={() => setConfirmDelete({
                    name: entry.name,
                    path: buildChildPath(path, entry.name),
                    isDir: entry.type === 'dir',
                  })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <Modal title={`${t('files.edit')}: ${editModal.path}`} onClose={() => setEditModal(null)} width={680}>
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '320px',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              padding: '12px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
            <Btn variant="default" size="sm" onClick={() => setEditModal(null)}>
              {t('files.cancel')}
            </Btn>
            <Btn variant="primary" size="sm" onClick={handleSave} disabled={editSaving}>
              {editSaving ? <Spinner size={12} /> : null}
              {t('files.save')}
            </Btn>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <Modal
          title={t('files.delete')}
          onClose={() => setConfirmDelete(null)}
          width={400}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '20px' }}>
            {t('files.deleteConfirm', { name: confirmDelete.name })}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn variant="default" size="sm" onClick={() => setConfirmDelete(null)}>
              {t('files.cancel')}
            </Btn>
            <Btn
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirmed}
              style={{ background: 'var(--red)', border: '1px solid var(--red)', color: '#fff' }}
            >
              {t('files.delete')}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontWeight: 400,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

interface FileRowProps {
  entry: FileEntry;
  t: ReturnType<typeof useTranslations>;
  onOpen: () => void;
  onEdit: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function FileRow({ entry, t, onOpen, onEdit, onDownload, onRename, onDelete }: FileRowProps) {
  const isDir = entry.type === 'dir';
  const date = new Date(entry.mtime).toLocaleString();

  return (
    <tr style={{
      borderBottom: '1px solid var(--border)',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-elevated)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
    >
      {/* Name */}
      <td style={{ padding: '8px 10px', minWidth: '160px' }}>
        <button
          onClick={isDir ? onOpen : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: 'none',
            border: 'none',
            color: isDir ? 'var(--accent)' : 'var(--text-primary)',
            cursor: isDir ? 'pointer' : 'default',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            padding: 0,
            textAlign: 'left',
            maxWidth: '260px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {isDir
            ? <Folder size={14} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--yellow)' }} />
            : <File size={14} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
          {entry.name}
        </button>
      </td>
      {/* Size */}
      <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {isDir ? '—' : formatSize(entry.size)}
      </td>
      {/* Modified */}
      <td style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {date}
      </td>
      {/* Perms */}
      <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {entry.mode}
      </td>
      {/* Actions */}
      <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', gap: '4px' }}>
          {!isDir && (
            <>
              <Btn size="sm" variant="ghost" onClick={onEdit} aria-label={t('files.edit')}>
                <Edit2 size={12} strokeWidth={1.75} />
              </Btn>
              <Btn size="sm" variant="ghost" onClick={onDownload} aria-label={t('files.download')}>
                <Download size={12} strokeWidth={1.75} />
              </Btn>
            </>
          )}
          <Btn size="sm" variant="ghost" onClick={onRename} aria-label={t('files.rename')}>
            <RefreshCw size={12} strokeWidth={1.75} />
          </Btn>
          <Btn size="sm" variant="ghost" onClick={onDelete} aria-label={t('files.delete')} style={{ color: 'var(--red)' }}>
            <Trash2 size={12} strokeWidth={1.75} />
          </Btn>
        </div>
      </td>
    </tr>
  );
}
