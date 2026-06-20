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

export const db = {
  domains: new Datastore<DomainDoc>({ filename: path.join(dbPath, 'domains.db'), autoload: true }),
  users: new Datastore<UserDoc>({ filename: path.join(dbPath, 'users.db'), autoload: true }),
  logs: new Datastore<LogDoc>({ filename: path.join(dbPath, 'logs.db'), autoload: true }),
};

db.domains.ensureIndex({ fieldName: 'domain', unique: true });
db.users.ensureIndex({ fieldName: 'username', unique: true });

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
