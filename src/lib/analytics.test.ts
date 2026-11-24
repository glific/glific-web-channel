import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: posthog }));

import {
  __resetAnalyticsForTests,
  identifyContact,
  initAnalytics,
  resetAnalytics,
  setAnalyticsOrganization,
  track,
} from '@/lib/analytics';

describe('analytics', () => {
  beforeEach(() => {
    __resetAnalyticsForTests();
    vi.clearAllMocks();
  });

  afterEach(() => __resetAnalyticsForTests());

  describe('without a project token', () => {
    it('never starts PostHog, and every call is a no-op', async () => {
      expect(await initAnalytics({ token: '' })).toBe(false);

      setAnalyticsOrganization('Akshar');
      track('otp_requested');
      identifyContact(42);
      resetAnalytics();

      Object.values(posthog).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    });
  });

  describe('with a project token', () => {
    beforeEach(async () => {
      await initAnalytics({ token: 'phc_test', host: 'https://eu.i.posthog.com' });
    });

    it('starts PostHog with nothing that could record what a contact says', () => {
      expect(posthog.init).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({
          api_host: 'https://eu.i.posthog.com',
          person_profiles: 'identified_only',
          autocapture: false,
          disable_session_recording: true,
          capture_exceptions: false,
          rageclick: false,
          capture_heatmaps: false,
          cross_subdomain_cookie: false,
          disable_external_dependency_loading: true,
          capture_performance: false,
          mask_personal_data_properties: true,
          custom_personal_data_properties: ['text', 'start'],
        })
      );
    });

    it('tags every event with the app and the organisation host', () => {
      expect(posthog.register).toHaveBeenCalledWith({ app: 'web_channel', org_host: window.location.hostname });
    });

    it('groups by hostname, since branding carries no organisation id', () => {
      setAnalyticsOrganization('Akshar');

      expect(posthog.group).toHaveBeenCalledWith('organization', window.location.hostname, { name: 'Akshar' });
    });

    it('captures events with their properties', () => {
      track('message_sent', { type: 'image', source: 'composer' });

      expect(posthog.capture).toHaveBeenCalledWith('message_sent', { type: 'image', source: 'composer' });
    });

    it('identifies a contact by its id as a string', () => {
      identifyContact(42);

      expect(posthog.identify).toHaveBeenCalledWith('42');
    });

    it('on reset forgets the contact but keeps the app and organisation', () => {
      setAnalyticsOrganization('Akshar');
      vi.clearAllMocks();

      resetAnalytics();

      expect(posthog.reset).toHaveBeenCalled();
      expect(posthog.register).toHaveBeenCalledWith({ app: 'web_channel', org_host: window.location.hostname });
      expect(posthog.group).toHaveBeenCalledWith('organization', window.location.hostname, { name: 'Akshar' });
    });
  });

  it('queues calls made while PostHog loads, and replays them in order once it has', async () => {
    const starting = initAnalytics({ token: 'phc_test' });
    track('trigger_link_opened', { kind: 'start' });
    setAnalyticsOrganization('Akshar');

    expect(posthog.capture).not.toHaveBeenCalled();

    await starting;

    expect(posthog.capture).toHaveBeenCalledWith('trigger_link_opened', { kind: 'start' });
    expect(posthog.group).toHaveBeenCalledWith('organization', window.location.hostname, { name: 'Akshar' });
    expect(posthog.init.mock.invocationCallOrder[0]).toBeLessThan(posthog.capture.mock.invocationCallOrder[0]);
  });

  it('stays off, and drops what it queued, if PostHog throws while starting', async () => {
    posthog.init.mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    const starting = initAnalytics({ token: 'phc_test' });
    track('otp_requested');

    expect(await starting).toBe(false);
    track('otp_verified');
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});
