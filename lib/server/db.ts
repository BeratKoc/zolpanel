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
export interface DatabaseDoc {
  _id?: string;
  engine: 'postgres' | 'mysql' | 'redis';
  name: string;
  dbName: string;
  username: string;
  password: string;
  hostPort: number;
  volume: string;
  containerId: string;
  createdAt: string;
}
export interface AppDoc {
  _id?: string;
  name: string;
  repoUrl: string;
  branch: string;
  domain: string | null;
  containerPort: number;
  hostPort: number;
  status: 'new' | 'deploying' | 'running' | 'stopped' | 'error';
  image: string;
  lastDeployedAt: string | null;
  createdAt: string;
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

// WAL'ı ana dosyaya yaz + wal'ı boşalt. Yedek almadan önce çağrılır ki tüm
// commit'lenmiş veri zolpanel.db içinde olsun (WAL yedeğe dahil edilmiyor).
// TRUNCATE sonrası eşzamanlı yazımlar YENİ wal'a gider, ana dosya tutarlı kalır.
export function checkpointDb(): void {
  try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch { /* yoksay */ }
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
    CREATE TABLE IF NOT EXISTS databases (
      id TEXT PRIMARY KEY,
      engine TEXT,
      name TEXT UNIQUE,
      dbName TEXT,
      username TEXT,
      password TEXT,
      hostPort INTEGER,
      volume TEXT,
      containerId TEXT,
      createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE,
      repoUrl TEXT,
      branch TEXT,
      domain TEXT,
      containerPort INTEGER,
      hostPort INTEGER,
      status TEXT,
      image TEXT,
      lastDeployedAt TEXT,
      createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      lastUsed TEXT
    );
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

// ---- databases ----------------------------------------------------------

interface DatabaseRow {
  id: string; engine: string; name: string; dbName: string;
  username: string; password: string; hostPort: number; volume: string;
  containerId: string; createdAt: string;
}
function rowToDatabase(r: DatabaseRow): DatabaseDoc {
  return {
    _id: r.id,
    engine: r.engine as DatabaseDoc['engine'],
    name: r.name,
    dbName: r.dbName,
    username: r.username,
    password: r.password,
    hostPort: r.hostPort,
    volume: r.volume,
    containerId: r.containerId,
    createdAt: r.createdAt,
  };
}

export function insertDatabase(d: Omit<DatabaseDoc, '_id'>): DatabaseDoc {
  const id = genId();
  getDb()
    .prepare(
      `INSERT INTO databases
        (id, engine, name, dbName, username, password, hostPort, volume, containerId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, d.engine, d.name, d.dbName, d.username, d.password, d.hostPort, d.volume, d.containerId, d.createdAt);
  return { _id: id, ...d };
}

export function getAllDatabases(): DatabaseDoc[] {
  const rows = getDb().prepare('SELECT * FROM databases ORDER BY createdAt DESC').all() as DatabaseRow[];
  return rows.map(rowToDatabase);
}

export function getDatabaseById(id: string): DatabaseDoc | undefined {
  const r = getDb().prepare('SELECT * FROM databases WHERE id = ?').get(id) as DatabaseRow | undefined;
  return r ? rowToDatabase(r) : undefined;
}

export function getDatabaseByPort(port: number): DatabaseDoc | undefined {
  const r = getDb().prepare('SELECT * FROM databases WHERE hostPort = ?').get(port) as DatabaseRow | undefined;
  return r ? rowToDatabase(r) : undefined;
}

export function removeDatabase(id: string): void {
  getDb().prepare('DELETE FROM databases WHERE id = ?').run(id);
}

// ---- apps ---------------------------------------------------------------

interface AppRow {
  id: string; name: string; repoUrl: string; branch: string;
  domain: string | null; containerPort: number; hostPort: number;
  status: string; image: string; lastDeployedAt: string | null; createdAt: string;
}
function rowToApp(r: AppRow): AppDoc {
  return {
    _id: r.id,
    name: r.name,
    repoUrl: r.repoUrl,
    branch: r.branch,
    domain: r.domain,
    containerPort: r.containerPort,
    hostPort: r.hostPort,
    status: r.status as AppDoc['status'],
    image: r.image,
    lastDeployedAt: r.lastDeployedAt,
    createdAt: r.createdAt,
  };
}

export function insertApp(a: Omit<AppDoc, '_id'>): AppDoc {
  const id = genId();
  getDb()
    .prepare(
      `INSERT INTO apps
        (id, name, repoUrl, branch, domain, containerPort, hostPort, status, image, lastDeployedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, a.name, a.repoUrl, a.branch, a.domain, a.containerPort, a.hostPort, a.status, a.image, a.lastDeployedAt, a.createdAt);
  return { _id: id, ...a };
}

export function getAllApps(): AppDoc[] {
  const rows = getDb().prepare('SELECT * FROM apps ORDER BY createdAt DESC').all() as AppRow[];
  return rows.map(rowToApp);
}

export function getAppById(id: string): AppDoc | null {
  const r = getDb().prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined;
  return r ? rowToApp(r) : null;
}

export function getAppByPort(port: number): AppDoc | null {
  const r = getDb().prepare('SELECT * FROM apps WHERE hostPort = ?').get(port) as AppRow | undefined;
  return r ? rowToApp(r) : null;
}

export function updateApp(id: string, patch: Partial<AppDoc>): void {
  const cols: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => { cols.push(`${col} = ?`); vals.push(val); };

  if (patch.name !== undefined) set('name', patch.name);
  if (patch.repoUrl !== undefined) set('repoUrl', patch.repoUrl);
  if (patch.branch !== undefined) set('branch', patch.branch);
  if (patch.domain !== undefined) set('domain', patch.domain);
  if (patch.containerPort !== undefined) set('containerPort', patch.containerPort);
  if (patch.hostPort !== undefined) set('hostPort', patch.hostPort);
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.image !== undefined) set('image', patch.image);
  if (patch.lastDeployedAt !== undefined) set('lastDeployedAt', patch.lastDeployedAt);
  if (patch.createdAt !== undefined) set('createdAt', patch.createdAt);

  if (!cols.length) return;
  vals.push(id);
  getDb().prepare(`UPDATE apps SET ${cols.join(', ')} WHERE id = ?`).run(...(vals as never[]));
}

export function removeApp(id: string): void {
  getDb().prepare('DELETE FROM apps WHERE id = ?').run(id);
}

// ---- settings (encrypted kv store) -------------------------------------

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}
export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}
export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key=?').run(key);
}

// ---- api_tokens ---------------------------------------------------------

export interface ApiTokenRow {
  id: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastUsed: string | null;
}

export function insertApiToken(t: { id: string; name: string; tokenHash: string; createdAt: string }): void {
  getDb()
    .prepare('INSERT INTO api_tokens (id, name, tokenHash, createdAt, lastUsed) VALUES (?, ?, ?, ?, NULL)')
    .run(t.id, t.name, t.tokenHash, t.createdAt);
}

export function listApiTokens(): { id: string; name: string; createdAt: string; lastUsed: string | null }[] {
  return getDb()
    .prepare('SELECT id, name, createdAt, lastUsed FROM api_tokens ORDER BY createdAt DESC')
    .all() as { id: string; name: string; createdAt: string; lastUsed: string | null }[];
}

export function getApiTokenByHash(hash: string): { id: string; name: string } | null {
  const r = getDb()
    .prepare('SELECT id, name FROM api_tokens WHERE tokenHash = ?')
    .get(hash) as { id: string; name: string } | undefined;
  return r ?? null;
}

export function deleteApiToken(id: string): void {
  getDb().prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
}

export function touchApiToken(id: string, iso: string): void {
  getDb().prepare('UPDATE api_tokens SET lastUsed = ? WHERE id = ?').run(iso, id);
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
