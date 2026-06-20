const fs = require('fs');
const { exec } = require('child_process');
const { addLog } = require('../db/database');

const CADDYFILE_PATH = process.env.CADDYFILE_PATH || '/etc/caddy/Caddyfile';

// Panel tarafından YÖNETİLMEYEN, asla silinmemesi/değiştirilmemesi gereken bloklar.
// .env'den PROTECTED_DOMAINS=foo.com,bar.com ile genişletilebilir.
const PROTECTED_DOMAINS = (process.env.PROTECTED_DOMAINS || 'panel.zolvix.app')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function readCaddyfile() {
  if (!fs.existsSync(CADDYFILE_PATH)) return '';
  return fs.readFileSync(CADDYFILE_PATH, 'utf-8');
}

function writeCaddyfile(content) {
  fs.writeFileSync(CADDYFILE_PATH, content, 'utf-8');
}

function reloadCaddy() {
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

function isCaddyRunning() {
  return new Promise((resolve) => {
    exec('pgrep -x caddy', (err) => resolve(!err));
  });
}

function buildDomainBlock(domainConfig) {
  const { domain, type, port, rootPath, aliases, routes } = domainConfig;

  const allDomains = aliases && aliases.length > 0
    ? [domain, ...aliases].join(', ')
    : domain;

  if (type === 'static') {
    return `${allDomains} {\n    root * ${rootPath || '/var/www/' + domain}\n    file_server\n    encode gzip\n}\n\n`;
  }

  if (type === 'proxy') {
    return `${allDomains} {\n    reverse_proxy localhost:${port}\n    encode gzip\n}\n\n`;
  }

  if (type === 'advanced' && routes && routes.length > 0) {
    // Aynı path birden fazla verilmişse ilkini koru — Caddy'de sonraki "handle"
    // zaten erişilemez olur; çift "handle /*" üretmeyi engeller.
    const seenPaths = new Set();
    const uniqueRoutes = routes.filter(r => {
      if (seenPaths.has(r.path)) return false;
      seenPaths.add(r.path);
      return true;
    });
    const handles = uniqueRoutes.map(r => {
      if (r.type === 'websocket') {
        return `    handle ${r.path} {\n        reverse_proxy localhost:${r.port} {\n            transport http {\n                read_timeout 0\n                write_timeout 0\n            }\n        }\n    }`;
      }
      return `    handle ${r.path} {\n        reverse_proxy localhost:${r.port}\n    }`;
    }).join('\n');
    return `${allDomains} {\n${handles}\n    encode gzip\n}\n\n`;
  }

  return '';
}

// Bir blok başlığı satırından domain token'larını çıkarır.
// "a.com, www.a.com {" -> ["a.com", "www.a.com"]
function headerTokens(line) {
  const headerPart = line.split('{')[0];
  return headerPart
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

// Verilen domain'e ait bloğu kaldırır.
// ÖNEMLİ: Eşleştirme TAM TOKEN bazlıdır (substring DEĞİL). Böylece
// "zolvix.app" kaldırılırken "panel.zolvix.app" bloğuna dokunulmaz.
// Nested brace (advanced/websocket) ve brace'in alt satırda olduğu durumları da destekler.
function removeDomainBlock(content, domain) {
  const lines = content.split('\n');
  const result = [];
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
        if (ch === '{') { depth++; seenOpen = true; }
        if (ch === '}') depth--;
      }
      i++;
      if (seenOpen && depth <= 0) break;
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

async function addDomainToConfig(domainConfig) {
  if (PROTECTED_DOMAINS.includes(domainConfig.domain)) {
    addLog(domainConfig.domain, 'warn', 'Korumalı domain, panel tarafından yönetilmiyor (Caddyfile değiştirilmedi)');
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

async function removeDomainFromConfig(domain) {
  if (PROTECTED_DOMAINS.includes(domain)) {
    addLog(domain, 'warn', 'Korumalı domain, Caddyfile\'dan kaldırılmadı');
    return;
  }
  let content = readCaddyfile();
  content = removeDomainBlock(content, domain);
  writeCaddyfile(content);
  addLog(domain, 'info', 'Domain Caddyfile\'dan kaldırıldı');
  await reloadCaddy();
}

// Caddyfile'ı brace-aware (nested brace destekli) parse eder.
// Eski regex (/\{([^}]*)\}/) advanced/websocket bloklarındaki iç içe brace'lerde
// bozuluyordu; bu sürüm blok gövdesini derinlik sayarak doğru toplar.
function parseCaddyfile() {
  const content = readCaddyfile();
  const lines = content.split('\n');
  const domains = [];
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
    const domainList = header.split(/[\s,]+/).filter(d => d.includes('.'));

    // Blok gövdesini brace dengesi 0'a dönene kadar topla
    let depth = 0;
    let seenOpen = false;
    const bodyLines = [];
    while (i < lines.length) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; seenOpen = true; }
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

module.exports = {
  addDomainToConfig,
  removeDomainFromConfig,
  parseCaddyfile,
  reloadCaddy,
  isCaddyRunning,
  readCaddyfile,
  // test edilebilirlik için
  removeDomainBlock,
  buildDomainBlock,
  PROTECTED_DOMAINS,
};
