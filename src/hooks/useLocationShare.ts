import { useCallback, useState } from 'react';
import type { Channel } from 'phoenix';

import { pushNewLocationMessage } from '@/services/webChannelSocket';

export interface SharedLocation {
  latitude: number;
  longitude: number;
}

export interface LocationShare {
  isSupported: boolean;
  isSharing: boolean;
  error: string | null;
  share: () => void;
}

// Numeric rather than the constants on the error object: those are absent on the plain objects
// browsers hand to the callback in some engines, which would collapse every case to the default.
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

const UNSUPPORTED_ERROR = 'This browser cannot share your location.';
const SEND_ERROR = 'Could not send your location. Please try again.';
const NOT_CONNECTED_ERROR = 'Not connected yet. Please try again in a moment.';

const positionErrorMessage = (code: number): string => {
  if (code === PERMISSION_DENIED) return 'Location access is blocked. Allow it in your browser to share it.';
  if (code === TIMEOUT) return 'Finding your location took too long. Please try again.';
  return 'Could not find your location. Please try again.';
};

// Long enough for a cold GPS fix on a phone; without it the browser default can hang with the
// spinner up and nothing to explain it.
const POSITION_TIMEOUT_MS = 15_000;

/**
 * Share the device's coordinates as a location message. A refused or unavailable fix is a
 * visible, retryable state — a browser that silently does nothing looks like a broken button.
 */
export const useLocationShare = (
  getChannel: () => Channel | null,
  onSent: (location: SharedLocation) => void
): LocationShare => {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The object itself, not the key: a browser can carry the property with nothing behind it.
  const isSupported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  const share = useCallback(() => {
    if (isSharing) return;

    if (!isSupported) {
      setError(UNSUPPORTED_ERROR);
      return;
    }

    const channel = getChannel();
    if (!channel) {
      setError(NOT_CONNECTED_ERROR);
      return;
    }

    setError(null);
    setIsSharing(true);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };

        pushNewLocationMessage(channel, location)
          .then(() => onSent(location))
          .catch(() => setError(SEND_ERROR))
          .finally(() => setIsSharing(false));
      },
      (positionError) => {
        setIsSharing(false);
        setError(positionErrorMessage(positionError?.code));
      },
      { timeout: POSITION_TIMEOUT_MS }
    );
  }, [getChannel, isSharing, isSupported, onSent]);

  return { isSupported, isSharing, error, share };
};
