import { afterEach, describe, expect, it, vi } from 'vitest';

// A vi.mock factory runs only when the module is actually imported, so counting its runs counts
// how often the app downloaded each SDK.
const loaded = vi.hoisted(() => ({ posthog: 0, sentry: 0 }));

vi.mock('posthog-js', () => {
  loaded.posthog += 1;
  return { default: { init: vi.fn(), register: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn() } };
});

vi.mock('@sentry/react', () => {
  loaded.sentry += 1;
  return { init: vi.fn(), setUser: vi.fn(), captureException: vi.fn(), browserTracingIntegration: vi.fn() };
});

import { __resetAnalyticsForTests, identifyContact, initAnalytics, resetAnalytics, track } from '@/lib/analytics';
import {
  __resetMonitoringForTests,
  clearMonitoringUser,
  initMonitoring,
  reportRenderError,
  setMonitoringUser,
} from '@/lib/monitoring';

describe('optional SDKs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetAnalyticsForTests();
    __resetMonitoringForTests();
  });

  it('loads neither PostHog nor Sentry when no token or DSN is configured', async () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_PROJECT_TOKEN', '');
    vi.stubEnv('VITE_PUBLIC_SENTRY_DSN', '');

    expect(await initAnalytics()).toBe(false);
    expect(await initMonitoring()).toBe(false);

    track('otp_requested');
    identifyContact(77);
    resetAnalytics();
    setMonitoringUser(77);
    clearMonitoringUser();
    reportRenderError(new Error('boom'));

    expect(loaded).toEqual({ posthog: 0, sentry: 0 });
  });

  // Proves the counters above can move, so their staying at zero means something.
  it('loads each SDK once it is configured', async () => {
    vi.stubEnv('VITE_PUBLIC_POSTHOG_PROJECT_TOKEN', 'phc_test');
    vi.stubEnv('VITE_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0');

    expect(await initAnalytics()).toBe(true);
    expect(await initMonitoring()).toBe(true);

    expect(loaded).toEqual({ posthog: 1, sentry: 1 });
  });
});
