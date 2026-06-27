import { signS3Request } from './sigv4';
import type { S3Config } from './config';

export function s3Now(): { amzDate: string; dateStamp: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getUTCFullYear();
  const month = pad(now.getUTCMonth() + 1);
  const day = pad(now.getUTCDate());
  const hours = pad(now.getUTCHours());
  const minutes = pad(now.getUTCMinutes());
  const seconds = pad(now.getUTCSeconds());
  const dateStamp = `${year}${month}${day}`;
  const amzDate = `${dateStamp}T${hours}${minutes}${seconds}Z`;
  return { amzDate, dateStamp };
}

export async function putObject(cfg: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const { amzDate, dateStamp } = s3Now();
  const { url, headers } = signS3Request({
    method: 'PUT',
    endpoint: cfg.endpoint,
    region: cfg.region,
    bucket: cfg.bucket,
    key,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    payload: body,
    amzDate,
    dateStamp,
    extraHeaders: { 'content-type': contentType },
  });
  const res = await fetch(url, { method: 'PUT', headers, body: body as unknown as BodyInit });
  if (!res.ok) {
    throw new Error('S3 yükleme hatası: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  }
}

export interface S3Object { key: string; size: number; }

export async function listObjects(cfg: S3Config): Promise<S3Object[]> {
  const { amzDate, dateStamp } = s3Now();
  const prefix = cfg.prefix || '';
  const query = 'list-type=2' + (prefix ? '&prefix=' + encodeURIComponent(prefix) : '');
  const { url, headers } = signS3Request({
    method: 'GET',
    endpoint: cfg.endpoint,
    region: cfg.region,
    bucket: cfg.bucket,
    key: '',
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    payload: Buffer.alloc(0),
    amzDate,
    dateStamp,
    query,
  });
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new Error('S3 liste hatası: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  }
  const xml = await res.text();
  const objects: S3Object[] = [];
  const contentRe = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentRe.exec(xml)) !== null) {
    const block = match[1];
    const keyMatch = /<Key>([\s\S]*?)<\/Key>/.exec(block);
    const sizeMatch = /<Size>([\s\S]*?)<\/Size>/.exec(block);
    if (keyMatch && sizeMatch) {
      objects.push({ key: keyMatch[1], size: Number(sizeMatch[1]) });
    }
  }
  return objects;
}

export async function testConnection(cfg: S3Config): Promise<void> {
  await listObjects(cfg);
}
