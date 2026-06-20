import { addLog, DomainDoc, getDomainById, updateDomain, removeDomain } from '@/lib/server/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { updateDomainSchema } from '@/lib/validation';
import { addDomainToConfig, removeDomainFromConfig, isCaddyRunning } from '@/lib/server/caddy';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const domain = getDomainById(id);
  if (!domain) return Response.json({ error: 'Domain bulunamadı' }, { status: 404 });
  return Response.json(domain);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;
  const parsed = updateDomainSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { notes, aliases, status, appType } = parsed.data;

  const domain = getDomainById(id);
  if (!domain) return Response.json({ error: 'Domain bulunamadı' }, { status: 404 });

  const updates: Partial<DomainDoc> = { updatedAt: new Date().toISOString() };
  if (notes !== undefined) updates.notes = notes;
  if (aliases !== undefined) updates.aliases = aliases;
  if (status !== undefined) updates.status = status;
  if (appType !== undefined) updates.appType = appType;

  updateDomain(id, updates);

  // Status değiştiyse Caddyfile'ı güncelle
  if (status !== undefined) {
    try {
      if (await isCaddyRunning()) {
        if (status === 'offline') {
          await removeDomainFromConfig(domain.domain);
        } else {
          await addDomainToConfig({ ...domain, ...updates });
        }
      }
    } catch (e: any) {
      addLog(domain.domain, 'error', 'Caddy güncelleme hatası: ' + e.message);
    }
  }

  addLog(domain.domain, 'info', 'Domain güncellendi');
  return Response.json({ ...domain, ...updates });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAuth(req))) return unauthorized();
  const { id } = await params;

  const domain = getDomainById(id);
  if (!domain) return Response.json({ error: 'Domain bulunamadı' }, { status: 404 });

  removeDomain(id);

  try {
    if (await isCaddyRunning()) {
      await removeDomainFromConfig(domain.domain);
    }
  } catch (e: any) {
    addLog(domain.domain, 'error', 'Caddy config kaldırma hatası: ' + e.message);
  }

  addLog(domain.domain, 'info', 'Domain silindi');
  return Response.json({ message: 'Domain silindi' });
}
