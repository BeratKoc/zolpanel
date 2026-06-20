import { defineConfig, devices } from '@playwright/test';

// E2E için: production build'i (npm run start) deterministik env ile ayağa kaldırır.
// DB_DIR proje altında geçici bir klasör; CADDYFILE_PATH atılabilir bir yol.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3999',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    port: 3999,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      JWT_SECRET: 'e2e-test-secret-not-for-production',
      ZOLPANEL_TEST_ADMIN_PASSWORD: 'TestPass123!',
      DB_DIR: './e2e/.tmpdb',
      CADDYFILE_PATH: './e2e/.tmpdb/Caddyfile',
    },
  },
});
