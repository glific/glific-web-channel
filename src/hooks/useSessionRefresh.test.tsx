import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  WEB_CHANNEL_RENEW_PUSH_ATTEMPTS,
  WEB_CHANNEL_RENEW_PUSH_RETRY_MS,
  WEB_CHANNEL_RENEW_TOKEN,
  WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS,
} from '@/config';
import { getWebChannelSession, setWebChannelSession } from '@/services/webChannelAuth';
import { tokenExpiringIn } from '@/test/token';
import { useSessionRefresh } from './useSessionRefresh';

vi.mock('axios');
const mockedAxios = axios as any;

// The socket is stood in for so the hook's two halves can be driven independently: the channel it
// renews on, and the server pushes it reacts to.
const { channelState, pushRenewToken, sessionListeners } = vi.hoisted(() => ({
  channelState: { current: { id: 'live-channel' } as unknown as object | null },
  pushRenewToken: vi.fn(() => Promise.resolve()),
  sessionListeners: new Set<(event: string) => void>(),
}));

vi.mock('@/services/webChannelSocket', () => ({
  getActiveChannel: () => channelState.current,
  pushRenewToken,
  onWebChannelSessionEvent: (listener: (event: string) => void) => {
    sessionListeners.add(listener);
    return () => sessionListeners.delete(listener);
  },
}));

const serverPushes = (event: string) => act(() => sessionListeners.forEach((listener) => listener(event)));

const FIVE_MINUTES = 5 * 60;
const FORTY_MINUTES = 40 * 60;

// The hook is mounted the way App mounts it: inside the authenticated route, so a failed
// renewal can navigate the user out to /login.
const Authenticated = () => {
  useSessionRefresh();
  return <div>CHAT SCREEN</div>;
};

const renderWithSession = (token: string) => {
  setWebChannelSession({ token, contactId: 7, name: 'Priya' });

  return render(
    <MemoryRouter initialEntries={['/chat']}>
      <Routes>
        <Route path="/chat" element={<Authenticated />} />
        <Route path="/login" element={<div>LOGIN SCREEN</div>} />
      </Routes>
    </MemoryRouter>
  );
};

const renewSucceedsWith = (token: string) =>
  mockedAxios.post.mockResolvedValue({
    data: { data: { token, contact_id: 7, name: 'Priya', phone: '919820198765' } },
  });

describe('useSessionRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionListeners.clear();
    channelState.current = { id: 'live-channel' };
    pushRenewToken.mockResolvedValue(undefined);
    renewSucceedsWith(tokenExpiringIn(3600));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renews a token that is inside the refresh window and stores the fresh one', async () => {
    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);
    const expiring = tokenExpiringIn(FIVE_MINUTES);

    renderWithSession(expiring);

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_RENEW_TOKEN, { token: expiring })
    );
    // the fresh token replaces the old one; the contact identity survives
    await waitFor(() => expect(getWebChannelSession()?.token).toBe(fresh));
    expect(getWebChannelSession()).toMatchObject({ contactId: 7, name: 'Priya' });
  });

  it('leaves a token with plenty of life alone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithSession(tokenExpiringIn(FORTY_MINUTES));

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS * 3);
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('renews on the interval once the token drifts into the window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithSession(tokenExpiringIn(FORTY_MINUTES));
    expect(mockedAxios.post).not.toHaveBeenCalled();

    // the same session, now close to expiry — as it would be after the user has been chatting
    const expiring = tokenExpiringIn(FIVE_MINUTES);
    setWebChannelSession({ token: expiring, contactId: 7, name: 'Priya' });

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS);
    });

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(WEB_CHANNEL_RENEW_TOKEN, { token: expiring })
    );
  });

  it('checks immediately when the page regains focus, without waiting for the interval', async () => {
    renderWithSession(tokenExpiringIn(FORTY_MINUTES));
    expect(mockedAxios.post).not.toHaveBeenCalled();

    // A backgrounded tab's timers are throttled, so this is the path that matters for a user
    // coming back to a tab they left open: no timer is advanced here at all.
    setWebChannelSession({ token: tokenExpiringIn(FIVE_MINUTES), contactId: 7, name: 'Priya' });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
  });

  it('checks when the document becomes visible again', async () => {
    renderWithSession(tokenExpiringIn(FORTY_MINUTES));

    setWebChannelSession({ token: tokenExpiringIn(FIVE_MINUTES), contactId: 7, name: 'Priya' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
  });

  it('sends one request when both triggers fire in the same tick', async () => {
    // a renewal that stays in flight, so the second trigger lands while the first is unfinished
    mockedAxios.post.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));

    // a returning tab: focus, visibilitychange and the interval all firing together
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS);
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('clears the session and sends the user to login when the renewal is refused (401)', async () => {
    mockedAxios.post.mockRejectedValue({
      response: { status: 401, data: { error: { status: 401, message: 'Invalid or expired session' } } },
    });

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));

    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
    expect(getWebChannelSession()).toBeNull();
  });

  it('keeps the session on a network error and retries on the next tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const expiring = tokenExpiringIn(FIVE_MINUTES);
    // A dropped request says nothing about the session: signing the user out here would log
    // someone out of a live chat because their wifi blipped.
    mockedAxios.post.mockRejectedValueOnce(new Error('Network Error'));

    renderWithSession(expiring);

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    expect(getWebChannelSession()?.token).toBe(expiring);
    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();

    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);
    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS);
    });

    await waitFor(() => expect(getWebChannelSession()?.token).toBe(fresh));
  });

  // The channel reads the expiry once, at join. Renewing in storage alone leaves the server about
  // to expire a session whose holder has a perfectly good token.
  it('hands the renewed token to the live channel', async () => {
    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));

    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledWith({ id: 'live-channel' }, fresh));
  });

  it('renews in storage even before the socket has joined', async () => {
    channelState.current = null;
    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));

    await waitFor(() => expect(getWebChannelSession()?.token).toBe(fresh));
    expect(pushRenewToken).not.toHaveBeenCalled();
  });

  // A push rejects on its own 10s timeout or on an error reply, with the socket perfectly alive.
  // Nothing else would try again — the server warns once per token, and the next tick sees an
  // hour of life on the stored one — so the sweep would reach session_expired while the client
  // holds a good token.
  it('retries a dropped renew_token push until the channel takes it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);
    pushRenewToken.mockRejectedValueOnce(new Error('push timeout')).mockResolvedValue(undefined);

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));
    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledTimes(1));

    // the tick the old behaviour relied on: it returns early, because the stored token is fresh
    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS);
    });
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_RENEW_PUSH_RETRY_MS);
    });

    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledTimes(2));
    expect(pushRenewToken).toHaveBeenLastCalledWith({ id: 'live-channel' }, fresh);
    expect(getWebChannelSession()?.token).toBe(fresh);
    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();
  });

  it('stops retrying the push after a bounded number of attempts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renewSucceedsWith(tokenExpiringIn(3600));
    pushRenewToken.mockRejectedValue(new Error('push timeout'));

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));
    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledTimes(1));

    for (let attempt = 0; attempt < WEB_CHANNEL_RENEW_PUSH_ATTEMPTS + 2; attempt += 1) {
      await act(async () => {
        vi.advanceTimersByTime(WEB_CHANNEL_RENEW_PUSH_RETRY_MS);
      });
    }

    expect(pushRenewToken).toHaveBeenCalledTimes(WEB_CHANNEL_RENEW_PUSH_ATTEMPTS);
  });

  // Handing back a token the session has already moved past would undo the newer renewal.
  it('abandons a retry once a newer token has replaced the one it carries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);
    pushRenewToken.mockRejectedValue(new Error('push timeout'));

    renderWithSession(tokenExpiringIn(FIVE_MINUTES));
    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledTimes(1));

    // a distinct jti, or a token minted in the same second is byte-identical to the first
    setWebChannelSession({ token: tokenExpiringIn(3600, { jti: 'newer' }), contactId: 7, name: 'Priya' });
    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_RENEW_PUSH_RETRY_MS);
    });

    expect(pushRenewToken).toHaveBeenCalledTimes(1);
  });

  it('drops a pending push retry when the chat unmounts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renewSucceedsWith(tokenExpiringIn(3600));
    pushRenewToken.mockRejectedValue(new Error('push timeout'));

    const { unmount } = renderWithSession(tokenExpiringIn(FIVE_MINUTES));
    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_RENEW_PUSH_RETRY_MS * 3);
    });

    expect(pushRenewToken).toHaveBeenCalledTimes(1);
  });

  it('renews as soon as the server pushes token_expiring, without waiting for the interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fresh = tokenExpiringIn(3600);
    renewSucceedsWith(fresh);
    // Outside the widget's own refresh window, so only the server's warning can trigger this.
    renderWithSession(tokenExpiringIn(FORTY_MINUTES));
    expect(mockedAxios.post).not.toHaveBeenCalled();

    serverPushes('token_expiring');

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pushRenewToken).toHaveBeenCalledWith({ id: 'live-channel' }, fresh));
  });

  it('clears the session and sends the user to login when the server pushes session_expired', async () => {
    renderWithSession(tokenExpiringIn(FORTY_MINUTES));

    serverPushes('session_expired');

    expect(await screen.findByText('LOGIN SCREEN')).toBeInTheDocument();
    expect(getWebChannelSession()).toBeNull();
  });

  it('stops listening for server session pushes once unmounted', async () => {
    const { unmount } = renderWithSession(tokenExpiringIn(FORTY_MINUTES));
    unmount();

    expect(sessionListeners.size).toBe(0);
  });

  it('does nothing at all when there is no stored session', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="/chat" element={<Authenticated />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS * 2);
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('stops checking once unmounted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { unmount } = renderWithSession(tokenExpiringIn(FORTY_MINUTES));
    unmount();

    setWebChannelSession({ token: tokenExpiringIn(FIVE_MINUTES), contactId: 7, name: 'Priya' });
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      vi.advanceTimersByTime(WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS * 2);
    });

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
