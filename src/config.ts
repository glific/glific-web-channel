// One build serves every organisation, so the backend origin cannot be a build-time constant:
// web.tap.glific.com and web.staging.glific.com are the same bundle and must reach different APIs.
// Vercel previews carry no organisation in their hostname and so must set the env vars explicitly;
// local dev falls through to relative paths that the Vite proxy forwards.

const API_PATH = '/api';
const SOCKET_PATH = '/web_socket';

/**
 * The backend origin implied by a web-channel hostname, or null when the hostname says nothing
 * about which backend to use. Exported so tests can exercise more than one hostname; the constants
 * below resolve once at module load.
 */
export const deriveBackendOrigin = (hostname: string, protocol: string): string | null => {
  const labels = hostname.split('.');

  // Exactly "web", or webhooks.glific.com would resolve to api.glific.com. Three labels minimum,
  // or a bare "web.test" would resolve to a nonexistent "api.test".
  if (labels[0] !== 'web' || labels.length < 3) return null;

  return `${protocol}//${['api', ...labels.slice(1)].join('.')}`;
};

const derivedOrigin =
  typeof window === 'undefined'
    ? null
    : deriveBackendOrigin(window.location.hostname, window.location.protocol);

const derivedSocketOrigin = derivedOrigin?.replace(/^http/, 'ws') ?? null;

const API_BASE: string =
  import.meta.env.VITE_GLIFIC_API_URL || (derivedOrigin ? `${derivedOrigin}${API_PATH}` : API_PATH);

// A path-only endpoint makes the phoenix client derive ws(s)://host from window.location, which is
// only correct same-origin — so a derived backend needs the full URL.
export const WEB_SOCKET: string =
  import.meta.env.VITE_WEB_SOCKET ||
  (derivedSocketOrigin ? `${derivedSocketOrigin}${SOCKET_PATH}` : SOCKET_PATH);

export const WEB_CHANNEL_BRANDING = `${API_BASE}/v1/web_channel/branding`;

export const WEB_CHANNEL_REQUEST_OTP = `${API_BASE}/v1/web_channel/request-otp`;
export const WEB_CHANNEL_VERIFY_OTP = `${API_BASE}/v1/web_channel/verify-otp`;
export const WEB_CHANNEL_RENEW_TOKEN = `${API_BASE}/v1/web_channel/renew-token`;
export const WEB_CHANNEL_UPLOAD = `${API_BASE}/v1/web_channel/upload-url`;

// Must not undercut the backend's per-IP throttle (`:web_channel_otp_rate_limit`, 1 per 30s), or
// the countdown just walks the user into a 429.
export const WEB_CHANNEL_OTP_RESEND_SECONDS = 30;

// Ten minutes of a one-hour token: wide enough that a tab asleep through most of the window still
// has time to renew on wake, and that a transient failure gets ~20 retries.
export const WEB_CHANNEL_TOKEN_REFRESH_THRESHOLD_SECONDS = 10 * 60;
export const WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS = 30_000;

// The channel only learns of a renewal from this push, and the server warns once per token, so a
// dropped push has nothing else behind it. Three tries 5s apart stay well inside the backend's
// 600s warning window and its 60s grace after expiry.
export const WEB_CHANNEL_RENEW_PUSH_ATTEMPTS = 3;
export const WEB_CHANNEL_RENEW_PUSH_RETRY_MS = 5_000;
