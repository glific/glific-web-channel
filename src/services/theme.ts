import axios from 'axios';

import { WEB_CHANNEL_THEME } from '@/config';
import { DEFAULT_THEME, paletteFor } from '@/services/themes';

export interface Theme {
  theme: string;
  logo_url: string | null;
  display_name: string;
}

// What an org that has set nothing — or a backend that is unreachable — renders as.
const FALLBACK_THEME: Theme = { theme: DEFAULT_THEME, logo_url: null, display_name: 'Glific' };

// Resolved once during bootstrap, before the first render, so components read it synchronously
// and no loading state is needed anywhere.
let theme: Theme = FALLBACK_THEME;

export const getTheme = (): Theme => theme;

/**
 * Write the chosen theme onto :root and the document title.
 *
 * These override the *raw* custom properties. The `--color-*` aliases are compiled through
 * Tailwind's `@theme inline`, so setting those at runtime would have no effect.
 */
export const applyTheme = (next: Theme): void => {
  const palette = paletteFor(next.theme);
  const root = document.documentElement;

  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--primary-foreground', palette.primaryForeground);

  document.title = `${next.display_name} — Chat`;
};

/**
 * Fetch this org's branding. The org is resolved server-side from the request host, so there
 * is nothing to send — which is what lets one build serve every NGO.
 */
export const fetchTheme = async (): Promise<Theme | null> => {
  try {
    const { data } = await axios.get(WEB_CHANNEL_THEME);
    return (data?.data as Theme) ?? null;
  } catch {
    return null;
  }
};

/**
 * Resolve and apply the theme. Awaited before the first render so there is no flash of the
 * default palette; a failure leaves the default in place and still renders.
 */
export const loadTheme = async (): Promise<Theme> => {
  theme = (await fetchTheme()) ?? FALLBACK_THEME;
  applyTheme(theme);
  return theme;
};
