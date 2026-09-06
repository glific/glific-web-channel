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
 * Renews the stored token before it expires, so a beneficiary mid-conversation is never bounced
 * back to the OTP screen.
 *
 * The interval alone is not enough: a backgrounded tab has its timers throttled hard, so a user
 * returning after an hour needs a token on focus rather than up to 30s later — by which point the
 * socket has already retried with the dead one.
 */
export const useSessionRefresh = (): void => {
  const navigate = useNavigate();
  // A ref because both triggers can fire in the same tick, and the second renewal would send a
  // token the first has already replaced.
  const refreshing = useRef(false);

  useEffect(() => {
    let active = true;

    const refreshIfExpiringSoon = () => {
      if (refreshing.current) return;

      const token = getWebChannelToken();
      if (!token) return;

      // The route guards already treat an unreadable exp as signed out; no request needed here.
      const expiry = decodeTokenExpiry(token);
      if (expiry === null) return;

      const secondsLeft = expiry - Date.now() / 1000;
      if (secondsLeft > WEB_CHANNEL_TOKEN_REFRESH_THRESHOLD_SECONDS) return;

      refreshing.current = true;
      renewToken(token)
        .then(({ data }) => {
          const { token: renewed, contact_id: contactId, name } = data?.data ?? {};
          if (renewed) setWebChannelSession({ token: renewed, contactId, name });
        })
        .catch((error) => {
          const status = webChannelErrorStatus(error);

          // No status means the request never arrived, and a 5xx is the server failing — neither
          // says the session was refused. Signing someone out over a dropped packet is the worse
          // failure, so retry on the next tick instead.
          if (status === null || status >= 500) return;

          clearWebChannelSession();
          if (active) navigate('/login', { replace: true });
        })
        .finally(() => {
          refreshing.current = false;
        });
    };

    // The tab may have been restored with a token already near expiry.
    refreshIfExpiringSoon();

    const interval = setInterval(refreshIfExpiringSoon, WEB_CHANNEL_TOKEN_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfExpiringSoon();
    };

    // Both: a tab switch fires visibilitychange, while returning to a window that was never
    // hidden (another app on top) only fires focus.
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
