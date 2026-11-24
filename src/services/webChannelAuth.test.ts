import axios from 'axios';
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_CHANNEL_RENEW_TOKEN } from '@/config';
import { tokenExpiringIn } from '@/test/token';
import {
  clearWebChannelSession,
  decodeTokenExpiry,
  getWebChannelSession,
  isSessionValid,
  renewToken,
  restoreExpiredSession,
  setWebChannelSession,
  webChannelErrorStatus,
} from './webChannelAuth';

vi.mock('axios');
const mockedAxios = axios as any;

// Build a token whose payload is whatever we say, so the malformed cases are explicit.
const tokenWithPayload = (payload: string) => `header.${payload}.signature`;

describe('decodeTokenExpiry', () => {
  it('reads the exp claim out of a well-formed token', () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;

    expect(decodeTokenExpiry(tokenExpiringIn(3600))).toBe(expiry);
  });

  it('decodes a base64url payload, including a name in a non-Latin script', () => {
    // - and _ instead of + and /, no padding, and multi-byte UTF-8 in the claims: a token that a
    // naive atob + JSON.parse would either mangle or throw on.
    const token = tokenExpiringIn(60, { name: 'प्रिया' });

    expect(decodeTokenExpiry(token)).toBe(Math.floor(Date.now() / 1000) + 60);
  });

  it('returns null for a malformed token rather than throwing', () => {
    // shaped like a JWT, but the payload is not base64/JSON
    expect(decodeTokenExpiry(tokenWithPayload('!!!not-base64!!!'))).toBeNull();
    expect(decodeTokenExpiry(tokenWithPayload(btoa('not json at all')))).toBeNull();
  });

  it('returns null for a string that is not a JWT at all', () => {
    expect(decodeTokenExpiry('jwt-token')).toBeNull();
    expect(decodeTokenExpiry('')).toBeNull();
    expect(decodeTokenExpiry(undefined as unknown as string)).toBeNull();
  });

  it('returns null when there is no numeric exp to schedule against', () => {
    expect(decodeTokenExpiry(tokenWithPayload(btoa(JSON.stringify({ sub: 'contact:1' }))))).toBeNull();
    expect(decodeTokenExpiry(tokenWithPayload(btoa(JSON.stringify({ exp: 'soon' }))))).toBeNull();
  });
});

describe('isSessionValid', () => {
  beforeEach(() => localStorage.clear());

  it('is false when nothing is stored', () => {
    expect(isSessionValid()).toBe(false);
  });

  it('is true for a stored token whose expiry is still ahead', () => {
    setWebChannelSession({ token: tokenExpiringIn(3600), contactId: 1 });

    expect(isSessionValid()).toBe(true);
  });

  it('is false for a stored token that has already expired', () => {
    setWebChannelSession({ token: tokenExpiringIn(-60), contactId: 1 });

    expect(isSessionValid()).toBe(false);
  });

  it('is false for a token with no readable expiry — we cannot tell, so we do not trust it', () => {
    setWebChannelSession({ token: 'jwt-token', contactId: 1 });

    expect(isSessionValid()).toBe(false);
  });

  it('does not clear the session itself — that is the route guard call', () => {
    setWebChannelSession({ token: tokenExpiringIn(-60), contactId: 1 });

    isSessionValid();

    expect(localStorage.getItem('web_channel_session')).not.toBeNull();
    clearWebChannelSession();
  });
});

describe('webChannelErrorStatus', () => {
  it('returns the HTTP status behind an axios rejection', () => {
    expect(webChannelErrorStatus({ response: { status: 429, data: {} } })).toBe(429);
    expect(webChannelErrorStatus({ response: { status: 401 } })).toBe(401);
  });

  it('returns null when the request never got an answer', () => {
    // the difference the refresh hook turns on: no status means "could not ask", not "refused"
    expect(webChannelErrorStatus(new Error('Network Error'))).toBeNull();
    expect(webChannelErrorStatus(undefined)).toBeNull();
  });
});

describe('renewToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts the current token to the renew endpoint', () => {
    mockedAxios.post.mockResolvedValue({ data: { data: { token: 'fresh' } } });

    renewToken('current-token');

    expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_RENEW_TOKEN, { token: 'current-token' });
  });
});

describe('restoreExpiredSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('swaps an expired token for a renewed one, so a returning visitor stays signed in', async () => {
    const expired = tokenExpiringIn(-3600);
    const renewed = tokenExpiringIn(3600);
    setWebChannelSession({ token: expired, contactId: 7 });
    mockedAxios.post.mockResolvedValue({ data: { data: { token: renewed, contact_id: 7, name: 'Priya' } } });

    expect(await restoreExpiredSession()).toBe('done');

    expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_RENEW_TOKEN, { token: expired }, { timeout: 6_000 });
    expect(getWebChannelSession()).toEqual({ token: renewed, contactId: 7, name: 'Priya' });
    expect(isSessionValid()).toBe(true);
  });

  it('leaves the expired session in place when the server refuses it', async () => {
    const expired = tokenExpiringIn(-3600);
    setWebChannelSession({ token: expired, contactId: 7 });
    mockedAxios.post.mockRejectedValue({ response: { status: 401 } });

    expect(await restoreExpiredSession()).toBe('done');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(getWebChannelSession()?.token).toBe(expired);
    expect(isSessionValid()).toBe(false);
  });

  describe('when the server does not answer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it.each([
      ['a network error', {}],
      ['a 502', { response: { status: 502 } }],
    ])('retries once after %s, then reports it unreachable and keeps the session', async (_case, error) => {
      const expired = tokenExpiringIn(-3600);
      setWebChannelSession({ token: expired, contactId: 7 });
      mockedAxios.post.mockRejectedValue(error);

      const restoring = restoreExpiredSession();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(await restoring).toBe('unreachable');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(getWebChannelSession()?.token).toBe(expired);
    });

    it('renews on the retry when the first try fails', async () => {
      const renewed = tokenExpiringIn(3600);
      setWebChannelSession({ token: tokenExpiringIn(-3600), contactId: 7 });
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce({ data: { data: { token: renewed, contact_id: 7 } } });

      const restoring = restoreExpiredSession();
      await vi.advanceTimersByTimeAsync(1_000);

      expect(await restoring).toBe('done');
      expect(getWebChannelSession()?.token).toBe(renewed);
    });
  });

  it('asks nothing of the server for a live token, no token or an unreadable one', async () => {
    expect(await restoreExpiredSession()).toBe('done');

    setWebChannelSession({ token: tokenExpiringIn(3600), contactId: 7 });
    await restoreExpiredSession();

    setWebChannelSession({ token: 'not-a-jwt', contactId: 7 });
    await restoreExpiredSession();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
