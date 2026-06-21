import { listContainers } from '../docker';
import { getAllDatabases } from '../db';
import type { DbConnection, Engine } from './types';

export function engineForImage(image: string): Engine | null {
  const i = image.toLowerCase();
  if (/(^|\/)postgres|pgvector/.test(i)) return 'postgres';
  if (/(^|\/)mysql|mariadb/.test(i)) return 'mysql';
  if (/(^|\/)redis/.test(i)) return 'redis';
  return null;
}

export async function discoverConnections(): Promise<DbConnection[]> {
  const panelNames = new Set(getAllDatabases().map((d) => d.name));
  const cs = await listContainers().catch(() => []);
  return cs.flatMap((c) => {
    const engine = engineForImage(c.image);
    if (!engine) return [];
    return [{ ref: c.name, engine, image: c.image, source: panelNames.has(c.name) ? 'panel' as const : 'external' as const }];
  });
}

export async function getConnection(ref: string): Promise<DbConnection> {
  const conn = (await discoverConnections()).find((c) => c.ref === ref);
  if (!conn) throw new Error('DB bağlantısı bulunamadı');
  return conn;
}
