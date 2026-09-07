import axios from 'axios';

import { WEB_CHANNEL_BRANDING } from '@/config';
import { DEFAULT_THEME, paletteFor } from '@/services/themes';

/** Branding = theme (the palette) + logo + display name. */
export interface Branding {
  theme: string;
  logo_url: string | null;
  display_name: string;
}

// Used only when the org is reachable but has set nothing, and for the disabled case where the
// banner carries the explanation. A branding fetch that *fails* does not fall back — see
// BrandingStatus below.
const FALLBACK_BRANDING: Branding = { theme: DEFAULT_THEME, logo_url: null, display_name: 'Glific' };

/**
 * - `ok`          branding resolved; render the app
 * - `disabled`    404 — this org has not enabled the web channel; render the app with a banner
 * - `unavailable` the request failed; render an error page rather than a plausible-looking
 *                 default, which under an NGO's own domain would read as the wrong organisation
 */
export type BrandingStatus = 'ok' | 'disabled' | 'unavailable';

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
  status: BrandingStatus;
}

/**
 * Fetch this org's branding. The org is resolved server-side from the request host, so there
 * is nothing to send — which is what lets one build serve every NGO.
 */
export const fetchBranding = async (): Promise<BrandingResult> => {
  try {
    const { data } = await axios.get(WEB_CHANNEL_BRANDING);
    return { branding: (data?.data as Branding) ?? null, status: 'ok' };
  } catch (error: any) {
    return { branding: null, status: error?.response?.status === 404 ? 'disabled' : 'unavailable' };
  }
};

/**
 * Resolve and apply the branding. Awaited before the first render so there is no flash of the
 * default palette.
 *
 * Returns the status so the caller can decide what to render: a failed fetch must not quietly
 * become the default palette, because a Glific-looking page served under an NGO's own domain
 * reads as the wrong organisation rather than as an error.
 */
export const loadBranding = async (): Promise<BrandingStatus> => {
  const result = await fetchBranding();

  webChannelEnabled = result.status !== 'disabled';

  if (result.status === 'unavailable') return result.status;

  branding = result.branding ?? FALLBACK_BRANDING;
  applyBranding(branding);

  return result.status;
};
