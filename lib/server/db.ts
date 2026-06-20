import Datastore from 'nedb';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Cut-over'da mevcut veriyi okumak için DB_DIR env ile dışarıdan verilebilir.
const dbPath = process.env.DB_DIR || path.join(process.cwd(), 'db', 'data');

export interface DomainRoute { path: string; port: number; type: 'http' | 'websocket'; }
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

// autoload: false → modül import edildiğinde async dosya I/O TETİKLENMEZ.
// Bu, pure-fonksiyon testlerinin (caddy/pm2) NeDB'yi yüklemeden import edebilmesini
// ve "async activity after test ended" hatasını önler. Datastore'lar boot'ta
// initDb() ile açıkça yüklenir (instrumentation.ts) — yüklenmeden yapılan
// sorgular NeDB tarafından kuyruğa alınır ve load sonrası çalışır.
export const db = {
  domains: new Datastore<DomainDoc>({ filename: path.join(dbPath, 'domains.db'), autoload: false }),
  users: new Datastore<UserDoc>({ filename: path.join(dbPath, 'users.db'), autoload: false }),
  logs: new Datastore<LogDoc>({ filename: path.join(dbPath, 'logs.db'), autoload: false }),
  memorySnapshots: new Datastore<MemorySnapshotDoc>({ filename: path.join(dbPath, 'memory_snapshots.db'), autoload: false }),
};

let dbReady: Promise<void> | null = null;

// Tüm datastore'ları yükler ve indeksleri kurar. Idempotent (tek sefer çalışır).
export function initDb(): Promise<void> {
  if (dbReady) return dbReady;
  const load = (store: Datastore<unknown>) =>
    new Promise<void>((resolve, reject) => store.loadDatabase((err) => (err ? reject(err) : resolve())));
  dbReady = Promise.all([
    load(db.domains as Datastore<unknown>),
    load(db.users as Datastore<unknown>),
    load(db.logs as Datastore<unknown>),
    load(db.memorySnapshots as Datastore<unknown>),
  ]).then(() => {
    db.domains.ensureIndex({ fieldName: 'domain', unique: true });
    db.users.ensureIndex({ fieldName: 'username', unique: true });
  });
  return dbReady;
}

export function addLog(domain: string | null, level: string, message: string): void {
  db.logs.insert({
    domain: domain || 'system',
    level: level || 'info',
    message,
    timestamp: new Date().toISOString(),
  } as LogDoc);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.logs.remove({ timestamp: { $lt: thirtyDaysAgo } }, { multi: true });
}

// İlk kurulumda admin oluştur — sabit şifre YOK, rastgele üret ve bir kez logla.
export async function initAdmin(): Promise<void> {
  await initDb();
  return new Promise((resolve) => {
    db.users.findOne({ username: 'admin' }, async (_err, user) => {
      if (!user) {
        const generated = crypto.randomBytes(12).toString('base64url'); // ~16 karakter
        const hash = await bcrypt.hash(generated, 12);
        db.users.insert({
          username: 'admin',
          password: hash,
          tokenVersion: 0,
          createdAt: new Date().toISOString(),
        } as UserDoc);
        console.log('============================================================');
        console.log('  Zolpanel admin oluşturuldu.');
        console.log('  Kullanıcı: admin');
        console.log('  Şifre    : ' + generated);
        console.log('  >> Bu şifreyi kaydedin; ilk girişten sonra değiştirin.');
        console.log('============================================================');
      }
      resolve();
    });
  });
}
