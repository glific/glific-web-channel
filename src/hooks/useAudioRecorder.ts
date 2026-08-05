import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioRecorder {
  // false when the browser lacks MediaRecorder / getUserMedia (hide the mic button)
  isSupported: boolean;
  isRecording: boolean;
  // elapsed recording time in whole seconds
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  // finish and hand the recorded File to onComplete
  stop: () => void;
  // finish and discard
  cancel: () => void;
}

// Candidate container/codecs in preference order. Chrome/Firefox/Android support webm/opus;
// iOS Safari only supports audio/mp4 (AAC) — so we probe and pick the first supported one.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const pickMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
};

// Map a recorder mime type to a file extension the upload endpoint / player can use.
const extensionFor = (mime: string): string => {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
};

const isSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

/**
 * Record audio from the device microphone and deliver it as a `File` via `onComplete`.
 * Works on desktop and mobile browsers (feature-probes the codec so iOS Safari's audio/mp4
 * is used where webm/opus is unavailable).
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
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
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      canceledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const canceled = canceledRef.current;
        cleanup();
        setRecording(false);
        setSeconds(0);
        if (!canceled && blob.size > 0) {
          const file = new File([blob], `recording-${Date.now()}.${extensionFor(type)}`, { type });
          onCompleteRef.current(file);
        }
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      cleanup();
      setRecording(false);
      setError('Could not access the microphone. Please grant permission and try again.');
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
