import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioRecorder {
  isSupported: boolean;
  isRecording: boolean;
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}

// Chrome/Firefox/Android record webm/opus, iOS Safari only audio/mp4, so the container is probed
// rather than hardcoded. audio/ogg is deliberately absent: the backend's media validation rejects
// it, so a recording in it could be made but never sent.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

const pickMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
};

const extensionFor = (mime: string): string => {
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
};

// A browser that supports none of the candidates is reported as unsupported rather than left to
// choose for itself: its own default may well be the ogg the backend refuses, which would record
// a voice note that can never be sent.
const isSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  pickMimeType() !== '';

const PERMISSION_ERROR = 'Microphone access is blocked. Allow it in your browser to record a voice note.';

/**
 * Record from the device microphone and deliver the result as a `File` to `onComplete`.
 *
 * A denied microphone is a state, not a thrown error: it is the common case on a phone and the
 * caller has to be able to show it and let the user try again.
 */
export const useAudioRecorder = (onComplete: (file: File) => void): AudioRecorder => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canceledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // keep the latest callback so a new closure each render never goes stale mid-recording
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    // releases the browser's recording indicator; leaving the track live looks like eavesdropping
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!isSupported() || recorderRef.current) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      canceledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType;
        const blob = new Blob(chunksRef.current, { type });
        const canceled = canceledRef.current;

        cleanup();
        setRecording(false);
        setSeconds(0);

        if (!canceled && blob.size > 0) {
          onCompleteRef.current(new File([blob], `recording-${Date.now()}.${extensionFor(type)}`, { type }));
        }
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((elapsed) => elapsed + 1), 1000);
    } catch {
      cleanup();
      setRecording(false);
      setError(PERMISSION_ERROR);
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    canceledRef.current = false;
    recorderRef.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    canceledRef.current = true;
    recorderRef.current?.stop();
  }, []);

  return { isSupported: isSupported(), isRecording: recording, seconds, error, start, stop, cancel };
};
