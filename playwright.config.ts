import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: process.env.E2E_DATABASE ? 'test-results-db' : 'test-results',
  testMatch: process.env.E2E_DATABASE ? '**/groups.spec.ts' : '**/portal.spec.ts',
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: process.env.E2E_DATABASE ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3002',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.E2E_DATABASE
      ? 'npm run start -- --port 3001'
      : 'npm run start -- --port 3002',
    url: process.env.E2E_DATABASE ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3002',
    reuseExistingServer: false,
    env: process.env.E2E_DATABASE
      ? undefined
      : {
          DATABASE_URL: '',
          DIRECT_URL: '',
          APP_URL: '',
          NEXT_PUBLIC_SUPABASE_URL: '',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
        },
    timeout: 120000,
  },
  projects: process.env.E2E_DATABASE
    ? [{ name: 'database', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
      ],
});
