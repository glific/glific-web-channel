import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({ init: vi.fn() }));
const sentry = vi.hoisted(() => ({ init: vi.fn() }));

vi.mock('posthog-js', () => ({ default: posthog }));
vi.mock('@sentry/react', () => sentry);

import { initPostHog, initSentry } from '@/lib/telemetry';

describe('telemetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts neither SDK without a key', async () => {
    await initPostHog('');
    await initSentry('');

    expect(posthog.init).not.toHaveBeenCalled();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('starts PostHog with autocapture, replay and exceptions, and keeps its cookie on the host', async () => {
    await initPostHog('phc_test');

    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        autocapture: true,
        disable_session_recording: false,
        capture_exceptions: true,
        cross_subdomain_cookie: false,
        custom_personal_data_properties: ['text', 'start'],
      })
    );
  });

  it('starts Sentry without default PII', async () => {
    await initSentry('https://key@o1.ingest.sentry.io/1');

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@o1.ingest.sentry.io/1', sendDefaultPii: false })
    );
  });

  it('carries on if an SDK fails to start', async () => {
    posthog.init.mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    await expect(initPostHog('phc_test')).resolves.toBeUndefined();
  });
});
