export interface CronJob { id: number; schedule: string; command: string; enabled: boolean; }

const DISABLED_PREFIX = '#ZOLPANEL_DISABLED: ';
const SPECIALS = new Set(['@reboot', '@hourly', '@daily', '@weekly', '@monthly', '@yearly', '@annually']);
const FIELD_RE = /^[0-9*,/-]+$/;

/** Tek bir cron alanı (dakika/saat/...) geçerli karakterlerden mi oluşuyor. */
function validField(f: string): boolean { return FIELD_RE.test(f); }

/** Schedule geçerli mi: 5 alan veya @keyword. */
export function isValidSchedule(s: string): boolean {
  const t = s.trim();
  if (SPECIALS.has(t)) return true;
  const parts = t.split(/\s+/);
  return parts.length === 5 && parts.every(validField);
}

/** Bir cron veri satırını {schedule, command}'a ayırır; geçersizse null. */
function parseLine(line: string): { schedule: string; command: string } | null {
  const t = line.trim();
  if (!t) return null;
  if (t.startsWith('@')) {
    const sp = t.indexOf(' ');
    if (sp === -1) return null;
    const schedule = t.slice(0, sp), command = t.slice(sp + 1).trim();
    return command && SPECIALS.has(schedule) ? { schedule, command } : null;
  }
  const parts = t.split(/\s+/);
  if (parts.length < 6) return null;
  const schedule = parts.slice(0, 5).join(' ');
  if (!isValidSchedule(schedule)) return null;
  const command = parts.slice(5).join(' ');
  return command ? { schedule, command } : null;
}

/** Metni job listesine çevirir (aktif satırlar + #ZOLPANEL_DISABLED: ile işaretli pasifler). */
export function parseCrontab(text: string): CronJob[] {
  const jobs: CronJob[] = [];
  let id = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(DISABLED_PREFIX)) {
      const p = parseLine(trimmed.slice(DISABLED_PREFIX.length));
      if (p) jobs.push({ id: id++, ...p, enabled: false });
      continue;
    }
    if (trimmed.startsWith('#') || !trimmed) continue; // gerçek yorum/boş → job değil
    const p = parseLine(line);
    if (p) jobs.push({ id: id++, ...p, enabled: true });
  }
  return jobs;
}

/** Job listesini, orijinal metindeki opak satırları (env/yorum) koruyarak yeniden kurar.
 *  Strateji: orijinaldeki tüm AKTİF cron satırlarını + DISABLED işaretlerini kaldır,
 *  geri kalan opak satırları koru, sonuna güncel job'ları (aktif/pasif) ekle. */
export function serializeCrontab(jobs: CronJob[], originalText: string): string {
  const opaque: string[] = [];
  for (const line of originalText.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith(DISABLED_PREFIX)) continue;     // eski pasif işaret → düş
    if (t.startsWith('#')) { opaque.push(line); continue; } // gerçek yorum → koru
    if (parseLine(line)) continue;                   // eski aktif cron → düş (jobs'tan yeniden yazılacak)
    opaque.push(line);                               // env vb. opak → koru
  }
  const jobLines = jobs.map(j =>
    j.enabled ? `${j.schedule} ${j.command}` : `${DISABLED_PREFIX}${j.schedule} ${j.command}`);
  return [...opaque, ...jobLines].join('\n') + '\n';
}
