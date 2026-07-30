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

// request an OTP for the given phone (prototype: server does not actually send an SMS)
export const requestOtp = (phone: string) => axios.post(WEB_CHANNEL_REQUEST_OTP, { phone });

// verify an OTP; resolves with { token, contact_id, name, phone } on success, rejects with 401 on failure
export const verifyOtp = (phone: string, otp: string) => axios.post(WEB_CHANNEL_VERIFY_OTP, { phone, otp });
