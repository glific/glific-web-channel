// Backend endpoints for the public web-channel end-user app.
//
// One build serves every NGO, so nothing org-specific may be inlined at build time — Vite
// substitutes VITE_* into the bundle, and a baked-in host would silently pin this build to one
// organisation. The backend resolves the org from the request Host, so the API host is derived
// from where the page is being served instead.

/**
 * Map the page's hostname onto the backend serving that org.
 *
 *   web.<shortcode>.glific.com  ->  https://api.<shortcode>.glific.com/api
 *
 * The `api.` prefix matters: `<shortcode>.glific.com` serves the staff console, a static site
 * that answers any path with index.html and no CORS headers — so pointing here without it looks
 * like a CORS failure when the request is simply going to the wrong server. SubdomainPlug strips
 * `api.` when resolving the org, so both hosts resolve to the same organisation.
 *
 * Anything else — localhost, glific.test, a preview URL — falls back to a same-origin relative
 * path, which the Vite dev proxy forwards to the local backend.
 */
export const deriveApiBase = (hostname: string): string =>
  hostname.startsWith('web.') ? `https://api.${hostname.slice('web.'.length)}/api` : '/api';

// The env var stays as an escape hatch for previews pointed at a fixed backend. It must never
// hold an org-specific host in production: that is precisely what breaks the one-build model.
const API_BASE: string = import.meta.env.VITE_GLIFIC_API_URL || deriveApiBase(window.location.hostname);

// The phoenix JS client accepts a path-only endpoint and derives ws(s)://host from
// window.location, so the relative default proxies transparently in dev.
export const WEB_SOCKET: string = import.meta.env.VITE_WEB_SOCKET || '/web_socket';

// Per-org branding: theme, logo and display name. Public — it renders before login.
export const WEB_CHANNEL_BRANDING = `${API_BASE}/v1/web_channel/branding`;

// Public OTP auth endpoints. The one-time code is delivered over WhatsApp, not SMS.
export const WEB_CHANNEL_REQUEST_OTP = `${API_BASE}/v1/web_channel/request-otp`;
export const WEB_CHANNEL_VERIFY_OTP = `${API_BASE}/v1/web_channel/verify-otp`;

// How long the OTP resend button stays disabled, in seconds. Source of truth is the
// backend's per-IP throttle — `config :glific, :web_channel_otp_rate_limit, scale_ms: 30_000,
// count: 1` in the Glific repo's config/config.exs. Keep the two in step: a shorter countdown
// here just walks the user into a 429.
export const WEB_CHANNEL_OTP_RESEND_SECONDS = 30;
