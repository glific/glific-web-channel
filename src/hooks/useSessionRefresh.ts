import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

import { WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS, WEB_CHANNEL_TOKEN_REFRESH_THRESHOLD_SECONDS } from '@/config';
import {
  clearWebChannelSession,
  decodeTokenExpiry,
  getWebChannelToken,
  renewToken,
  setWebChannelSession,
  webChannelErrorStatus,
} from '@/services/webChannelAuth';

/**
 * Keeps the stored web-channel session alive while the user is in the app.
 *
 * The backend mints a one-hour token, and a beneficiary in a long conversation should never be
 * bounced back to the OTP screen mid-chat. So once the token is inside the refresh threshold we
 * trade it for a fresh one — silently, with no interruption to the chat.
 *
 * Two triggers, because neither is enough on its own:
 *
 *   - a 30s interval, for a tab that is sitting open and in view;
 *   - focus/visibilitychange, because a BACKGROUNDED tab's timers are throttled hard by the
 *     browser (often to once a minute, sometimes not at all). A user coming back to a tab they
 *     left an hour ago must get a fresh token immediately, not up to 30s later — and by then the
 *     socket has already tried to reconnect with the dead one.
 *
 * Both triggers can land in the same tick when a tab regains focus, hence the in-flight guard:
 * two renewals racing would have the second one send the token the first has already replaced.
 */
export const useSessionRefresh = (): void => {
  const navigate = useNavigate();
  // a ref, not state: this must be read and written synchronously within one tick, and changing
  // it should never re-render anything
  const refreshing = useRef(false);

  useEffect(() => {
    let active = true;

    const refreshIfExpiringSoon = () => {
      if (refreshing.current) return;

      const token = getWebChannelToken();
      if (!token) return;

      const expiry = decodeTokenExpiry(token);
      // Nothing to schedule against. The route guards already treat such a token as signed out,
      // so leave it to them rather than spending a request on it.
      if (expiry === null) return;

      const secondsLeft = expiry - Date.now() / 1000;
      if (secondsLeft > WEB_CHANNEL_TOKEN_REFRESH_THRESHOLD_SECONDS) return;

      refreshing.current = true;
      renewToken(token)
        .then(({ data }) => {
          // same body shape as verify-otp, so the existing setter takes it as-is
          const { token: renewed, contact_id: contactId, name } = data?.data ?? {};
          if (renewed) setWebChannelSession({ token: renewed, contactId, name });
        })
        .catch((error) => {
          const status = webChannelErrorStatus(error);

          // No status means the request never reached the server — offline, flaky wifi, a
          // captive portal. The session may well still be good, so leave it alone and try again
          // on the next tick. Signing someone out over a dropped packet is the worse failure.
          // A 5xx is the server failing, not the session being refused: same treatment.
          if (status === null || status >= 500) return;

          // 401 (expired/invalid), 404 (channel turned off), 422 (we sent nothing usable) — the
          // session cannot be renewed, so drop it and send the user back to sign in.
          clearWebChannelSession();
          if (active) navigate('/login', { replace: true });
        })
        .finally(() => {
          refreshing.current = false;
        });
    };

    // check straight away: the tab may have been restored with a token already near expiry
    refreshIfExpiringSoon();

    const interval = setInterval(refreshIfExpiringSoon, WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfExpiringSoon();
    };

    // focus AND visibilitychange: a tab switch fires visibilitychange, while returning to a
    // window that was never hidden (another app on top) only fires focus.
    window.addEventListener('focus', refreshIfExpiringSoon);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', refreshIfExpiringSoon);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [navigate]);
};
