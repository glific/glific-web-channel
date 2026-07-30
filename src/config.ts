// Backend endpoints for the public web-channel end-user app.
//
// Dev: leave the VITE_* vars unset — the app uses same-origin relative paths
// (`/api`, `/web_socket`) which the Vite dev proxy (vite.config.ts) forwards to the
// Glific backend on localhost:4000. This avoids CORS and lets the phoenix Socket
// resolve "/web_socket" against the dev server.
//
// Prod: set VITE_GLIFIC_API_URL to the backend origin + "/api"
// (e.g. https://api.<org>.glific.com/api) and VITE_WEB_SOCKET to the ws(s) endpoint.
const API_BASE: string = import.meta.env.VITE_GLIFIC_API_URL || '/api';

// The phoenix JS client accepts a path-only endpoint and derives ws(s)://host from
// window.location, so the relative default proxies transparently in dev.
export const WEB_SOCKET: string = import.meta.env.VITE_WEB_SOCKET || '/web_socket';

// NGO/org display name used for branding on the login screen (mirrors staff Auth).
export const ORGANIZATION_NAME = `${API_BASE}/v1/session/name`;

// Public OTP auth endpoints (prototype: server does not actually send an SMS).
export const WEB_CHANNEL_REQUEST_OTP = `${API_BASE}/v1/web_channel/request-otp`;
export const WEB_CHANNEL_VERIFY_OTP = `${API_BASE}/v1/web_channel/verify-otp`;
