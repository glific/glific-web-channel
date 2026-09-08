import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

// The live suite runs against a real Glific backend instead of stubs (`yarn e2e:live`). It needs
// the dev server rather than `vite preview`, because only the dev server proxies /api to the
// backend — and it needs Postgres and Phoenix, so it never runs on CI.
const LIVE = !!process.env.E2E_LIVE;
const LIVE_URL = process.env.E2E_LIVE_URL ?? 'https://glific.test:5173';

const stubbedProjects = [
  { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  { name: 'mobile-safari-small', use: { ...devices['iPhone SE'] } },
  { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
].map((project) => ({ ...project, testIgnore: /live\// }));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !LIVE,
  // A .only left in a spec silently narrows the suite to one test, which reads as green.
  forbidOnly: CI,
  // Never retry a live run: the backend throttles a phone to one OTP per 30s, so a retry fails on
  // the throttle rather than on whatever went wrong the first time.
  retries: LIVE ? 0 : CI ? 2 : 0,
  // Serial, so the journeys stay inside the backend's per-IP budget.
  workers: LIVE ? 1 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: LIVE ? LIVE_URL : BASE_URL,
    // The dev server's mkcert certificate is not in the browser's trust store.
    ignoreHTTPSErrors: LIVE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // Beneficiaries reach this on a phone — often a shared or borrowed one — so mobile is the
  // primary target, not an afterthought. Chrome on Android and Safari on iOS together cover
  // the large majority of mobile browser use; desktop Chrome stays for staff-side debugging.
  projects: LIVE
    ? [{ name: 'live-backend', testMatch: /live\/.*\.spec\.ts/, use: { ...devices['Pixel 7'] } }]
    : stubbedProjects,

  // The production build, not the dev server — theming runs before first paint and the dev
  // server's module graph is not what ships. The live suite is the exception: it needs the dev
  // server's /api proxy to reach the backend.
  webServer: LIVE
    ? { command: 'yarn dev', url: LIVE_URL, reuseExistingServer: true, ignoreHTTPSErrors: true, timeout: 120_000 }
    : {
        command: `yarn preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !CI,
        timeout: 120_000,
      },
});
