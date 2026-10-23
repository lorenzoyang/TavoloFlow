import { defineConfig } from '@playwright/test';

const baseURL = process.env.PILOT_BASE_URL ?? 'https://localhost:8443';
if (process.env.PILOT_ISOLATED !== '1' || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('E2E creates fixture data. Set PILOT_ISOLATED=1 and use a dedicated localhost deployment.');
}
export default defineConfig({
  testDir: './e2e', timeout: 90_000, expect: { timeout: 15_000 }, workers: 1,
  retries: 0, reporter: 'list',
  use: { baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 },
    // Traces, videos and failure screenshots can capture one-time passwords.
    trace: 'off', video: 'off', screenshot: 'off' },
});
