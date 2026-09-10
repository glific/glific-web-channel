import { useCallback, useRef, useState } from 'react';
import type { Channel } from 'phoenix';

import { mediaTypeFor, uploadErrorMessage, uploadMedia, type UploadedMedia } from '@/services/webChannelMedia';
import { pushNewMediaMessage, type OutboundMedia, type OutboundMediaType } from '@/services/webChannelSocket';

export type MediaSendStatus = 'idle' | 'uploading' | 'sending' | 'failed';

export interface PendingMedia {
  file: File;
  type: OutboundMediaType;
  // set once the bytes are stored, so a retry after a failed push does not re-upload them
  uploaded: UploadedMedia | null;
}

export interface MediaSend {
  pending: PendingMedia | null;
  status: MediaSendStatus;
  error: string | null;
  attach: (file: File) => void;
  send: (caption?: string) => Promise<void>;
  discard: () => void;
}

const SEND_ERROR = 'Could not send that file. Please try again.';
const NOT_CONNECTED_ERROR = 'Not connected yet. Please try again in a moment.';

/**
 * Holds a picked file through upload-then-send, keeping whatever already succeeded.
 *
 * The acceptance criterion is that a failure can be retried without re-composing, so the two
 * halves fail separately: a failed upload retries the upload, while a failed push retries only
 * the push against the url the upload already returned.
 */
export const useMediaSend = (
  getChannel: () => Channel | null,
  onSent: (media: OutboundMedia) => void
): MediaSend => {
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const [status, setStatus] = useState<MediaSendStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // A ref, not the state: a double tap on send would otherwise pass the guard twice in one
  // render and upload the same file twice.
  const busy = useRef(false);
  const pendingRef = useRef<PendingMedia | null>(null);

  const setPendingMedia = (media: PendingMedia | null) => {
    pendingRef.current = media;
    setPending(media);
  };

  const attach = useCallback((file: File) => {
    setError(null);
    setStatus('idle');
    setPendingMedia({ file, type: mediaTypeFor(file), uploaded: null });
  }, []);

  const discard = useCallback(() => {
    busy.current = false;
    setError(null);
    setStatus('idle');
    setPendingMedia(null);
  }, []);

  const send = useCallback(
    async (caption = '') => {
      const current = pendingRef.current;
      if (!current || busy.current) return;

      const channel = getChannel();
      if (!channel) {
        setError(NOT_CONNECTED_ERROR);
        setStatus('failed');
        return;
      }

      busy.current = true;
      setError(null);

      let uploaded = current.uploaded;

      if (!uploaded) {
        setStatus('uploading');
        try {
          uploaded = await uploadMedia(current.file, current.type);
        } catch (uploadError) {
          busy.current = false;
          setError(uploadErrorMessage(uploadError));
          setStatus('failed');
          return;
        }
        setPendingMedia({ ...current, uploaded });
      }

      const media: OutboundMedia = {
        type: current.type,
        url: uploaded.url,
        content_type: uploaded.content_type,
        caption: caption.trim() || undefined,
      };

      setStatus('sending');
      try {
        await pushNewMediaMessage(channel, media);
      } catch {
        busy.current = false;
        setError(SEND_ERROR);
        setStatus('failed');
        return;
      }

      busy.current = false;
      setStatus('idle');
      setPendingMedia(null);
      onSent(media);
    },
    [getChannel, onSent]
  );

  return { pending, status, error, attach, send, discard };
};
