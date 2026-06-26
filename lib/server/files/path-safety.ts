import path from 'node:path';

export interface FileEntry {
  name: string;
  type: 'file' | 'dir' | 'other';
  size: number;
  mtime: number;
  mode: string;
}

export class UnsafePathError extends Error {
  constructor(msg = 'Geçersiz yol') { super(msg); this.name = 'UnsafePathError'; }
}

/** Girdi yolunu güvenli, normalize, MUTLAK bir POSIX yola çevirir.
 *  - boş / null-byte / mutlak-olmayan → UnsafePathError
 *  - `..` segmentleri normalize edilir; normalize sonrası kök '/' dışına çıkamaz. */
export function safePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw new UnsafePathError();
  if (input.includes('\0')) throw new UnsafePathError('Yol null-byte içeremez');
  if (!input.startsWith('/')) throw new UnsafePathError('Yol mutlak olmalı (/ ile başlamalı)');
  let normalized = path.posix.normalize(input);
  // normalize sonrası hâlâ mutlak olmalı ve '..' ile köke tırmanmamalı
  if (!normalized.startsWith('/') || normalized.includes('\0')) throw new UnsafePathError();
  // trailing slash kaldır (kök '/' hariç)
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

/** İnsan-okur boyut. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
}
