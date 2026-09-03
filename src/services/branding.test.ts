import axios from 'axios';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_CHANNEL_BRANDING } from '@/config';
import { THEMES } from '@/services/themes';
import { applyBranding, fetchBranding, getBranding, isWebChannelEnabled, loadBranding } from './branding';

vi.mock('axios');
const mockedAxios = axios as any;

describe('applyBranding', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.title = '';
  });

  it('overrides the raw --primary vars, not the @theme inline --color-* aliases', () => {
    applyBranding({
      theme: 'violet',
      logo_url: null,
      display_name: 'Example NGO',
    });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--primary')).toBe(THEMES.violet.primary);
    expect(root.getPropertyValue('--primary-foreground')).toBe(THEMES.violet.primaryForeground);
    // These are compiled through @theme inline, so setting them at runtime does nothing.
    expect(root.getPropertyValue('--color-primary')).toBe('');
  });

  it('applies the light-accent theme with dark button text', () => {
    applyBranding({
      theme: 'amber',
      logo_url: null,
      display_name: 'Example NGO',
    });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--primary')).toBe(THEMES.amber.primary);
    expect(root.getPropertyValue('--primary-foreground')).toBe('oklch(0.145 0 0)');
  });

  it('falls back to the default palette for an unknown theme name', () => {
    applyBranding({
      theme: 'chartreuse',
      logo_url: null,
      display_name: 'Example NGO',
    });

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(THEMES.zinc.primary);
  });

  it('sets the document title from the display name', () => {
    applyBranding({
      theme: 'zinc',
      logo_url: null,
      display_name: 'Example NGO',
    });

    expect(document.title).toBe('Example NGO — Chat');
  });
});

describe('fetchBranding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the theme from the endpoint envelope', async () => {
    const theme = {
      theme: 'violet',
      logo_url: null,
      display_name: 'Example NGO',
    };
    mockedAxios.get.mockResolvedValue({ data: { data: theme } });

    await expect(fetchBranding()).resolves.toEqual({
      branding: theme,
      enabled: true,
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(WEB_CHANNEL_BRANDING);
  });

  it('reports the channel as disabled on a 404, rather than throwing', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

    await expect(fetchBranding()).resolves.toEqual({
      branding: null,
      enabled: false,
    });
  });

  it('does not claim the channel is disabled when the backend is merely unreachable', async () => {
    // Telling someone the channel is off when it is actually a network blip would be wrong.
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(fetchBranding()).resolves.toEqual({
      branding: null,
      enabled: true,
    });
  });
});

describe('loadBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('applies and stores the org theme', async () => {
    const theme = {
      theme: 'amber',
      logo_url: 'https://cdn.example.org/l.svg',
      display_name: 'Example NGO',
    };
    mockedAxios.get.mockResolvedValue({ data: { data: theme } });

    await loadBranding();

    expect(getBranding()).toEqual(theme);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(THEMES.amber.primary);
  });

  it('falls back to the default theme and still resolves when /branding fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(loadBranding()).resolves.toEqual({
      theme: 'zinc',
      logo_url: null,
      display_name: 'Glific',
    });
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(THEMES.zinc.primary);
    expect(isWebChannelEnabled()).toBe(true);
  });

  it('records the channel as disabled after a 404', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

    await loadBranding();

    expect(isWebChannelEnabled()).toBe(false);
  });
});
