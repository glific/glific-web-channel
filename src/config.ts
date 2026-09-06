// Backend endpoints for the public web-channel end-user app.
//
// One build serves every organisation — theming is applied at runtime, not baked in — so the
// backend origin cannot be a build-time constant either. web.tap.glific.com and
// web.staging.glific.com are the same bundle and must reach different APIs.
//
// The rule, in order:
//
//   1. If VITE_GLIFIC_API_URL / VITE_WEB_SOCKET are set, use them. Explicit configuration always
//      wins.
//   2. Otherwise derive the backend from the hostname, swapping the leading `web` label for `api`:
//        web.staging.glific.com  ->  api.staging.glific.com
//   3. Otherwise fall back to same-origin relative paths.
//
// Step 3 exists for local dev, where the Vite proxy (vite.config.ts) forwards /api and
// /web_socket to the backend, so there is no cross-origin request to make.
//
// Vercel preview deployments are the case that needs step 1. A hostname like
// glific-web-channel-git-main-glific.vercel.app carries no organisation information, so nothing
// can be derived from it and the environment variables have to be set on the deployment.

const API_PATH = '/api';
const SOCKET_PATH = '/web_socket';

/**
 * The backend origin implied by a web-channel hostname, or null when the hostname does not
 * follow the `web.<...>` convention and therefore says nothing about which backend to use.
 *
 * Exported for tests: the constants below are resolved once at module load, so this is the only
 * part that can be exercised against more than one hostname.
 */
export const deriveBackendOrigin = (hostname: string, protocol: string): string | null => {
  const labels = hostname.split('.');

  // The first label must be exactly "web" — "webhooks.glific.com" is not a web-channel host.
  // At least three labels, so a bare "web.test" cannot resolve to a nonexistent "api.test".
  if (labels[0] !== 'web' || labels.length < 3) return null;

  return `${protocol}//${['api', ...labels.slice(1)].join('.')}`;
};

const derivedOrigin =
  typeof window === 'undefined'
    ? null
    : deriveBackendOrigin(window.location.hostname, window.location.protocol);

// https -> wss, http -> ws, so a local http deployment is not forced onto a TLS socket.
const derivedSocketOrigin = derivedOrigin?.replace(/^http/, 'ws') ?? null;

const API_BASE: string =
  import.meta.env.VITE_GLIFIC_API_URL || (derivedOrigin ? `${derivedOrigin}${API_PATH}` : API_PATH);

// The phoenix JS client accepts a path-only endpoint and derives ws(s)://host from
// window.location — which is correct only same-origin, so a derived backend needs the full URL.
export const WEB_SOCKET: string =
  import.meta.env.VITE_WEB_SOCKET ||
  (derivedSocketOrigin ? `${derivedSocketOrigin}${SOCKET_PATH}` : SOCKET_PATH);

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
