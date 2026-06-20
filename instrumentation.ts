export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb, initAdmin } = await import('./lib/server/db');
    const { startTracker } = await import('./lib/server/memoryTracker');
    await initDb();
    await initAdmin();
    startTracker();
    console.log('🚀 Zolpanel başladı — http://127.0.0.1:3999');
  }
}
