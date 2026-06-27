export interface S3Config { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix?: string; }
export function validateS3Config(c: Partial<S3Config>): string | null {
  if (!c.endpoint || !/^https?:\/\/.+/.test(c.endpoint)) return 'Geçerli endpoint (https://...) gerekli';
  if (!c.region || !c.region.trim()) return 'Region gerekli';
  if (!c.bucket || !/^[a-z0-9.\-]{3,63}$/.test(c.bucket)) return 'Geçerli bucket adı gerekli';
  if (!c.accessKeyId || !c.accessKeyId.trim()) return 'Access Key ID gerekli';
  if (!c.secretAccessKey || !c.secretAccessKey.trim()) return 'Secret Access Key gerekli';
  return null;
}

import { encryptSecret, decryptSecret } from '@/lib/server/secrets';
import { getSetting, setSetting, deleteSetting } from '@/lib/server/db';

export function saveS3Config(c: S3Config): void {
  const stored = { ...c, secretAccessKey: encryptSecret(c.secretAccessKey) };
  setSetting('s3_config', JSON.stringify(stored));
}

export function getS3Config(): S3Config | null {
  const raw = getSetting('s3_config');
  if (!raw) return null;
  const parsed = JSON.parse(raw) as S3Config;
  return { ...parsed, secretAccessKey: decryptSecret(parsed.secretAccessKey) };
}

export function getS3ConfigSafe(): Omit<S3Config, 'secretAccessKey'> | null {
  const raw = getSetting('s3_config');
  if (!raw) return null;
  const { secretAccessKey: _omit, ...rest } = JSON.parse(raw) as S3Config;
  return rest;
}

export function deleteS3Config(): void {
  deleteSetting('s3_config');
}
