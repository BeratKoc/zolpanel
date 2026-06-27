import crypto from 'node:crypto';

function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
export function sha256hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
/** AWS SigV4 imzalama anahtarı (HMAC zinciri). */
export function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

export interface SignOpts {
  method: string; endpoint: string; region: string; bucket: string;
  key: string; accessKeyId: string; secretAccessKey: string;
  payload: Buffer; amzDate: string; dateStamp: string; // amzDate=YYYYMMDDTHHMMSSZ, dateStamp=YYYYMMDD
  query?: string; extraHeaders?: Record<string, string>;
}
/** S3 path-style isteği imzalar; {url, headers} döner. */
export function signS3Request(o: SignOpts): { url: string; headers: Record<string, string> } {
  const service = 's3';
  const host = o.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const canonicalUri = `/${o.bucket}/${o.key}`.replace(/\/+/g, '/');
  const canonicalQuery = o.query || '';
  const payloadHash = sha256hex(o.payload);
  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': o.amzDate,
    ...(o.extraHeaders || {}),
  };
  const sortedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[Object.keys(headers).find(h => h.toLowerCase() === k)!].trim()}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalRequest = [o.method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${o.dateStamp}/${o.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', o.amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signingKey = getSignatureKey(o.secretAccessKey, o.dateStamp, o.region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url: `https://${host}${canonicalUri}${canonicalQuery ? '?' + canonicalQuery : ''}`, headers };
}
