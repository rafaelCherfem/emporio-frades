import { defineConfig, devices } from '@playwright/test';

// No seu PC: `npx playwright install chromium` uma vez. Em ambientes com o
// Chromium já instalado, defina PW_CHROMIUM_PATH.
const executablePath = process.env['PW_CHROMIUM_PATH'];
const PORT = 4323;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node scripts/build-test.mjs && node scripts/serve-dist.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DIST: 'dist-test', PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
