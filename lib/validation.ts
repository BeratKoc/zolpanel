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

export const createDomainSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('proxy'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    port: port.optional(),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal('static'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    rootPath: safeAbsPath.optional(),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    type: z.literal('advanced'),
    domain: hostname,
    aliases: z.array(hostname).default([]),
    routes: z.array(routeSchema).min(1),
    appType: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
  }),
]);

export const updateDomainSchema = z.object({
  notes: z.string().max(2000).optional(),
  aliases: z.array(hostname).optional(),
  status: z.enum(['active', 'offline']).optional(),
  appType: z.string().max(40).optional(),
});

export const processNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).regex(/[A-Z]/, 'En az bir büyük harf').regex(/[0-9]/, 'En az bir rakam'),
});
export const loginSchema = z.object({ username: z.string().min(1).max(100), password: z.string().min(1) });
