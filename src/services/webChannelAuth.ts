import axios from 'axios';

import { WEB_CHANNEL_RENEW_TOKEN, WEB_CHANNEL_REQUEST_OTP, WEB_CHANNEL_VERIFY_OTP } from '@/config';

const WEB_CHANNEL_SESSION_KEY = 'web_channel_session';

export interface WebChannelSession {
  token: string;
  contactId: number | string;
  name?: string;
  phone?: string;
}

export const setWebChannelSession = ({ token, contactId, name, phone }: WebChannelSession): void => {
  localStorage.setItem(WEB_CHANNEL_SESSION_KEY, JSON.stringify({ token, contactId, name, phone }));
};

export const getWebChannelSession = (): WebChannelSession | null => {
  const raw = localStorage.getItem(WEB_CHANNEL_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebChannelSession;
  } catch {
    return null;
  }
};

export const getWebChannelToken = (): string | null => getWebChannelSession()?.token ?? null;

export const getWebChannelContact = (): { contactId: number | string; name?: string; phone?: string } | null => {
  const session = getWebChannelSession();
  if (!session) return null;
  return { contactId: session.contactId, name: session.name, phone: session.phone };
};

export const clearWebChannelSession = (): void => {
  localStorage.removeItem(WEB_CHANNEL_SESSION_KEY);
};

// Always 200 when the org is enabled, whether or not the number is known and whether or not
// delivery succeeded — the neutrality stops the endpoint enumerating an NGO's beneficiaries.
export const requestOtp = (phone: string) => axios.post(WEB_CHANNEL_REQUEST_OTP, { phone });

export const verifyOtp = (phone: string, otp: string) => axios.post(WEB_CHANNEL_VERIFY_OTP, { phone, otp });

// Same body shape as verify-otp, so a success goes straight to setWebChannelSession. 401 once the
// current token has expired: this renews, it does not re-authenticate.
export const renewToken = (token: string) => axios.post(WEB_CHANNEL_RENEW_TOKEN, { token });

/**
 * The `exp` claim, for SCHEDULING ONLY — this verifies nothing. The payload is base64url, not
 * encrypted, so the server remains the only authority on whether a token is good. Returns null
 * rather than throwing on anything malformed, so callers have one failure case.
 */
export const decodeTokenExpiry = (token: string): number | null => {
  const payload = token?.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    // UTF-8, or a name in a non-Latin script garbles and fails JSON.parse
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };

    return typeof claims?.exp === 'number' ? claims.exp : null;
  } catch {
    return null;
  }
};

// An unreadable exp counts as invalid: nothing can schedule its renewal, so treating it as live
// would strand the user on a screen whose socket join fails.
export const isSessionValid = (): boolean => {
  const token = getWebChannelToken();
  if (!token) return false;

  const expiry = decodeTokenExpiry(token);
  return expiry !== null && expiry * 1000 > Date.now();
};

interface WebChannelErrorResponse {
  error?: { status?: number; message?: string };
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

// null when the request never got an answer, which callers use to tell a refused session from a
// flaky connection.
export const webChannelErrorStatus = (error: unknown): number | null =>
  (error as { response?: { status?: number } })?.response?.status ?? null;

// 422 and 429 pass the server's message through because it is already user-facing. The rest stay
// vague: 401 must read identically for a wrong, expired, never-issued or attempt-blocked code.
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
