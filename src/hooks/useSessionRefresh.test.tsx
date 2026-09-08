import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { WEB_CHANNEL_RENEW_TOKEN, WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS } from '@/config';
import { getWebChannelSession, setWebChannelSession } from '@/services/webChannelAuth';
import { tokenExpiringIn } from '@/test/token';
import { useSessionRefresh } from './useSessionRefresh';

vi.mock('axios');
const mockedAxios = axios as any;

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
