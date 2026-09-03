import axios from 'axios';

import { WEB_CHANNEL_BRANDING } from '@/config';
import { DEFAULT_THEME, paletteFor } from '@/services/themes';

/** Branding = theme (the palette) + logo + display name. */
export interface Branding {
  theme: string;
  logo_url: string | null;
  display_name: string;
}

// What an org that has set nothing — or a backend that is unreachable — renders as.
const FALLBACK_BRANDING: Branding = { theme: DEFAULT_THEME, logo_url: null, display_name: 'Glific' };

// Resolved once during bootstrap, before the first render, so components read it synchronously
// and no loading state is needed anywhere.
let branding: Branding = FALLBACK_BRANDING;

// A 404 means this org has not switched the web channel on — worth telling the visitor, and
// distinct from the backend simply being unreachable.
let webChannelEnabled = true;

export const getBranding = (): Branding => branding;

export const isWebChannelEnabled = (): boolean => webChannelEnabled;

/**
 * Write the chosen theme onto :root and the document title.
 *
 * These override the *raw* custom properties. The `--color-*` aliases are compiled through
 * Tailwind's `@theme inline`, so setting those at runtime would have no effect.
 */
export const applyBranding = (next: Branding): void => {
  const palette = paletteFor(next.theme);
  const root = document.documentElement;

  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--primary-foreground', palette.primaryForeground);

  document.title = `${next.display_name} — Chat`;
};

export interface BrandingResult {
  branding: Branding | null;
  /** false only for a definitive 404 — a network failure leaves this true. */
  enabled: boolean;
}

/**
 * Fetch this org's branding. The org is resolved server-side from the request host, so there
 * is nothing to send — which is what lets one build serve every NGO.
 */
export const fetchBranding = async (): Promise<BrandingResult> => {
  try {
    const { data } = await axios.get(WEB_CHANNEL_BRANDING);
    return { branding: (data?.data as Branding) ?? null, enabled: true };
  } catch (error: any) {
    return { branding: null, enabled: error?.response?.status !== 404 };
  }
};

/**
 * Resolve and apply the branding. Awaited before the first render so there is no flash of the
 * default palette; a failure leaves the default in place and still renders.
 */
export const loadBranding = async (): Promise<Branding> => {
  const result = await fetchBranding();

  webChannelEnabled = result.enabled;
  branding = result.branding ?? FALLBACK_BRANDING;
  applyBranding(branding);

  return branding;
};
