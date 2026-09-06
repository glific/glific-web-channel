import axios from 'axios';

import { WEB_CHANNEL_REQUEST_OTP, WEB_CHANNEL_VERIFY_OTP } from '@/config';

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

// Shape of the error body both web-channel auth endpoints return: { error: { status, message } }.
interface WebChannelErrorResponse {
  error?: { status?: number; message?: string };
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

// Turn an axios rejection from either auth endpoint into copy we can show a beneficiary,
// so the routes hold no status codes. 422 and 429 carry a server message that is already
// user-facing (the phone-format hint, and the "try again in N seconds" wait); the rest are
// deliberately vague, because 401 must read the same for a wrong, expired, never-issued or
// attempt-blocked code.
export const webChannelErrorMessage = (error: unknown): string => {
  const response = (error as { response?: { status?: number; data?: WebChannelErrorResponse } })?.response;
  const serverMessage = response?.data?.error?.message;

  switch (response?.status) {
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
