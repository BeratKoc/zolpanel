import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Cut-over'da mevcut veriyi okumak için DB_DIR env ile dışarıdan verilebilir.
const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'db', 'data');

export interface DomainRoute { path: string; port: number; type: 'http' | 'websocket'; }
export interface CaddyHeader { key: string; value: string; }
export interface CaddyRedirect { from: string; to: string; permanent: boolean; }
export interface CaddyBasicAuth { username: string; passwordHash: string; }
export interface CaddyIpRules { mode: 'allow' | 'deny'; cidrs: string[]; }
export interface CaddyExtras {
  headers?: CaddyHeader[];
  redirects?: CaddyRedirect[];
  basicAuth?: CaddyBasicAuth[];
  ipRules?: CaddyIpRules | null;
}
export interface DomainDoc {
  _id?: string;
  domain: string;
  type: 'proxy' | 'static' | 'advanced';
  port: number | null;
  rootPath: string | null;
  routes: DomainRoute[] | null;
  aliases: string[];
  appType: string;
  notes: string;
  status: 'active' | 'offline';
  sslStatus: 'pending' | 'active';
  createdAt: string;
  updatedAt: string;
  caddyExtras?: CaddyExtras;
}
export interface UserDoc {
  _id?: string;
  username: string;
  password: string;
  tokenVersion: number;
  createdAt: string;
}
export interface LogDoc {
  _id?: string;
  domain: string;
  level: string;
  message: string;
  timestamp: string;
}
export interface MemorySnapshotDoc {
  _id?: string;
  name: string;
  type: 'pm2' | 'docker';
  memoryMB: number;
  memPercent: number | null;
  status: string;
  restarts: number | null;
  timestamp: string;
}

// better-sqlite3 SENKRON çalışır → NeDB'nin async autoload/teardown derdi yok.
// db, TÜM Next bundle'ları (instrumentation + her route handler) arasında TEK
// instance olmalı; Next route'ları ayrı bundle'larda derlendiği için modül birden
// fazla örneklenebilir. globalThis singleton (standart Next/Prisma pattern) bunu çözer.
// LAZY open: Database, import anında DEĞİL, ilk veri erişiminde (getDb) açılır.
// Böylece db.ts'i transitively import eden saf-fn testleri stray dosya yaratmaz.
type DB = Database.Database;
const g = globalThis as unknown as { __zolpanelSqlite?: DB };

function migrate(conn: DB): void {
  try { conn.exec('ALTER TABLE domains ADD COLUMN caddyExtras TEXT'); } catch { /* kolon zaten var */ }
}

function open(): DB {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const conn = new Database(path.join(DB_DIR, 'zolpanel.db'));
  conn.pragma('journal_mode = WAL');
  createTables(conn);
  migrate(conn);
  return conn;
}

function getDb(): DB {
  return (g.__zolpanelSqlite ??= open());
}

function createTables(conn: DB): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      tokenVersion INTEGER,
      createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      domain TEXT UNIQUE,
      type TEXT,
      port INTEGER,
      rootPath TEXT,
      routes TEXT,
      aliases TEXT,
      appType TEXT,
      notes TEXT,
      status TEXT,
      sslStatus TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      caddyExtras TEXT
    );
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      domain TEXT,
      level TEXT,
      message TEXT,
      timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    CREATE TABLE IF NOT EXISTS memory_snapshots (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      memoryMB REAL,
      memPercent REAL,
      status TEXT,
      restarts INTEGER,
      timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mem_name_ts ON memory_snapshots(name, timestamp);
  `);
}

// NeDB-benzeri kısa, URL-safe id (16 karakter).
function genId(): string {
  return crypto.randomBytes(12).toString('base64url');
}

// Tabloları oluşturur (idempotent). Senkron; bağlantıyı (gerekiyorsa) açar.
export function initDb(): void {
  getDb();
}

// ---- Row <-> Doc mapping ------------------------------------------------

interface DomainRow {
  id: string; domain: string; type: string; port: number | null;
  rootPath: string | null; routes: string | null; aliases: string | null;
  appType: string; notes: string; status: string; sslStatus: string;
  createdAt: string; updatedAt: string; caddyExtras: string | null;
}
function rowToDomain(r: DomainRow): DomainDoc {
  return {
    _id: r.id,
    domain: r.domain,
    type: r.type as DomainDoc['type'],
    port: r.port,
    rootPath: r.rootPath,
    routes: r.routes ? (JSON.parse(r.routes) as DomainRoute[]) : null,
    aliases: r.aliases ? (JSON.parse(r.aliases) as string[]) : [],
    appType: r.appType,
    notes: r.notes,
    status: r.status as DomainDoc['status'],
    sslStatus: r.sslStatus as DomainDoc['sslStatus'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    caddyExtras: r.caddyExtras ? (JSON.parse(r.caddyExtras) as CaddyExtras) : undefined,
  };
}

interface UserRow {
  id: string; username: string; password: string; tokenVersion: number; createdAt: string;
}
function rowToUser(r: UserRow): UserDoc {
  return { _id: r.id, username: r.username, password: r.password, tokenVersion: r.tokenVersion, createdAt: r.createdAt };
}

interface LogRow { id: string; domain: string; level: string; message: string; timestamp: string; }
function rowToLog(r: LogRow): LogDoc {
  return { _id: r.id, domain: r.domain, level: r.level, message: r.message, timestamp: r.timestamp };
}

interface SnapshotRow {
  id: string; name: string; type: string; memoryMB: number; memPercent: number | null;
  status: string; restarts: number | null; timestamp: string;
}
function rowToSnapshot(r: SnapshotRow): MemorySnapshotDoc {
  return {
    _id: r.id, name: r.name, type: r.type as MemorySnapshotDoc['type'],
    memoryMB: r.memoryMB, memPercent: r.memPercent, status: r.status,
    restarts: r.restarts, timestamp: r.timestamp,
  };
}

// ---- users --------------------------------------------------------------

export function getUserByName(username: string): UserDoc | null {
  const r = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  return r ? rowToUser(r) : null;
}

export function insertUser(u: Omit<UserDoc, '_id'>): UserDoc {
  const id = genId();
  getDb()
    .prepare('INSERT INTO users (id, username, password, tokenVersion, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(id, u.username, u.password, u.tokenVersion, u.createdAt);
  return { _id: id, ...u };
}

export function setUserPassword(id: string, passwordHash: string, tokenVersion: number): void {
  getDb()
    .prepare('UPDATE users SET password = ?, tokenVersion = ? WHERE id = ?')
    .run(passwordHash, tokenVersion, id);
}

// ---- domains ------------------------------------------------------------

export function getAllDomains(): DomainDoc[] {
  const rows = getDb().prepare('SELECT * FROM domains ORDER BY createdAt DESC').all() as DomainRow[];
  return rows.map(rowToDomain);
}

export function getActiveDomains(): DomainDoc[] {
  const rows = getDb()
    .prepare("SELECT * FROM domains WHERE status = 'active' ORDER BY createdAt DESC")
    .all() as DomainRow[];
  return rows.map(rowToDomain);
}

export function getProxyDomains(): DomainDoc[] {
  const rows = getDb()
    .prepare("SELECT * FROM domains WHERE type = 'proxy' ORDER BY createdAt DESC")
    .all() as DomainRow[];
  return rows.map(rowToDomain);
}

export function getDomainById(id: string): DomainDoc | null {
  const r = getDb().prepare('SELECT * FROM domains WHERE id = ?').get(id) as DomainRow | undefined;
  return r ? rowToDomain(r) : null;
}

export function getDomainByName(domain: string): DomainDoc | null {
  const r = getDb().prepare('SELECT * FROM domains WHERE domain = ?').get(domain) as DomainRow | undefined;
  return r ? rowToDomain(r) : null;
}

export function getDomainByPort(port: number): DomainDoc | null {
  const r = getDb().prepare('SELECT * FROM domains WHERE port = ?').get(port) as DomainRow | undefined;
  return r ? rowToDomain(r) : null;
}

export function insertDomain(d: Omit<DomainDoc, '_id'>): DomainDoc {
  const id = genId();
  getDb()
    .prepare(
      `INSERT INTO domains
        (id, domain, type, port, rootPath, routes, aliases, appType, notes, status, sslStatus, createdAt, updatedAt, caddyExtras)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id, d.domain, d.type, d.port, d.rootPath,
      d.routes ? JSON.stringify(d.routes) : null,
      JSON.stringify(d.aliases ?? []),
      d.appType, d.notes, d.status, d.sslStatus, d.createdAt, d.updatedAt,
      d.caddyExtras ? JSON.stringify(d.caddyExtras) : null,
    );
  return { _id: id, ...d };
}

export function updateDomain(id: string, patch: Partial<DomainDoc>): void {
  const cols: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => { cols.push(`${col} = ?`); vals.push(val); };

  if (patch.domain !== undefined) set('domain', patch.domain);
  if (patch.type !== undefined) set('type', patch.type);
  if (patch.port !== undefined) set('port', patch.port);
  if (patch.rootPath !== undefined) set('rootPath', patch.rootPath);
  if (patch.routes !== undefined) set('routes', patch.routes ? JSON.stringify(patch.routes) : null);
  if (patch.aliases !== undefined) set('aliases', JSON.stringify(patch.aliases ?? []));
  if (patch.appType !== undefined) set('appType', patch.appType);
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.sslStatus !== undefined) set('sslStatus', patch.sslStatus);
  if (patch.createdAt !== undefined) set('createdAt', patch.createdAt);
  if (patch.updatedAt !== undefined) set('updatedAt', patch.updatedAt);
  if (patch.caddyExtras !== undefined) set('caddyExtras', patch.caddyExtras ? JSON.stringify(patch.caddyExtras) : null);

  if (!cols.length) return;
  vals.push(id);
  getDb().prepare(`UPDATE domains SET ${cols.join(', ')} WHERE id = ?`).run(...(vals as never[]));
}

export function removeDomain(id: string): void {
  getDb().prepare('DELETE FROM domains WHERE id = ?').run(id);
}

export function domainStats(): {
  total: number; active: number; offline: number; proxy: number; static: number; sslActive: number;
} {
  const row = getDb()
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offline,
        SUM(CASE WHEN type = 'proxy' THEN 1 ELSE 0 END) AS proxy,
        SUM(CASE WHEN type = 'static' THEN 1 ELSE 0 END) AS staticCount,
        SUM(CASE WHEN sslStatus = 'active' THEN 1 ELSE 0 END) AS sslActive
       FROM domains`,
    )
    .get() as Record<string, number | null>;
  return {
    total: row.total || 0,
    active: row.active || 0,
    offline: row.offline || 0,
    proxy: row.proxy || 0,
    static: row.staticCount || 0,
    sslActive: row.sslActive || 0,
  };
}

// ---- logs ---------------------------------------------------------------

export function addLog(domain: string | null, level: string, message: string): void {
  const db = getDb();
  db.prepare('INSERT INTO logs (id, domain, level, message, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    genId(),
    domain || 'system',
    level || 'info',
    message,
    new Date().toISOString(),
  );
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM logs WHERE timestamp < ?').run(thirtyDaysAgo);
}

export function getLogs(opts: { domain?: string; level?: string; limit?: number }): LogDoc[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.domain) { where.push('domain = ?'); params.push(opts.domain); }
  if (opts.level) { where.push('level = ?'); params.push(opts.level); }
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 200;
  const sql =
    'SELECT * FROM logs' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);
  const rows = getDb().prepare(sql).all(...(params as never[])) as LogRow[];
  return rows.map(rowToLog);
}

export function clearLogs(domain?: string): number {
  const db = getDb();
  if (domain) {
    return db.prepare('DELETE FROM logs WHERE domain = ?').run(domain).changes;
  }
  return db.prepare('DELETE FROM logs').run().changes;
}

// ---- memory snapshots ---------------------------------------------------

export function insertSnapshot(s: Omit<MemorySnapshotDoc, '_id'>): void {
  getDb()
    .prepare(
      `INSERT INTO memory_snapshots
        (id, name, type, memoryMB, memPercent, status, restarts, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(genId(), s.name, s.type, s.memoryMB, s.memPercent, s.status, s.restarts, s.timestamp);
}

export function getSnapshotsSince(sinceIso: string): MemorySnapshotDoc[] {
  const rows = getDb()
    .prepare('SELECT * FROM memory_snapshots WHERE timestamp > ? ORDER BY timestamp ASC')
    .all(sinceIso) as SnapshotRow[];
  return rows.map(rowToSnapshot);
}

export function getSnapshotsForName(name: string, sinceIso: string): MemorySnapshotDoc[] {
  const rows = getDb()
    .prepare('SELECT * FROM memory_snapshots WHERE name = ? AND timestamp > ? ORDER BY timestamp ASC')
    .all(name, sinceIso) as SnapshotRow[];
  return rows.map(rowToSnapshot);
}

export function pruneSnapshots(beforeIso: string): void {
  getDb().prepare('DELETE FROM memory_snapshots WHERE timestamp < ?').run(beforeIso);
}

// İlk kurulumda admin oluştur — sabit şifre YOK, rastgele üret ve bir kez logla.
export async function initAdmin(): Promise<void> {
  initDb();
  const existing = getUserByName('admin');
  if (existing) return;
  // E2E/test ortamında deterministik şifre için override; aksi halde rastgele.
  const testPassword = process.env.ZOLPANEL_TEST_ADMIN_PASSWORD;
  const generated = testPassword || crypto.randomBytes(12).toString('base64url'); // ~16 karakter
  const hash = await bcrypt.hash(generated, 12);
  insertUser({
    username: 'admin',
    password: hash,
    tokenVersion: 0,
    createdAt: new Date().toISOString(),
  });
  console.log('============================================================');
  console.log('  Zolpanel admin oluşturuldu.');
  console.log('  Kullanıcı: admin');
  if (testPassword) {
    console.log('  Şifre    : (ZOLPANEL_TEST_ADMIN_PASSWORD env ile ayarlandı)');
  } else {
    console.log('  Şifre    : ' + generated);
    console.log('  >> Bu şifreyi kaydedin; ilk girişten sonra değiştirin.');
  }
  console.log('============================================================');
}
