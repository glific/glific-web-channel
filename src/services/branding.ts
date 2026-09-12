import axios from 'axios';

import { WEB_CHANNEL_BRANDING } from '@/config';
import { initialsFor } from '@/lib/initials';

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
  /** False when the org has the web channel switched off; the rest is then defaults. */
  enabled: boolean;
  display_name: string;
  /** The org's own WhatsApp number, sent only when the channel is off — where else to go. */
  whatsapp_number: string | null;
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
  enabled: true,
  display_name: 'Glific',
  whatsapp_number: null,
  logo_url: null,
  primary_color: '#119656',
  primary_foreground: '#fafafa',
  secondary_color: '#eab308',
  about: EMPTY_ABOUT,
};

/**
 * - `ok`          branding resolved; render the app
 * - `disabled`    the org has the web channel switched off; render the disabled page, which the
 *                 200 carries the org's name and WhatsApp number for
 * - `unavailable` the request failed; render an error page rather than a plausible-looking
 *                 default, which under an NGO's own domain would read as the wrong organisation
 */
export type BrandingStatus = 'ok' | 'disabled' | 'unavailable';

// Resolved once during bootstrap, before the first render, so components read it synchronously
// and no loading state is needed anywhere.
let branding: Branding = FALLBACK_BRANDING;

// Whether the org has the channel switched on — worth telling the visitor, and distinct from
// the backend simply being unreachable.
let webChannelEnabled = true;

export const getBranding = (): Branding => branding;

export const isWebChannelEnabled = (): boolean => webChannelEnabled;

/**
 * Record that the organisation has switched the channel off mid-session.
 *
 * The server tells an open room over the socket rather than by answering a request, so there is
 * no 404 to learn it from — but the app has to reach the same state a reload would.
 */
export const markWebChannelDisabled = async (): Promise<void> => {
  webChannelEnabled = false;

  // Re-asked rather than assumed: the disabled page needs the org's WhatsApp number, and the
  // socket push that got us here carries nothing.
  const { branding: refreshed } = await fetchBranding();
  if (refreshed && !refreshed.enabled) {
    branding = refreshed;
    applyBranding(branding);
  }
};

/** Whether there is anything to show on the About screen at all. */
export const hasOrgProfile = (about: OrgAbout): boolean => Object.values(about).some(Boolean);

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The org's monogram as an SVG data URI, for an org that has uploaded no logo.
 *
 * Inverted against the mark the Logo component draws — the org's colour behind its foreground,
 * rather than the white tile the hero's own background makes legible. A white tile is what the
 * logo looks like, but in a browser tab it has no surround and disappears into the chrome.
 */
const monogramFavicon = ({ display_name: name, primary_color, primary_foreground }: Branding): string => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="${escapeXml(primary_color)}"/>` +
    `<text x="32" y="34" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="system-ui, sans-serif" font-size="30" font-weight="600" ` +
    `fill="${escapeXml(primary_foreground)}">${escapeXml(initialsFor(name))}</text>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/**
 * Point the tab icon at the org's own logo.
 *
 * The widget is a standalone site on the organisation's own subdomain, so a Glific mark in the
 * tab is a branding leak. `type` is dropped rather than updated because a logo can be a PNG, a
 * JPEG or an SVG and the browser sniffs it correctly either way.
 *
 * A switched-off channel gets no icon at all rather than a monogram: there is no chat to mark,
 * and an org that never configured the channel has no logo to mark it with.
 */
const applyFavicon = (next: Branding): void => {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (!next.enabled) {
    existing?.remove();
    return;
  }

  const link = existing ?? document.createElement('link');

  link.rel = 'icon';
  link.removeAttribute('type');
  link.href = next.logo_url ?? monogramFavicon(next);

  if (!link.parentNode) document.head.appendChild(link);
};

/**
 * Write the org's colours onto :root, and its name and mark onto the tab.
 *
 * The colours override the *raw* custom properties. The `--color-*` aliases are compiled through
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

  document.title = next.enabled ? `${next.display_name} — Chat` : next.display_name;
  applyFavicon(next);
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
    if (!data?.data) return { branding: null, status: 'unavailable' };

    const branding = normalize(data.data);

    return { branding, status: branding.enabled ? 'ok' : 'disabled' };
  } catch {
    // The endpoint answers 200 either way now, so a failure says nothing about whether the org
    // has the channel on — only that we could not ask.
    return { branding: null, status: 'unavailable' };
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
