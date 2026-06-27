export interface S3Config { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; prefix?: string; }
export function validateS3Config(c: Partial<S3Config>): string | null {
  if (!c.endpoint || !/^https?:\/\/.+/.test(c.endpoint)) return 'Geçerli endpoint (https://...) gerekli';
  if (!c.region || !c.region.trim()) return 'Region gerekli';
  if (!c.bucket || !/^[a-z0-9.\-]{3,63}$/.test(c.bucket)) return 'Geçerli bucket adı gerekli';
  if (!c.accessKeyId || !c.accessKeyId.trim()) return 'Access Key ID gerekli';
  if (!c.secretAccessKey || !c.secretAccessKey.trim()) return 'Secret Access Key gerekli';
  return null;
}
