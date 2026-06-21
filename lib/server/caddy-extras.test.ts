import { test } from 'node:test';
import assert from 'node:assert';
const dbPath = require.resolve('./db.ts');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { addLog: () => {} } } as never;
import { buildDomainBlock } from './caddy';

test('header emit', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ headers:[{key:'X-Foo',value:'bar'}] } } as never);
  assert.match(b, /header \{[\s\S]*X-Foo "bar"[\s\S]*\}/);
});
test('redirect 301', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ redirects:[{from:'/old',to:'/new',permanent:true}] } } as never);
  assert.match(b, /redir \/old \/new 301/);
});
test('redirect 302', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ redirects:[{from:'/x',to:'/y',permanent:false}] } } as never);
  assert.match(b, /redir \/x \/y 302/);
});
test('ip deny', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ ipRules:{mode:'deny',cidrs:['1.2.3.4','10.0.0.0/8']} } } as never);
  assert.match(b, /@zolpanel_ipblock remote_ip 1\.2\.3\.4 10\.0\.0\.0\/8/);
  assert.match(b, /respond @zolpanel_ipblock 403/);
});
test('ip allow (not remote_ip)', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ ipRules:{mode:'allow',cidrs:['1.2.3.4']} } } as never);
  assert.match(b, /@zolpanel_ipblock not remote_ip 1\.2\.3\.4/);
});
test('basic_auth emit', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[], caddyExtras:{ basicAuth:[{username:'admin',passwordHash:'$2a$14$abc'}] } } as never);
  assert.match(b, /basic_auth \{[\s\S]*admin \$2a\$14\$abc[\s\S]*\}/);
});
test('no extras = original (regression)', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'proxy', port:3000, aliases:[] } as never);
  assert.ok(b.includes('reverse_proxy localhost:3000') && !b.includes('header {') && !b.includes('basic_auth'));
});
test('static + extras', () => {
  const b = buildDomainBlock({ domain:'a.com', type:'static', rootPath:'/var/www/a', aliases:[], caddyExtras:{ headers:[{key:'X-A',value:'1'}] } } as never);
  assert.ok(b.includes('file_server') && /header \{[\s\S]*X-A "1"/.test(b));
});
