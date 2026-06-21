import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  insertApp, getAppById, getAllApps, updateApp, removeApp as dbRemoveApp,
  insertDomain, getAllDomains, getDomainByName, removeDomain, addLog,
  type AppDoc,
} from './db';
import { dockerBuild, dockerRun, buildRunArgs, removeContainer, removeImage, listContainers } from './docker';
import { getUsedPorts } from './portManager';
import { syncCaddyConfig } from './caddy';

export function isSafeRepoUrl(url: string): boolean {
  return typeof url === 'string' && /^https:\/\/[\w.@:/~-]+$/.test(url) && !url.includes(' ');
}

const APPS_DIR = path.join(process.env.INSTALL_DIR || process.cwd(), 'apps');

function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((res, rej) =>
    execFile(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (e, o, se) =>
      e ? rej(new Error(se || e.message)) : res(o),
    ),
  );
}

async function pickPort(): Promise<number> {
  const used = new Set(await getUsedPorts().catch(() => []));
  const apps = new Set(getAllApps().map((a) => a.hostPort));
  for (let p = 7001; p < 7300; p++) if (!used.has(p) && !apps.has(p)) return p;
  throw new Error('Boş port yok');
}

export async function createApp(i: {
  name: string;
  repoUrl: string;
  branch: string;
  domain?: string;
  containerPort: number;
}): Promise<AppDoc> {
  if (!isSafeRepoUrl(i.repoUrl)) throw new Error('Geçersiz repo URL (yalnız https)');
  const hostPort = await pickPort();
  return insertApp({
    name: i.name,
    repoUrl: i.repoUrl,
    branch: i.branch,
    domain: i.domain || null,
    containerPort: i.containerPort,
    hostPort,
    status: 'new',
    image: `zolpanel-app-${i.name}`,
    lastDeployedAt: null,
    createdAt: new Date().toISOString(),
  });
}

export async function deployApp(id: string): Promise<void> {
  const app = getAppById(id);
  if (!app) throw new Error('App bulunamadı');
  updateApp(id, { status: 'deploying' });
  try {
    const dir = path.join(APPS_DIR, app.name);
    if (fs.existsSync(path.join(dir, '.git'))) {
      await exec('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', app.branch]);
      await exec('git', ['-C', dir, 'reset', '--hard', `origin/${app.branch}`]);
    } else {
      fs.mkdirSync(APPS_DIR, { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      await exec('git', ['clone', '--depth', '1', '--branch', app.branch, app.repoUrl, dir]);
    }
    if (!fs.existsSync(path.join(dir, 'Dockerfile'))) {
      throw new Error('Repo kökünde Dockerfile yok');
    }
    await dockerBuild(app.image, dir);
    await removeContainer(app.name).catch(() => {});
    const args = buildRunArgs({
      name: app.name,
      image: app.image,
      hostPort: app.hostPort,
      containerPort: app.containerPort,
      env: {},
      volume: '',
      volumePath: '',
    });
    await dockerRun(args);
    if (app.domain && !getDomainByName(app.domain)) {
      insertDomain({
        domain: app.domain,
        type: 'proxy',
        port: app.hostPort,
        rootPath: null,
        routes: null,
        aliases: [],
        appType: 'other',
        notes: `app:${app.name}`,
        status: 'active',
        sslStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await syncCaddyConfig(getAllDomains());
    }
    updateApp(id, { status: 'running', lastDeployedAt: new Date().toISOString() });
    addLog(app.name, 'info', `App deploy edildi (${app.repoUrl})`);
  } catch (e: unknown) {
    updateApp(id, { status: 'error' });
    addLog(app.name, 'error', `Deploy hatası: ${(e as Error).message}`);
    throw e;
  }
}

export async function listApps(): Promise<(AppDoc & { state: string })[]> {
  const cs = await listContainers().catch(() => []);
  return getAllApps().map((a) => ({
    ...a,
    state: cs.find((c) => c.name === a.name)?.state ?? 'unknown',
  }));
}

export async function removeApp(id: string): Promise<void> {
  const app = getAppById(id);
  if (!app) throw new Error('App bulunamadı');
  await removeContainer(app.name).catch(() => {});
  await removeImage(app.image);
  if (app.domain) {
    const d = getDomainByName(app.domain);
    if (d) {
      removeDomain(d._id!);
      await syncCaddyConfig(getAllDomains());
    }
  }
  dbRemoveApp(id);
}
