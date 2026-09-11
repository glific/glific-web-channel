import axios from 'axios';

import { WEB_CHANNEL_BRANDING } from '@/config';

/** The read-only business profile, the web equivalent of a WhatsApp business profile. */
export interface OrgAbout {
  description: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  hours: string | null;
}

/** Branding = the org's two colours + logo + name + the business profile. */
export interface Branding {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  /** Computed server-side to stay legible on `primary_color`; never chosen by an admin. */
  primary_foreground: string;
  /** Decorative only — chip borders, selected rings, trust accents. Never behind text. */
  secondary_color: string;
  about: OrgAbout;
}

const EMPTY_ABOUT: OrgAbout = { description: null, address: null, website: null, email: null, hours: null };

// Glific's own green and amber. Used only when the org is reachable but has set nothing, and for
// the disabled case where the banner carries the explanation. A branding fetch that *fails* does
// not fall back — see BrandingStatus below.
const FALLBACK_BRANDING: Branding = {
  display_name: 'Glific',
  logo_url: null,
  primary_color: '#119656',
  primary_foreground: '#fafafa',
  secondary_color: '#eab308',
  about: EMPTY_ABOUT,
};

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

/** Whether there is anything to show on the About screen at all. */
export const hasOrgProfile = (about: OrgAbout): boolean => Object.values(about).some(Boolean);

/**
 * Write the org's colours onto :root and the document title.
 *
 * These override the *raw* custom properties. The `--color-*` aliases are compiled through
 * Tailwind's `@theme inline`, so setting those at runtime would have no effect.
 *
 * `--secondary` is left alone: in shadcn it is a surface colour with its own foreground, and
 * repainting it with a decorative accent would put brand-coloured text on brand-coloured
 * buttons. The decorative colour gets a var of its own instead.
 */
export const applyBranding = (next: Branding): void => {
  const root = document.documentElement;

  root.style.setProperty('--primary', next.primary_color);
  root.style.setProperty('--primary-foreground', next.primary_foreground);
  root.style.setProperty('--brand-accent', next.secondary_color);
  root.style.setProperty('--ring', next.primary_color);

  document.title = `${next.display_name} — Chat`;
};

export interface BrandingResult {
  branding: Branding | null;
  status: BrandingStatus;
}

// A payload that predates a field, or an org that has saved nothing, must still leave every key
// present — components read branding synchronously and would otherwise crash on `about.address`.
const normalize = (data: Partial<Branding> | null): Branding => ({
  ...FALLBACK_BRANDING,
  ...(data ?? {}),
  about: { ...EMPTY_ABOUT, ...(data?.about ?? {}) },
});

/**
 * Fetch this org's branding. The org is resolved server-side from the request host, so there
 * is nothing to send — which is what lets one build serve every NGO.
 */
export const fetchBranding = async (): Promise<BrandingResult> => {
  try {
    const { data } = await axios.get(WEB_CHANNEL_BRANDING);
    return { branding: data?.data ? normalize(data.data) : null, status: 'ok' };
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
