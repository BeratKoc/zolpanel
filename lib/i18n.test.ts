import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const LOCALES = ['tr', 'en', 'zh', 'es', 'de', 'fr'];
const root = path.join(__dirname, '..');

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]);
}
function loadKeys(locale: string): Set<string> {
  return new Set(flatten(JSON.parse(readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8'))));
}

test('6 dil aynı anahtar setine sahip (parity)', () => {
  const ref = loadKeys('en');
  for (const loc of LOCALES) {
    const k = loadKeys(loc);
    const missing = [...ref].filter((x) => !k.has(x));
    const extra = [...k].filter((x) => !ref.has(x));
    assert.deepStrictEqual({ loc, missing, extra }, { loc, missing: [], extra: [] });
  }
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

test('kodda kullanılan literal t(\x27...\x27) anahtarları en.json\x27da mevcut', () => {
  const en = loadKeys('en');
  const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))];
  const re = /[^a-zA-Z]t\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      if (!en.has(m[1])) missing.push(`${path.basename(f)}: ${m[1]}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});
