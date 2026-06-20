export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb, initAdmin } = await import('./lib/server/db');
    const { startTracker } = await import('./lib/server/memoryTracker');
    const { startSslTracker } = await import('./lib/server/sslTracker');
    initDb();
    await initAdmin();
    startTracker();
    startSslTracker();
    console.log('🚀 Zolpanel başladı — http://127.0.0.1:3999');
  }
}
