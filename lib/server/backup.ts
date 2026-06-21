import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { addLog, checkpointDb } from './db';
import { reloadCaddy } from './caddy';

declare global { // eslint-disable-next-line no-var
  var __zolpanelBackup: boolean | undefined; }

const INSTALL_DIR = process.env.INSTALL_DIR || process.cwd();
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(INSTALL_DIR, 'backups');
const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'db', 'data');
const CADDYFILE = process.env.CADDYFILE_PATH || '/etc/caddy/Caddyfile';
const KEEP = Number(process.env.BACKUP_KEEP) || 10;
const NAME_RE = /^zolpanel-backup-[0-9TZ:-]+\.tar\.gz$/;

export interface BackupInfo { name: string; size: number; createdAt: string; }

export function assertSafeBackupName(name: string): void {
  if (typeof name !== 'string' || path.basename(name) !== name || !NAME_RE.test(name)) {
    throw new Error('Geçersiz yedek adı');
  }
}
export function backupFilePath(name: string): string {
  assertSafeBackupName(name);
  const p = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(p)) throw new Error('Yedek bulunamadı');
  return p;
}
function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (e, _o, se) => e ? rej(new Error(se || e.message)) : res()));
}
// En eskileri (son N hariç) seç. Adlar zaman-damgalı → leksikografik sıralama = kronolojik.
export function pickToPrune(names: string[], keep: number): string[] {
  const sorted = [...names].sort();
  return sorted.length > keep ? sorted.slice(0, sorted.length - keep) : [];
}
export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((n) => NAME_RE.test(n)).map((name) => {
    const st = fs.statSync(path.join(BACKUP_DIR, name));
    return { name, size: st.size, createdAt: st.mtime.toISOString() };
  }).sort((a, b) => b.name.localeCompare(a.name));
}
export function deleteBackup(name: string): void {
  fs.rmSync(backupFilePath(name));
}
export async function createBackup(): Promise<BackupInfo> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `zolpanel-backup-${ts}.tar.gz`;
  // WAL'ı ana dosyaya yaz ki commit'lenmiş tüm veri zolpanel.db'de olsun
  // (yedek -wal/-shm içermiyor). TRUNCATE sonrası ana dosya tutarlı.
  checkpointDb();
  // tar -C ile dosyaları köke göre ekle (mutlak yol uyarısından kaçın)
  const args = ['-czf', path.join(BACKUP_DIR, name)];
  const dbFile = path.join(DB_DIR, 'zolpanel.db');
  if (fs.existsSync(dbFile)) args.push('-C', DB_DIR, 'zolpanel.db');
  if (fs.existsSync(CADDYFILE)) args.push('-C', path.dirname(CADDYFILE), path.basename(CADDYFILE));
  await exec('tar', args);
  // retention
  for (const old of pickToPrune(listBackups().map((b) => b.name), KEEP)) {
    try { fs.rmSync(path.join(BACKUP_DIR, old)); } catch { /* yoksay */ }
  }
  const st = fs.statSync(path.join(BACKUP_DIR, name));
  addLog('system', 'info', `Yedek alındı: ${name} (${Math.round(st.size / 1024)} KB)`);
  return { name, size: st.size, createdAt: st.mtime.toISOString() };
}

export async function restoreBackup(name: string): Promise<void> {
  const file = backupFilePath(name);
  const staging = path.join(BACKUP_DIR, '.restore-tmp');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  await exec('tar', ['-xzf', file, '-C', staging]);

  // Caddyfile: STAGED kopyayı ÖNCE validate et (canlı dosyayı asla geçersiz bırakma),
  // ancak geçerliyse canlıya yaz + reload. (syncCaddyConfig ile aynı güvenli desen.)
  const stagedCaddy = path.join(staging, path.basename(CADDYFILE));
  if (fs.existsSync(stagedCaddy)) {
    try { await exec('caddy', ['validate', '--config', stagedCaddy, '--adapter', 'caddyfile']); }
    catch (e) { throw new Error('Yedekteki Caddyfile geçersiz — geri yükleme iptal (canlı dosyaya dokunulmadı)'); }
    fs.copyFileSync(stagedCaddy, CADDYFILE);
    await reloadCaddy().catch((e) => console.error('[backup] restore caddy reload hata:', e));
  }
  // DB: atomik değişim (çalışan bağlantı eski inode'da kalır; restart yeni dosyayı açar)
  const stagedDb = path.join(staging, 'zolpanel.db');
  if (fs.existsSync(stagedDb)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    const tmp = path.join(DB_DIR, 'zolpanel.db.restoring');
    fs.copyFileSync(stagedDb, tmp);
    fs.renameSync(tmp, path.join(DB_DIR, 'zolpanel.db'));
    // Eski WAL/SHM'yi sil — restart'ta restore edilmiş ana dosyanın üstüne
    // bayat wal replay olmasın (WAL modunda kritik). Çalışan süreç kendi
    // inode handle'larını tutar; dosya girdilerini silmek onu bozmaz.
    for (const sfx of ['-wal', '-shm']) {
      try { fs.rmSync(path.join(DB_DIR, `zolpanel.db${sfx}`), { force: true }); } catch { /* yoksay */ }
    }
  }
  fs.rmSync(staging, { recursive: true, force: true });
  addLog('system', 'warn', `Geri yükleme yapıldı: ${name} — panel yeniden başlatılıyor`);
  // Yanıt aktıktan sonra paneli yeniden başlat (restore edilmiş DB'yi açmak için)
  setTimeout(() => { execFile('pm2', ['restart', 'zolpanel'], () => {}); }, 1200);
}

export function startBackupScheduler(): void {
  if (globalThis.__zolpanelBackup) return;
  globalThis.__zolpanelBackup = true;
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS) || 24;
  setInterval(() => { createBackup().catch((e) => console.error('[backup] zamanlanmış hata:', e)); }, hours * 60 * 60 * 1000);
  console.log(`💾 Yedek zamanlayıcı başlatıldı (${hours}sa)`);
}
