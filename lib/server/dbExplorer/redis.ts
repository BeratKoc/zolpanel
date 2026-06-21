import { dbExec } from './exec';
import { getAllDatabases } from '../db';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Splits redis-cli --scan output on '\n', trims each line, and filters empty
 * lines. Returns the array of key names.
 */
export function parseScan(out: string): string[] {
  return out
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

// ---------------------------------------------------------------------------
// Auth resolution
// ---------------------------------------------------------------------------

/**
 * Determines whether redis-cli needs auth args for this container.
 *
 * Strategy:
 * 1. Try a PING with no auth.
 * 2. If the output contains NOAUTH or WRONGPASS (or the call errors), resolve
 *    the password:
 *    a. Panel-stored password via getAllDatabases().
 *    b. REDIS_PASSWORD env var inside the container.
 * 3. Return ['-a', pw, '--no-auth-warning'] or [] if no auth is needed.
 * 4. Throw 'Redis kimlik bilgisi bulunamadı' if auth is required but no
 *    password can be found.
 */
export async function redisAuthArgs(ref: string): Promise<string[]> {
  let needsAuth = false;

  try {
    const out = await dbExec(ref, ['redis-cli', 'PING']);
    if (out.includes('NOAUTH') || out.includes('WRONGPASS')) {
      needsAuth = true;
    }
  } catch (err) {
    // redis-cli exits non-zero when auth is required — inspect the message.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NOAUTH') || msg.includes('WRONGPASS')) {
      needsAuth = true;
    } else {
      // Some other exec error; re-throw.
      throw err;
    }
  }

  if (!needsAuth) return [];

  // 1. Panel-stored password.
  const stored = getAllDatabases().find(d => d.name === ref)?.password;
  if (stored) return ['-a', stored, '--no-auth-warning'];

  // 2. REDIS_PASSWORD env var inside the container.
  try {
    const envPw = (await dbExec(ref, ['printenv', 'REDIS_PASSWORD'])).trim();
    if (envPw) return ['-a', envPw, '--no-auth-warning'];
  } catch {
    // env var not set; fall through.
  }

  throw new Error('Redis kimlik bilgisi bulunamadı');
}

// ---------------------------------------------------------------------------
// Adapter operations
// ---------------------------------------------------------------------------

const DEFAULT_COUNT = 200;
const MAX_COUNT = 1000;

/**
 * Lists keys using redis-cli --scan.
 * @param ref      Container name / panel ref.
 * @param options  match – glob pattern (default '*'); count – max keys (default 200, ≤ 1000).
 */
async function listKeys(
  ref: string,
  { match = '*', count = DEFAULT_COUNT }: { match?: string; count?: number } = {}
): Promise<string[]> {
  const clampedCount = Math.max(1, Math.min(MAX_COUNT, count));
  const authArgs = await redisAuthArgs(ref);
  const out = await dbExec(ref, [
    'redis-cli',
    ...authArgs,
    '--scan',
    '--pattern',
    match,
  ]);
  return parseScan(out).slice(0, clampedCount);
}

/**
 * Gets the value of a Redis key.
 * Returns { type, value } where value is a raw string or string[].
 */
async function getValue(
  ref: string,
  key: string
): Promise<{ type: string; value: string | string[] }> {
  const authArgs = await redisAuthArgs(ref);

  const typeOut = await dbExec(ref, ['redis-cli', ...authArgs, 'TYPE', key]);
  const type = typeOut.trim();

  let value: string | string[];

  switch (type) {
    case 'string': {
      value = await dbExec(ref, ['redis-cli', ...authArgs, 'GET', key]);
      break;
    }
    case 'hash': {
      const raw = await dbExec(ref, ['redis-cli', ...authArgs, 'HGETALL', key]);
      value = parseScan(raw);
      break;
    }
    case 'list': {
      const raw = await dbExec(ref, ['redis-cli', ...authArgs, 'LRANGE', key, '0', '-1']);
      value = parseScan(raw);
      break;
    }
    case 'set': {
      const raw = await dbExec(ref, ['redis-cli', ...authArgs, 'SMEMBERS', key]);
      value = parseScan(raw);
      break;
    }
    case 'zset': {
      const raw = await dbExec(ref, ['redis-cli', ...authArgs, 'ZRANGE', key, '0', '-1', 'WITHSCORES']);
      value = parseScan(raw);
      break;
    }
    default: {
      value = type; // e.g. 'none' or unknown type
      break;
    }
  }

  return { type, value };
}

/**
 * Sets a string key in Redis (SET key value).
 */
async function setValue(ref: string, key: string, value: string): Promise<void> {
  const authArgs = await redisAuthArgs(ref);
  await dbExec(ref, ['redis-cli', ...authArgs, 'SET', key, value]);
}

/**
 * Deletes a key from Redis (DEL key).
 */
async function deleteKey(ref: string, key: string): Promise<void> {
  const authArgs = await redisAuthArgs(ref);
  await dbExec(ref, ['redis-cli', ...authArgs, 'DEL', key]);
}

// ---------------------------------------------------------------------------
// Adapter export
// ---------------------------------------------------------------------------

export const redisAdapter = {
  listKeys,
  getValue,
  setValue,
  deleteKey,
};
