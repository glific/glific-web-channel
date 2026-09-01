import axios from 'axios';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_CHANNEL_THEME } from '@/config';
import { THEMES } from '@/services/themes';
import { applyTheme, fetchTheme, getTheme, loadTheme } from './theme';

vi.mock('axios');
const mockedAxios = axios as any;

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.title = '';
  });

  it('overrides the raw --primary vars, not the @theme inline --color-* aliases', () => {
    applyTheme({ theme: 'violet', logo_url: null, display_name: 'Reap Benefit' });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--primary')).toBe(THEMES.violet.primary);
    expect(root.getPropertyValue('--primary-foreground')).toBe(THEMES.violet.primaryForeground);
    // These are compiled through @theme inline, so setting them at runtime does nothing.
    expect(root.getPropertyValue('--color-primary')).toBe('');
  });

  it('applies the light-accent theme with dark button text', () => {
    applyTheme({ theme: 'amber', logo_url: null, display_name: 'Sunshine Trust' });

    const root = document.documentElement.style;
    expect(root.getPropertyValue('--primary')).toBe(THEMES.amber.primary);
    expect(root.getPropertyValue('--primary-foreground')).toBe('oklch(0.145 0 0)');
  });

  it('falls back to the default palette for an unknown theme name', () => {
    applyTheme({ theme: 'chartreuse', logo_url: null, display_name: 'Reap Benefit' });

    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(THEMES.zinc.primary);
  });

  it('sets the document title from the display name', () => {
    applyTheme({ theme: 'zinc', logo_url: null, display_name: 'Reap Benefit' });

    expect(document.title).toBe('Reap Benefit — Chat');
  });
});

describe('fetchTheme', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the theme from the endpoint envelope', async () => {
    const theme = { theme: 'violet', logo_url: null, display_name: 'Reap Benefit' };
    mockedAxios.get.mockResolvedValue({ data: { data: theme } });

    await expect(fetchTheme()).resolves.toEqual(theme);
    expect(mockedAxios.get).toHaveBeenCalledWith(WEB_CHANNEL_THEME);
  });

  it('resolves to null rather than throwing when the org has the feature flag off', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

    await expect(fetchTheme()).resolves.toBeNull();
  });

  it('resolves to null when the backend is unreachable', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(fetchTheme()).resolves.toBeNull();
  });
});

describe('loadTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('applies and stores the org theme', async () => {
    const theme = { theme: 'amber', logo_url: 'https://cdn.example.org/l.svg', display_name: 'Yellow NGO' };
    mockedAxios.get.mockResolvedValue({ data: { data: theme } });

    await loadTheme();

    expect(getTheme()).toEqual(theme);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(THEMES.amber.primary);
  });

  it('falls back to the default theme and still resolves when /theme fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(loadTheme()).resolves.toEqual({
      theme: 'zinc',
      logo_url: null,
      display_name: 'Glific',
    });
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(THEMES.zinc.primary);
  });
});
