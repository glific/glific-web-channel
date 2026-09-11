import axios from 'axios';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_CHANNEL_BRANDING } from '@/config';
import { applyBranding, fetchBranding, getBranding, hasOrgProfile, isWebChannelEnabled, loadBranding } from './branding';

vi.mock('axios');
const mockedAxios = axios as any;

const EMPTY_ABOUT = { description: null, address: null, website: null, email: null, hours: null };

const ORG = {
  display_name: 'Example NGO',
  logo_url: 'https://cdn.example.org/logo.png',
  primary_color: '#4c3bcf',
  primary_foreground: '#fafafa',
  secondary_color: '#ff8a3d',
  about: { ...EMPTY_ABOUT, address: 'Mumbai, Maharashtra' },
};

describe('applyBranding', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.querySelector('link[rel="icon"]')?.remove();
    document.title = '';
  });

  it('overrides the raw --primary vars, not the @theme inline --color-* aliases', () => {
    applyBranding(ORG);

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--primary')).toBe(ORG.primary_color);
    expect(root.getPropertyValue('--primary-foreground')).toBe(ORG.primary_foreground);
    // These are compiled through @theme inline, so setting them at runtime does nothing.
    expect(root.getPropertyValue('--color-primary')).toBe('');
  });

  // shadcn's --secondary is a surface colour with its own foreground. Repainting it would put
  // brand-coloured text on brand-coloured buttons, so the decorative colour gets its own var.
  it('puts the decorative colour on --brand-accent and leaves --secondary alone', () => {
    applyBranding(ORG);

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--brand-accent')).toBe(ORG.secondary_color);
    expect(root.getPropertyValue('--secondary')).toBe('');
  });

  it('takes the server at its word on the foreground, both light and dark', () => {
    applyBranding({ ...ORG, primary_color: '#ffb900', primary_foreground: '#18181b' });

    expect(document.documentElement.style.getPropertyValue('--primary-foreground')).toBe('#18181b');
  });

  it('sets the document title from the display name', () => {
    applyBranding(ORG);

    expect(document.title).toBe('Example NGO — Chat');
  });

  // The widget is a standalone site on the org's own subdomain, so a Glific mark in the tab is a
  // branding leak.
  it('points the tab icon at the org logo', () => {
    applyBranding(ORG);

    const link = document.querySelector('link[rel="icon"]');
    expect(link).toHaveAttribute('href', ORG.logo_url);
    // A logo can be a PNG, a JPEG or an SVG; a stale type attribute would mislabel it.
    expect(link).not.toHaveAttribute('type');
  });

  it('falls back to the org monogram when no logo has been uploaded', () => {
    applyBranding({ ...ORG, logo_url: null });

    const href = document.querySelector('link[rel="icon"]')!.getAttribute('href')!;
    const svg = decodeURIComponent(href.replace('data:image/svg+xml,', ''));

    // "Example NGO" is two words, so the monogram is one letter from each.
    expect(svg).toContain('>en<');
    // Inverted against the hero's white tile, which would vanish into the browser chrome.
    expect(svg).toContain(`fill="${ORG.primary_color}"`);
    expect(svg).toContain(`fill="${ORG.primary_foreground}"`);
  });

  it('escapes a display name that would otherwise break the monogram markup', () => {
    applyBranding({ ...ORG, logo_url: null, display_name: '<script' });

    const href = document.querySelector('link[rel="icon"]')!.getAttribute('href')!;

    expect(decodeURIComponent(href)).not.toContain('<script');
  });
});

describe('hasOrgProfile', () => {
  it('is false when the org has published nothing, so no empty panel is offered', () => {
    expect(hasOrgProfile(EMPTY_ABOUT)).toBe(false);
    expect(hasOrgProfile({ ...EMPTY_ABOUT, hours: 'Mon-Fri' })).toBe(true);
  });
});

describe('fetchBranding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the branding from the endpoint envelope', async () => {
    mockedAxios.get.mockResolvedValue({ data: { data: ORG } });

    await expect(fetchBranding()).resolves.toEqual({ branding: ORG, status: 'ok' });
    expect(mockedAxios.get).toHaveBeenCalledWith(WEB_CHANNEL_BRANDING);
  });

  // Components read branding synchronously and would crash on `about.address` if the key were
  // missing, so a payload that predates a field still leaves every key present.
  it('fills in anything the payload left out', async () => {
    mockedAxios.get.mockResolvedValue({ data: { data: { display_name: 'Sparse NGO' } } });

    const { branding } = await fetchBranding();

    expect(branding?.display_name).toBe('Sparse NGO');
    expect(branding?.primary_color).toBe('#119656');
    expect(branding?.about).toEqual(EMPTY_ABOUT);
  });

  it('reports the channel as disabled on a 404, rather than throwing', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

    await expect(fetchBranding()).resolves.toEqual({ branding: null, status: 'disabled' });
  });

  it('separates an unreachable backend from a disabled channel', async () => {
    // Telling someone the channel is off when it is actually a network blip would be wrong, and
    // the two render differently — a banner versus an error page.
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(fetchBranding()).resolves.toEqual({ branding: null, status: 'unavailable' });
  });
});

describe('loadBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('applies and stores the org branding', async () => {
    mockedAxios.get.mockResolvedValue({ data: { data: ORG } });

    await loadBranding();

    expect(getBranding()).toEqual(ORG);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(ORG.primary_color);
  });

  // Deliberately does NOT fall back: a Glific-looking page under an NGO's own domain reads as
  // the wrong organisation rather than as a failure, so the caller renders an error page.
  it('reports unavailable and paints nothing when /branding fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(loadBranding()).resolves.toBe('unavailable');

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
    expect(isWebChannelEnabled()).toBe(true);
  });

  // A 404 is a settled state, not a transient one, so the app still renders — with a banner.
  it('records the channel as disabled after a 404 and still paints the default palette', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

    await expect(loadBranding()).resolves.toBe('disabled');

    expect(isWebChannelEnabled()).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#119656');
  });
});
