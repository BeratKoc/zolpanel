import crypto from 'crypto';
import { getUsedPorts } from './portManager';
import { buildRunArgs, dockerRun, pullImage, removeContainer, listContainers } from './docker';
import { insertDatabase, getAllDatabases, getDatabaseById, removeDatabase as dbRemove, type DatabaseDoc } from './db';

type Engine = 'postgres' | 'mysql' | 'redis';
export const ENGINES: Record<Engine, { image: string; port: number; volumePath: string; basePort: number }> = {
  postgres: { image: 'postgres:16-alpine', port: 5432, volumePath: '/var/lib/postgresql/data', basePort: 5433 },
  mysql:    { image: 'mysql:8',            port: 3306, volumePath: '/var/lib/mysql',           basePort: 3307 },
  redis:    { image: 'redis:7-alpine',     port: 6379, volumePath: '/data',                    basePort: 6380 },
};
function genSuffix(): string { return crypto.randomBytes(3).toString('hex'); }       // 6 hex
function genPassword(): string { return crypto.randomBytes(18).toString('base64url'); } // ~24, shell-safe
function envFor(engine: Engine, pw: string, dbName: string, user: string): Record<string,string> {
  if (engine === 'postgres') return { POSTGRES_PASSWORD: pw, POSTGRES_USER: user, POSTGRES_DB: dbName };
  if (engine === 'mysql')    return { MYSQL_ROOT_PASSWORD: pw, MYSQL_DATABASE: dbName, MYSQL_USER: user, MYSQL_PASSWORD: pw };
  return { }; // redis: şifre command ile (aşağıda)
}
export function buildConnectionString(db: { engine: Engine; username?: string; password: string; hostPort: number; dbName?: string }): string {
  if (db.engine === 'postgres') return `postgresql://${db.username}:${db.password}@127.0.0.1:${db.hostPort}/${db.dbName}`;
  if (db.engine === 'mysql')    return `mysql://${db.username}:${db.password}@127.0.0.1:${db.hostPort}/${db.dbName}`;
  return `redis://:${db.password}@127.0.0.1:${db.hostPort}`;
}
async function pickPort(base: number): Promise<number> {
  const used = new Set(await getUsedPorts().catch(() => []));
  const dbUsed = new Set(getAllDatabases().map((d) => d.hostPort));
  for (let p = base; p < base + 200; p++) if (!used.has(p) && !dbUsed.has(p)) return p;
  throw new Error('Boş port bulunamadı');
}
export async function createDatabase(engine: Engine, displayName?: string): Promise<DatabaseDoc> {
  const cfg = ENGINES[engine];
  const safe = (displayName || engine).replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 20) || engine;
  const name = `zolpanel-db-${engine}-${genSuffix()}`;
  const password = genPassword();
  const username = engine === 'redis' ? '' : 'app';
  const dbName = engine === 'redis' ? '' : (safe || 'app');
  const hostPort = await pickPort(cfg.basePort);
  const volume = `${name}-data`;
  await pullImage(cfg.image);
  const args = buildRunArgs({ name, image: cfg.image, hostPort, containerPort: cfg.port, env: envFor(engine, password, dbName || 'app', username || 'app'), volume, volumePath: cfg.volumePath });
  if (engine === 'redis') { args.splice(args.lastIndexOf(cfg.image) + 1, 0, '--requirepass', password); } // imajdan sonra komut argümanı
  const containerId = await dockerRun(args);
  return insertDatabase({ engine, name, dbName, username, password, hostPort, volume, containerId, createdAt: new Date().toISOString() });
}
export async function listDatabases() {
  const rows = getAllDatabases();
  const containers = await listContainers().catch(() => []);
  return rows.map((d) => ({ ...d, state: containers.find((c) => c.name === d.name)?.state ?? 'unknown' }));
}
export async function removeDatabase(id: string, withVolume: boolean): Promise<void> {
  const db = getDatabaseById(id);
  if (!db) throw new Error('Veritabanı bulunamadı');
  await removeContainer(db.name, withVolume ? db.volume : undefined);
  dbRemove(id);
}
