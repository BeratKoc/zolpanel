import { requireAuth, unauthorized } from '@/lib/auth';
import { cloudflare } from '@/lib/server/dns/cloudflare';
import { validateDnsRecord, DnsRecordInput } from '@/lib/server/dns/validate';

export const runtime = 'nodejs';

function mapToCf(record: DnsRecordInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl,
  };
  if (record.type === 'MX' && record.priority !== undefined) {
    body.priority = record.priority;
  }
  return body;
}

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get('zoneId');
    if (!zoneId) {
      return Response.json({ error: 'zoneId gerekli' }, { status: 400 });
    }
    const records = await cloudflare.listRecords(zoneId);
    return Response.json({ records });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const body = await req.json();
    const { zoneId, record } = body as { zoneId?: string; record?: DnsRecordInput };
    if (!zoneId) {
      return Response.json({ error: 'zoneId gerekli' }, { status: 400 });
    }
    if (!record) {
      return Response.json({ error: 'record gerekli' }, { status: 400 });
    }
    const msg = validateDnsRecord(record);
    if (msg) {
      return Response.json({ error: msg }, { status: 400 });
    }
    const result = await cloudflare.createRecord(zoneId, mapToCf(record));
    return Response.json({ record: result });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
