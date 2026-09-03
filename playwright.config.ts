import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A .only left in a spec silently narrows the suite to one test, which reads as green.
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Beneficiaries reach this on a phone — often a shared or borrowed one — so mobile is the
  // primary target, not an afterthought. Chrome on Android and Safari on iOS together cover
  // the large majority of mobile browser use; desktop Chrome stays for staff-side debugging.
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
    { name: 'mobile-safari-small', use: { ...devices['iPhone SE'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],

  // The production build, not the dev server — theming runs before first paint and the dev
  // server's module graph is not what ships.
  webServer: {
    command: `yarn preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
