import axios from 'axios';

import { WEB_CHANNEL_RENEW_TOKEN, WEB_CHANNEL_REQUEST_OTP, WEB_CHANNEL_VERIFY_OTP } from '@/config';

// Dedicated storage key for the public web-channel end-user session.
const WEB_CHANNEL_SESSION_KEY = 'web_channel_session';

export interface WebChannelSession {
  token: string;
  contactId: number | string;
  name?: string;
}

// persist the web-channel session (token + contact identity) in localStorage
export const setWebChannelSession = ({ token, contactId, name }: WebChannelSession): void => {
  localStorage.setItem(WEB_CHANNEL_SESSION_KEY, JSON.stringify({ token, contactId, name }));
};

// read the full stored session (or null when absent)
export const getWebChannelSession = (): WebChannelSession | null => {
  const raw = localStorage.getItem(WEB_CHANNEL_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebChannelSession;
  } catch {
    return null;
  }
};

// convenience: just the token used to authenticate the phoenix socket
export const getWebChannelToken = (): string | null => getWebChannelSession()?.token ?? null;

// convenience: the stored contact identity ({ contactId, name })
export const getWebChannelContact = (): { contactId: number | string; name?: string } | null => {
  const session = getWebChannelSession();
  if (!session) return null;
  return { contactId: session.contactId, name: session.name };
};

// update just the stored name (used after an inline rename)
export const setWebChannelName = (name: string): void => {
  const session = getWebChannelSession();
  if (!session) return;
  setWebChannelSession({ ...session, name });
};

// clear the stored session (logout)
export const clearWebChannelSession = (): void => {
  localStorage.removeItem(WEB_CHANNEL_SESSION_KEY);
};

// request an OTP for the given phone; the code is delivered over WhatsApp.
// Always resolves 200 when the org is enabled, whether or not the number is a known
// contact and whether or not delivery succeeded — that neutrality is deliberate, it stops
// the endpoint being used to enumerate an NGO's beneficiaries.
export const requestOtp = (phone: string) => axios.post(WEB_CHANNEL_REQUEST_OTP, { phone });

// verify an OTP; resolves with { token, contact_id, name, phone } on success, rejects with 401 on failure
export const verifyOtp = (phone: string, otp: string) => axios.post(WEB_CHANNEL_VERIFY_OTP, { phone, otp });

// exchange a still-valid token for a fresh one. Resolves with the SAME body shape as verify-otp
// ({ token, contact_id, name, phone }), so a success can be handed straight to setWebChannelSession.
// Rejects 401 once the current token has expired — renewal is not re-authentication.
export const renewToken = (token: string) => axios.post(WEB_CHANNEL_RENEW_TOKEN, { token });

/**
 * The `exp` claim (seconds since epoch) carried in a JWT's payload, or null when there isn't one
 * we can read.
 *
 * This is for SCHEDULING ONLY — it does not verify anything. The payload is base64url, not
 * encrypted, so anyone can write whatever `exp` they like into a token; the server is the only
 * authority on whether a token is good. All this buys us is knowing when to ask for a new one,
 * and when not to bother sending the user to a screen that is about to fail.
 *
 * Anything malformed — no dot-separated payload, invalid base64, non-JSON, no numeric exp —
 * comes back null rather than throwing, so every caller has exactly one failure case to handle.
 */
export const decodeTokenExpiry = (token: string): number | null => {
  const payload = token?.split('.')[1];
  if (!payload) return null;

  try {
    // base64url -> base64, then restore the padding atob insists on
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    // decode as UTF-8: a name in a non-Latin script would otherwise garble and fail JSON.parse
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };

    return typeof claims?.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
};

// Is there a stored token that has not expired yet? A token whose exp we cannot read counts as
// invalid: we have no way to schedule a renewal for it, so treating it as live would strand the
// user on a screen whose socket join fails.
export const isSessionValid = (): boolean => {
  const token = getWebChannelToken();
  if (!token) return false;

  const expiry = decodeTokenExpiry(token);
  return expiry !== null && expiry * 1000 > Date.now();
};

// Shape of the error body both web-channel auth endpoints return: { error: { status, message } }.
interface WebChannelErrorResponse {
  error?: { status?: number; message?: string };
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

// The HTTP status behind an axios rejection, or null when the request never got an answer (a
// network error, a blocked request). Callers that need to act on a status — the login screen
// treating a 429 as "already sent", the refresh hook telling a dead session from a flaky
// connection — go through this rather than re-walking the response shape themselves.
export const webChannelErrorStatus = (error: unknown): number | null =>
  (error as { response?: { status?: number } })?.response?.status ?? null;

// Turn an axios rejection from either auth endpoint into copy we can show a beneficiary,
// so the routes hold no status codes. 422 and 429 carry a server message that is already
// user-facing (the phone-format hint, and the "try again in N seconds" wait); the rest are
// deliberately vague, because 401 must read the same for a wrong, expired, never-issued or
// attempt-blocked code.
export const webChannelErrorMessage = (error: unknown): string => {
  const serverMessage = (error as { response?: { data?: WebChannelErrorResponse } })?.response?.data?.error?.message;

  switch (webChannelErrorStatus(error)) {
    case 422:
    case 429:
      return serverMessage || GENERIC_ERROR;
    case 404:
      return 'Messaging is not available for this organisation yet.';
    case 401:
      return 'That code is not right. Check it and try again.';
    default:
      return GENERIC_ERROR;
  }
};
