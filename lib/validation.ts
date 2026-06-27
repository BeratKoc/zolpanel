import { z } from 'zod';

const hostname = z.string().regex(/^[a-z0-9.-]+$/i, 'Geçersiz domain (sadece harf, rakam, nokta, tire)').max(253);
const port = z.coerce.number().int().min(1).max(65535);
const routePath = z.string().regex(/^\/[A-Za-z0-9._*/-]*$/, 'Geçersiz path').max(200);
const safeAbsPath = z.string().regex(/^\/[A-Za-z0-9._/-]+$/, 'Geçersiz yol').max(512);

export const routeSchema = z.object({
  path: routePath,
  port,
  type: z.enum(['http', 'websocket']),
});

const headerKey = z.string().regex(/^[A-Za-z0-9-]+$/, 'Geçersiz header adı').max(100);
const headerVal = z.string().max(500).regex(/^[^\n\r{}]*$/, 'Geçersiz değer');
const caddyPath = z.string().regex(/^\/[A-Za-z0-9._*/-]*$/, 'Geçersiz path').max(200);
const redirectTo = z.string().min(1).max(300).regex(/^[^\n\r{}\s]+$/, 'Geçersiz hedef');
const cidr = z.string().regex(/^[0-9a-fA-F:.]+(\/\d{1,3})?$/, 'Geçersiz IP/CIDR').max(64);
const baUsername = z.string().regex(/^[A-Za-z0-9._-]+$/, 'Geçersiz kullanıcı adı').max(50);

export const caddyExtrasSchema = z.object({
  headers: z.array(z.object({ key: headerKey, value: headerVal })).max(30).optional(),
  redirects: z.array(z.object({ from: caddyPath, to: redirectTo, permanent: z.boolean() })).max(30).optional(),
  basicAuth: z.array(z.object({
    username: baUsername,
    password: z.string().min(1).max(200).optional(),
    passwordHash: z.string().max(120).optional(),
  })).max(20).optional(),
  ipRules: z.object({ mode: z.enum(['allow', 'deny']), cidrs: z.array(cidr).max(100) }).nullable().optional(),
}).optional();

export const createDomainSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('proxy'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    port: port.optional(),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
    caddyExtras: caddyExtrasSchema,
  }),
  z.object({
    type: z.literal('static'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    rootPath: safeAbsPath.optional(),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
    caddyExtras: caddyExtrasSchema,
  }),
  z.object({
    type: z.literal('advanced'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    routes: z.array(routeSchema).min(1),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
    caddyExtras: caddyExtrasSchema,
  }),
]);

export const updateDomainSchema = z.object({
  notes: z.string().max(2000).optional(),
  aliases: z.array(hostname).optional(),
  status: z.enum(['active', 'offline']).optional(),
  appType: z.string().max(40).optional(),
  caddyExtras: caddyExtrasSchema,
});

export const processNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
export const containerRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/);
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).regex(/[A-Z]/, 'En az bir büyük harf').regex(/[0-9]/, 'En az bir rakam'),
});
export const loginSchema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1), totp: z.string().max(10).optional() });
export const createDatabaseSchema = z.object({ engine: z.enum(['postgres','mysql','redis']), name: z.string().regex(/^[a-z0-9-]{0,30}$/).optional() });
export const createAppSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,29}$/),
  repoUrl: z.string().regex(/^https:\/\/[\w.@:/~-]+$/),
  // İlk karakter alfanümerik → branch/ad git'te flag (-x) olarak yorumlanamaz.
  branch: z.string().regex(/^[A-Za-z0-9][\w./-]{0,99}$/).default('main'),
  domain: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/).optional(),
  containerPort: z.number().int().min(1).max(65535),
});
