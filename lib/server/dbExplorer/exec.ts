import { execFile } from 'child_process';

export function dbExec(container: string, argv: string[], env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['exec', ...(env ? Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]) : []), container, ...argv],
      { maxBuffer: 64 * 1024 * 1024 },
      (e, out, se) => (e ? reject(new Error(se || e.message)) : resolve(out))
    );
  });
}
