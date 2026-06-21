import fs from 'fs';
import { exec, execFile } from 'child_process';
import { addLog } from './db';
import type { DomainDoc, DomainRoute } from './db';

// buildDomainBlock için girdi tipi: domain ve type zorunlu, gerisi opsiyonel.
export type DomainConfig = Pick<DomainDoc, 'domain' | 'type'> &
  Partial<Pick<DomainDoc, 'port' | 'rootPath' | 'aliases' | 'routes'>>;

// CADDYFILE_PATH'i çağrı anında çöz: test, import'tan SONRA env'i set ediyor.
// Davranış aynı (env || varsayılan), sadece okuma zamanı geç bağlanıyor.
const CADDYFILE_PATH = (): string =>
  process.env.CADDYFILE_PATH || '/etc/caddy/Caddyfile';

// Panel tarafından YÖNETİLMEYEN, asla silinmemesi/değiştirilmemesi gereken bloklar.
// .env'den PROTECTED_DOMAINS=foo.com,bar.com ile genişletilebilir.
export const PROTECTED_DOMAINS = (process.env.PROTECTED_DOMAINS || 'panel.zolvix.app')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function readCaddyfile(): string {
  const p = CADDYFILE_PATH();
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf-8');
}

export function writeCaddyfile(content: string): void {
  fs.writeFileSync(CADDYFILE_PATH(), content, 'utf-8');
}

export function reloadCaddy(): Promise<string> {
  return new Promise((resolve, reject) => {
    exec('systemctl reload caddy', (err, stdout, stderr) => {
      if (err) {
        addLog('system', 'error', 'Caddy reload başarısız: ' + stderr);
        reject(new Error(stderr));
      } else {
        addLog('system', 'info', 'Caddy başarıyla yeniden yüklendi');
        resolve(stdout);
      }
    });
  });
}

export function isCaddyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('pgrep -x caddy', (err) => resolve(!err));
  });
}

export function buildDomainBlock(domainConfig: DomainConfig): string {
  const { domain, type, port, rootPath, aliases, routes } = domainConfig;

  // Bare alias'ı (nokta içermeyen, ör. "www") FQDN'e genişlet: "www" -> "www.<domain>".
  // Aksi halde Caddy "www"yu ayrı/anlamsız bir host sayar ve alt-alan adı servis edilmez.
  const expandedAliases = (aliases || []).map((a) =>
    a.includes('.') ? a : `${a}.${domain}`
  );
  const allDomains =
    expandedAliases.length > 0 ? [domain, ...expandedAliases].join(', ') : domain;

  if (type === 'static') {
    return `${allDomains} {\n    root * ${rootPath || '/var/www/' + domain}\n    file_server\n    encode gzip\n}\n\n`;
  }

  if (type === 'proxy') {
    return `${allDomains} {\n    reverse_proxy localhost:${port}\n    encode gzip\n}\n\n`;
  }

  if (type === 'advanced' && routes && routes.length > 0) {
    // Aynı path birden fazla verilmişse ilkini koru — Caddy'de sonraki "handle"
    // zaten erişilemez olur; çift "handle /*" üretmeyi engeller.
    const seenPaths = new Set<string>();
    const uniqueRoutes = routes.filter((r) => {
      if (seenPaths.has(r.path)) return false;
      seenPaths.add(r.path);
      return true;
    });
    const handles = uniqueRoutes
      .map((r) => {
        if (r.type === 'websocket') {
          return `    handle ${r.path} {\n        reverse_proxy localhost:${r.port} {\n            transport http {\n                read_timeout 0\n                write_timeout 0\n            }\n        }\n    }`;
        }
        return `    handle ${r.path} {\n        reverse_proxy localhost:${r.port}\n    }`;
      })
      .join('\n');
    return `${allDomains} {\n${handles}\n    encode gzip\n}\n\n`;
  }

  return '';
}

// Bir blok başlığı satırından domain token'larını çıkarır.
// "a.com, www.a.com {" -> ["a.com", "www.a.com"]
function headerTokens(line: string): string[] {
  const headerPart = line.split('{')[0];
  return headerPart
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// Verilen domain'e ait bloğu kaldırır.
// ÖNEMLİ: Eşleştirme TAM TOKEN bazlıdır (substring DEĞİL). Böylece
// "zolvix.app" kaldırılırken "panel.zolvix.app" bloğuna dokunulmaz.
// Nested brace (advanced/websocket) ve brace'in alt satırda olduğu durumları da destekler.
export function removeDomainBlock(content: string, domain: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const startsBlock = line.includes('{') || lines[i + 1]?.trim() === '{';
    const isTarget =
      trimmed &&
      !trimmed.startsWith('#') &&
      startsBlock &&
      headerTokens(line).includes(domain);

    if (!isTarget) {
      result.push(line);
      i++;
      continue;
    }

    // Hedef bloğu atla: ilk '{' görüldükten sonra brace dengesi 0'a dönene kadar.
    let depth = 0;
    let seenOpen = false;
    while (i < lines.length) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          depth++;
          seenOpen = true;
        }
        if (ch === '}') depth--;
      }
      i++;
      if (seenOpen && depth <= 0) break;
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** @deprecated Kullanım dışı — domain route'ları artık syncCaddyConfig(getAllDomains()) kullanıyor. */
export async function addDomainToConfig(domainConfig: DomainConfig): Promise<void> {
  if (PROTECTED_DOMAINS.includes(domainConfig.domain)) {
    addLog(
      domainConfig.domain,
      'warn',
      'Korumalı domain, panel tarafından yönetilmiyor (Caddyfile değiştirilmedi)'
    );
    return;
  }
  let content = readCaddyfile();
  // Önce varsa eski bloğu kaldır
  content = removeDomainBlock(content, domainConfig.domain);
  const newBlock = buildDomainBlock(domainConfig);
  content = content.trimEnd() + '\n\n' + newBlock;
  writeCaddyfile(content);
  addLog(domainConfig.domain, 'info', `Caddyfile güncellendi (${domainConfig.type})`);
  await reloadCaddy();
}

/** @deprecated Kullanım dışı — domain route'ları artık syncCaddyConfig(getAllDomains()) kullanıyor. */
export async function removeDomainFromConfig(domain: string): Promise<void> {
  if (PROTECTED_DOMAINS.includes(domain)) {
    addLog(domain, 'warn', "Korumalı domain, Caddyfile'dan kaldırılmadı");
    return;
  }
  let content = readCaddyfile();
  content = removeDomainBlock(content, domain);
  writeCaddyfile(content);
  addLog(domain, 'info', "Domain Caddyfile'dan kaldırıldı");
  await reloadCaddy();
}

// parseCaddyfile çıktısı için tip.
export interface ParsedDomain {
  domain: string;
  aliases: string[];
  type: 'proxy' | 'static' | 'unknown';
  port: number | null;
  rootPath: string | null;
}

// Caddyfile'ı brace-aware (nested brace destekli) parse eder.
// Eski regex (/\{([^}]*)\}/) advanced/websocket bloklarındaki iç içe brace'lerde
// bozuluyordu; bu sürüm blok gövdesini derinlik sayarak doğru toplar.
export function parseCaddyfile(): ParsedDomain[] {
  const content = readCaddyfile();
  const lines = content.split('\n');
  const domains: ParsedDomain[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const startsBlock = line.includes('{') || lines[i + 1]?.trim() === '{';

    if (!trimmed || trimmed.startsWith('#') || !startsBlock) {
      i++;
      continue;
    }

    const header = line.split('{')[0].trim();
    const domainList = header.split(/[\s,]+/).filter((d) => d.includes('.'));

    // Blok gövdesini brace dengesi 0'a dönene kadar topla
    let depth = 0;
    let seenOpen = false;
    const bodyLines: string[] = [];
    while (i < lines.length) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          depth++;
          seenOpen = true;
        }
        if (ch === '}') depth--;
      }
      if (seenOpen) bodyLines.push(lines[i]);
      i++;
      if (seenOpen && depth <= 0) break;
    }

    if (domainList.length === 0) continue;

    const body = bodyLines.join('\n');
    const isProxy = body.includes('reverse_proxy');
    const isStatic = body.includes('file_server');
    const portMatch = body.match(/reverse_proxy\s+(?:localhost|127\.0\.0\.1):(\d+)/);
    const rootMatch = body.match(/root\s+\*\s+(\S+)/);
    domains.push({
      domain: domainList[0],
      aliases: domainList.slice(1),
      type: isProxy ? 'proxy' : isStatic ? 'static' : 'unknown',
      port: portMatch ? parseInt(portMatch[1]) : null,
      rootPath: rootMatch ? rootMatch[1] : null,
    });
  }
  return domains;
}

// ─── Managed-region sentinels ────────────────────────────────────────────────
// Caddyfile içinde otomatik üretilen bölgeyi işaretlemek için kullanılan sabit satırlar.
export const MANAGED_START = '# >>> zolpanel-managed (otomatik üretildi — elle düzenleme) >>>';
export const MANAGED_END = '# <<< zolpanel-managed <<<';

// Mevcut Caddyfile içeriğinden managed bölgeyi ve managedNames listesindeki
// tüm domain bloklarını çıkarır; korunması gereken (unmanaged) içeriği döndürür.
export function extractUnmanaged(content: string, managedNames: string[]): string {
  const s = content.indexOf(MANAGED_START);
  const e = content.indexOf(MANAGED_END);
  let base = content;
  if (s !== -1 && e !== -1 && e > s) {
    base = (content.slice(0, s) + content.slice(e + MANAGED_END.length)).trim() + '\n';
  }
  for (const name of managedNames) base = removeDomainBlock(base, name);
  return base.trim() ? base.trim() + '\n' : '';
}

// Emit edilecek domain listesinden managed bölge metnini üretir.
export function buildManagedRegion(domainsToEmit: DomainConfig[]): string {
  const blocks = domainsToEmit.map((d) => buildDomainBlock(d)).filter(Boolean).join('');
  return `${MANAGED_START}\n${blocks.trimEnd()}\n${MANAGED_END}\n`;
}

// Unmanaged kısmı ile managed bölgeyi birleştirerek tam Caddyfile metnini oluşturur.
export function composeCaddyfile(unmanaged: string, managedRegion: string): string {
  const u = unmanaged.trim();
  return (u ? u + '\n\n' : '') + managedRegion;
}

// ─── Caddy validate yardımcısı ───────────────────────────────────────────────
function caddyValidate(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('caddy', ['validate', '--adapter', 'caddyfile', '--config', path], (err, _o, stderr) =>
      err ? reject(new Error('caddy validate: ' + (stderr || err.message))) : resolve());
  });
}

// ─── Transactional syncCaddyConfig ───────────────────────────────────────────
// Tüm DB domain'lerini (active+offline) alır; PROTECTED dışındakileri managed
// bölgeden siler ve yalnızca active+unprotected olanları yeniden yazar.
// Geçersiz config → throw, live dosya değişmez.
// Reload başarısız → backup'tan geri yükle.
export async function syncCaddyConfig(allDomains: DomainDoc[]): Promise<void> {
  const path = CADDYFILE_PATH();
  const managedNames = allDomains
    .map((d) => d.domain)
    .filter((n) => !PROTECTED_DOMAINS.includes(n));
  const toEmit = allDomains.filter(
    (d) => d.status === 'active' && !PROTECTED_DOMAINS.includes(d.domain)
  );
  const current = readCaddyfile();
  const unmanaged = extractUnmanaged(current, managedNames);
  const next = composeCaddyfile(unmanaged, buildManagedRegion(toEmit));
  if (next.trim() === current.trim()) return;

  const tmp = path + '.zolpanel.tmp';
  const bak = path + '.zolpanel.bak';
  fs.writeFileSync(tmp, next, 'utf-8');
  try {
    await caddyValidate(tmp);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* yoksay */ }
    addLog('system', 'error', 'Caddy config geçersiz, uygulanmadı: ' + (e as Error).message);
    throw e;
  }
  fs.copyFileSync(path, bak);
  fs.renameSync(tmp, path);
  try {
    await reloadCaddy();
  } catch (e) {
    fs.copyFileSync(bak, path);
    await reloadCaddy().catch(() => {});
    addLog('system', 'error', 'Reload başarısız, önceki config geri yüklendi');
    throw e;
  }
  addLog('system', 'info', 'Caddy config senkronize edildi (managed bölge)');
}

// DomainRoute db.ts'den re-export edilir (girdi tiplerinde kullanılabilir).
export type { DomainRoute };
