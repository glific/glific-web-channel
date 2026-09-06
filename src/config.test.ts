import { describe, it, expect, vi, afterEach } from 'vitest';

import { deriveBackendOrigin } from '@/config';

describe('deriveBackendOrigin', () => {
  it('swaps the leading web label for api', () => {
    expect(deriveBackendOrigin('web.staging.glific.com', 'https:')).toBe('https://api.staging.glific.com');
  });

  it('works for a two-label org domain', () => {
    expect(deriveBackendOrigin('web.glific.com', 'https:')).toBe('https://api.glific.com');
  });

  it('keeps the deeper labels intact for a per-org host', () => {
    expect(deriveBackendOrigin('web.tap.glific.com', 'https:')).toBe('https://api.tap.glific.com');
  });

  it('preserves the protocol rather than assuming https', () => {
    expect(deriveBackendOrigin('web.staging.glific.com', 'http:')).toBe('http://api.staging.glific.com');
  });

  it('returns null for a Vercel preview host, which names no organisation', () => {
    // This is the case that must be configured explicitly — nothing about this hostname says
    // which backend it belongs to, so guessing would send a preview at a real org's API.
    expect(deriveBackendOrigin('glific-web-channel-git-main-glific.vercel.app', 'https:')).toBeNull();
    expect(deriveBackendOrigin('glific-web-channel-d9ejx9be2-glific.vercel.app', 'https:')).toBeNull();
  });

  it('returns null for local dev, which proxies same-origin', () => {
    expect(deriveBackendOrigin('glific.test', 'https:')).toBeNull();
    expect(deriveBackendOrigin('localhost', 'http:')).toBeNull();
  });

  it('requires the first label to be exactly "web"', () => {
  // Without the api. prefix this lands on the staff console, a static site that answers every
  // path with index.html and no CORS headers — which reads as a CORS failure, not a wrong host.
  it('targets the api host, not the staff console', () => {
    const origin = deriveBackendOrigin('web.staging.glific.com', 'https:') as string;

    expect(origin).toContain('//api.');
    expect(origin).not.toBe('https://staging.glific.com');
  });

    // A prefix match would turn webhooks.glific.com into api.glific.com.
    expect(deriveBackendOrigin('webhooks.glific.com', 'https:')).toBeNull();
    expect(deriveBackendOrigin('website.glific.com', 'https:')).toBeNull();
  });

  it('refuses a host too short to carry a real domain', () => {
    // "web.test" would otherwise resolve to a nonexistent "api.test".
    expect(deriveBackendOrigin('web.test', 'https:')).toBeNull();
    expect(deriveBackendOrigin('web', 'https:')).toBeNull();
  });
});

// The pure function above can be correct while the module never calls it, so these exercise the
// exported endpoints themselves by re-importing the module under a stubbed location.
describe('the exported endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const loadConfigFor = async (hostname: string, protocol = 'https:') => {
    vi.resetModules();
    vi.stubGlobal('location', { hostname, protocol });
    return import('@/config');
  };

  it('point at the derived backend on a web.* host', async () => {
    const config = await loadConfigFor('web.staging.glific.com');

    expect(config.WEB_CHANNEL_REQUEST_OTP).toBe(
      'https://api.staging.glific.com/api/v1/web_channel/request-otp'
    );
    expect(config.WEB_CHANNEL_VERIFY_OTP).toBe(
      'https://api.staging.glific.com/api/v1/web_channel/verify-otp'
    );
    // wss, not https — the phoenix client needs a full ws URL once it is cross-origin.
    expect(config.WEB_SOCKET).toBe('wss://api.staging.glific.com/web_socket');
  });

  it('fall back to same-origin paths on a preview host, so the misconfiguration is visible', async () => {
    const config = await loadConfigFor('glific-web-channel-git-main-glific.vercel.app');

    expect(config.WEB_CHANNEL_REQUEST_OTP).toBe('/api/v1/web_channel/request-otp');
    expect(config.WEB_SOCKET).toBe('/web_socket');
  });

  it('fall back to same-origin paths in local dev, where Vite proxies them', async () => {
    const config = await loadConfigFor('glific.test');

    expect(config.WEB_CHANNEL_REQUEST_OTP).toBe('/api/v1/web_channel/request-otp');
    expect(config.WEB_SOCKET).toBe('/web_socket');
  });
});
