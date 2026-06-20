import { db, type DomainDoc } from './db';
import { checkDomainSsl } from './ssl';

const SSL_INTERVAL = 60 * 1000; // 60 saniye

declare global {
  // eslint-disable-next-line no-var
  var __zolpanelSslTracker: boolean | undefined;
}

// Aktif domainlerin GERÇEK SSL durumunu kontrol edip DB'ye yazar.
async function refreshAll(): Promise<void> {
  const domains: DomainDoc[] = await new Promise((resolve) =>
    db.domains.find({ status: 'active' }, (_e: Error | null, d: DomainDoc[]) => resolve(d || [])),
  );

  for (const dom of domains) {
    const status = await checkDomainSsl(dom.domain);
    if (status !== dom.sslStatus) {
      db.domains.update(
        { _id: dom._id },
        { $set: { sslStatus: status, updatedAt: new Date().toISOString() } },
        {},
      );
    }
  }
}

export function startSslTracker(): void {
  if (globalThis.__zolpanelSslTracker) return;
  globalThis.__zolpanelSslTracker = true;
  refreshAll().catch(() => { /* yoksay */ });
  setInterval(() => {
    refreshAll().catch(() => { /* yoksay */ });
  }, SSL_INTERVAL);
  console.log('🔒 SSL durum takipçisi başlatıldı (60sn interval)');
}
