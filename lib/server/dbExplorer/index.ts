import { type Engine } from './types';
import { postgresAdapter } from './postgres';
import { mysqlAdapter } from './mysql';
import { redisAdapter } from './redis';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAdapter = any;

/**
 * Returns the appropriate DB adapter for the given engine.
 * Throws if the engine is unknown.
 */
export function getAdapter(engine: Engine): AnyAdapter {
  switch (engine) {
    case 'postgres':
      return postgresAdapter;
    case 'mysql':
      return mysqlAdapter;
    case 'redis':
      return redisAdapter;
    default: {
      const _exhaustive: never = engine;
      throw new Error(`Unknown database engine: ${_exhaustive}`);
    }
  }
}

export { postgresAdapter, mysqlAdapter, redisAdapter };
