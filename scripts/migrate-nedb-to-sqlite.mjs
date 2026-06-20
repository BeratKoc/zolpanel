#!/usr/bin/env node
// NeDB -> better-sqlite3 migration (canlı cut-over için).
// Kullanım:
//   node scripts/migrate-nedb-to-sqlite.mjs [nedbDir] [sqlitePath]
// Varsayılan: nedbDir = ./db/data, sqlitePath = <nedbDir>/zolpanel.db
//
// Idempotent-ish: tablolar IF NOT EXISTS ile oluşturulur, satırlar INSERT OR REPLACE
// ile yazılır (aynı _id tekrar çalıştırılırsa üzerine yazılır).

import path from 'path';
import fs from 'fs';
import Datastore from 'nedb';
import Database from 'better-sqlite3';

const nedbDir = path.resolve(process.argv[2] || path.join(process.cwd(), 'db', 'data'));
const sqlitePath = path.resolve(process.argv[3] || path.join(nedbDir, 'zolpanel.db'));

// NeDB datastore'unu yükle; dosya yoksa null döner (atla).
function loadStore(file) {
  const filename = path.join(nedbDir, file);
  if (!fs.existsSync(filename)) return null;
  return new Promise((resolve, reject) => {
    const store = new Datastore({ filename, autoload: false });
    store.loadDatabase((err) => {
      if (err) return reject(err);
      store.find({}, (e, docs) => (e ? reject(e) : resolve(docs)));
    });
  });
}

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT,
      tokenVersion INTEGER, createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY, domain TEXT UNIQUE, type TEXT, port INTEGER,
      rootPath TEXT, routes TEXT, aliases TEXT, appType TEXT, notes TEXT,
      status TEXT, sslStatus TEXT, createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY, domain TEXT, level TEXT, message TEXT, timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    CREATE TABLE IF NOT EXISTS memory_snapshots (
      id TEXT PRIMARY KEY, name TEXT, type TEXT, memoryMB REAL, memPercent REAL,
      status TEXT, restarts INTEGER, timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mem_name_ts ON memory_snapshots(name, timestamp);
  `);
}

async function main() {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  createTables(db);

  const counts = {};

  // users
  const users = await loadStore('users.db');
  if (users) {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO users (id, username, password, tokenVersion, createdAt) VALUES (?, ?, ?, ?, ?)',
    );
    const tx = db.transaction((rows) => {
      for (const u of rows) {
        stmt.run(u._id, u.username, u.password, u.tokenVersion ?? 0, u.createdAt ?? new Date().toISOString());
      }
    });
    tx(users);
    counts.users = users.length;
  }

  // domains
  const domains = await loadStore('domains.db');
  if (domains) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO domains
        (id, domain, type, port, rootPath, routes, aliases, appType, notes, status, sslStatus, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction((rows) => {
      for (const d of rows) {
        stmt.run(
          d._id,
          d.domain,
          d.type,
          d.port ?? null,
          d.rootPath ?? null,
          d.routes != null ? JSON.stringify(d.routes) : null,
          JSON.stringify(d.aliases ?? []),
          d.appType ?? 'other',
          d.notes ?? '',
          d.status ?? 'active',
          d.sslStatus ?? 'pending',
          d.createdAt ?? new Date().toISOString(),
          d.updatedAt ?? d.createdAt ?? new Date().toISOString(),
        );
      }
    });
    tx(domains);
    counts.domains = domains.length;
  }

  // logs
  const logs = await loadStore('logs.db');
  if (logs) {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO logs (id, domain, level, message, timestamp) VALUES (?, ?, ?, ?, ?)',
    );
    const tx = db.transaction((rows) => {
      for (const l of rows) {
        stmt.run(l._id, l.domain ?? 'system', l.level ?? 'info', l.message ?? '', l.timestamp ?? new Date().toISOString());
      }
    });
    tx(logs);
    counts.logs = logs.length;
  }

  // memory_snapshots
  const snaps = await loadStore('memory_snapshots.db');
  if (snaps) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO memory_snapshots
        (id, name, type, memoryMB, memPercent, status, restarts, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const tx = db.transaction((rows) => {
      for (const s of rows) {
        stmt.run(
          s._id,
          s.name,
          s.type,
          s.memoryMB ?? 0,
          s.memPercent ?? null,
          s.status ?? '',
          s.restarts ?? null,
          s.timestamp ?? new Date().toISOString(),
        );
      }
    });
    tx(snaps);
    counts.memory_snapshots = snaps.length;
  }

  db.close();

  console.log('NeDB -> SQLite migration tamamlandı.');
  console.log('  Kaynak (NeDB) : ' + nedbDir);
  console.log('  Hedef (SQLite): ' + sqlitePath);
  for (const table of ['users', 'domains', 'logs', 'memory_snapshots']) {
    if (counts[table] === undefined) console.log(`  ${table}: (kaynak yok, atlandı)`);
    else console.log(`  ${table}: ${counts[table]} kayıt`);
  }
}

main().catch((e) => {
  console.error('Migration HATASI:', e);
  process.exit(1);
});
