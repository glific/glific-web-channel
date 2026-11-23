import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
}));

vi.mock('@sentry/react', () => sentry);

import {
  __resetMonitoringForTests,
  clearMonitoringUser,
  initMonitoring,
  reportRenderError,
  setMonitoringUser,
} from '@/lib/monitoring';
import { scrubBreadcrumb, scrubEvent } from '@/lib/scrub';

const DSN = 'https://public@o0.ingest.sentry.io/0';

describe('monitoring', () => {
  beforeEach(() => {
    __resetMonitoringForTests();
    vi.clearAllMocks();
  });

  afterEach(() => __resetMonitoringForTests());

  describe('without a DSN', () => {
    it('never starts Sentry, and every call is a no-op', async () => {
      expect(await initMonitoring({ dsn: '' })).toBe(false);

      setMonitoringUser(77);
      clearMonitoringUser();
      reportRenderError(new Error('boom'));

      Object.values(sentry).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    });
  });

  describe('with a DSN', () => {
    it('starts with no default PII, no replay, scrubbing hooks and the given environment and release', async () => {
      expect(
        await initMonitoring({ dsn: DSN, environment: 'preview', release: 'abc123', tracesSampleRate: '0.2' })
      ).toBe(true);

      const options = sentry.init.mock.calls[0][0];
      expect(options).toEqual(
        expect.objectContaining({
          dsn: DSN,
          environment: 'preview',
          release: 'abc123',
          sendDefaultPii: false,
          tracesSampleRate: 0.2,
          beforeSend: scrubEvent,
          beforeSendTransaction: scrubEvent,
          beforeBreadcrumb: scrubBreadcrumb,
        })
      );
      expect(options.integrations).toEqual([{ name: 'BrowserTracing' }]);
      expect(options).not.toHaveProperty('replaysSessionSampleRate');
      expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    });

    it('falls back to a low trace sample rate when the configured one is missing or nonsense', async () => {
      await initMonitoring({ dsn: DSN, tracesSampleRate: 'lots' });

      expect(sentry.init.mock.calls[0][0].tracesSampleRate).toBe(0.05);
    });

    it('identifies the contact by id only, and forgets them on sign-out', async () => {
      await initMonitoring({ dsn: DSN });

      setMonitoringUser(77);
      expect(sentry.setUser).toHaveBeenLastCalledWith({ id: '77' });

      clearMonitoringUser();
      expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    });

    it('reports a render error with its component stack', async () => {
      await initMonitoring({ dsn: DSN });
      const error = new Error('boom');

      reportRenderError(error, '\n    at Chat');

      expect(sentry.captureException).toHaveBeenCalledWith(error, {
        contexts: { react: { componentStack: '\n    at Chat' } },
      });
    });
  });

  it('queues calls made while Sentry loads, and replays them once it has', async () => {
    const starting = initMonitoring({ dsn: DSN });
    setMonitoringUser(77);

    expect(sentry.setUser).not.toHaveBeenCalled();

    await starting;

    expect(sentry.setUser).toHaveBeenCalledWith({ id: '77' });
  });

  it('stays off if Sentry throws while starting', async () => {
    sentry.init.mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    expect(await initMonitoring({ dsn: DSN })).toBe(false);
    setMonitoringUser(77);
    expect(sentry.setUser).not.toHaveBeenCalled();
  });
});
