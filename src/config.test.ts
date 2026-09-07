import { describe, it, expect } from 'vitest';

import { deriveApiBase } from './config';

describe('deriveApiBase', () => {
  // One build serves every NGO, so the backend has to come from where the page is served —
  // anything inlined at build time would pin the bundle to a single organisation.
  it('maps an org web host onto that org backend', () => {
    expect(deriveApiBase('web.staging.glific.com')).toBe('https://api.staging.glific.com/api');
    expect(deriveApiBase('web.another-ngo.glific.com')).toBe('https://api.another-ngo.glific.com/api');
  });

  // Without the api. prefix this resolves to the staff console, a static site that answers any
  // path with index.html and no CORS headers — which surfaces as a CORS error rather than as the
  // wrong host. The previous test asserted the tech design's mapping rather than a reachable
  // host, so it passed while the widget could not talk to staging at all.
  it('targets the api host, not the console host', () => {
    const base = deriveApiBase('web.staging.glific.com');

    expect(base).toContain('//api.');
    expect(base).not.toBe('https://staging.glific.com/api');
  });

  it('gives two orgs two different backends from the same build', () => {
    expect(deriveApiBase('web.first.glific.com')).not.toBe(deriveApiBase('web.second.glific.com'));
  });

  it('falls back to a same-origin path in dev, where the Vite proxy forwards it', () => {
    expect(deriveApiBase('localhost')).toBe('/api');
    expect(deriveApiBase('glific.test')).toBe('/api');
    expect(deriveApiBase('127.0.0.1')).toBe('/api');
  });

  it('does not treat a host that merely contains "web" as an org host', () => {
    expect(deriveApiBase('webinar.glific.com')).toBe('/api');
    expect(deriveApiBase('myweb.glific.com')).toBe('/api');
  });
});
