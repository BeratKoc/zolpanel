import { requireAuth, unauthorized } from '@/lib/auth';
import { readCrontab, writeCrontab } from '@/lib/server/cron/exec';
import { parseCrontab, serializeCrontab, isValidSchedule, type CronJob } from '@/lib/server/cron/crontab';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try { return Response.json({ jobs: parseCrontab(await readCrontab()) }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}

export async function POST(req: Request) {
  if (!(await requireAuth(req))) return unauthorized();
  try {
    const { jobs } = await req.json() as { jobs: CronJob[] };
    if (!Array.isArray(jobs)) return Response.json({ error: 'jobs dizisi gerekli' }, { status: 400 });
    for (const j of jobs) {
      if (typeof j.command !== 'string' || !j.command.trim()) return Response.json({ error: 'Komut boş olamaz' }, { status: 400 });
      if (/[\r\n]/.test(j.command)) return Response.json({ error: 'Komut yeni satır içeremez' }, { status: 400 });
      if (!isValidSchedule(j.schedule)) return Response.json({ error: 'Geçersiz zamanlama: ' + j.schedule }, { status: 400 });
    }
    const original = await readCrontab();
    await writeCrontab(serializeCrontab(jobs, original));
    return Response.json({ jobs: parseCrontab(await readCrontab()) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
