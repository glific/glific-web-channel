import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAudioRecorder } from './useAudioRecorder';

// Minimal MediaRecorder stand-in: stop() emits one chunk then fires onstop, like the real API.
class MockMediaRecorder {
  static isTypeSupported = vi.fn((_type: string) => true);
  static lastOptions: MediaRecorderOptions | undefined;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = 'audio/webm';
  state = 'inactive';

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    MockMediaRecorder.lastOptions = options;
    this.mimeType = options?.mimeType ?? 'audio/webm';
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream));

const startRecording = async (onComplete = vi.fn()) => {
  const rendered = renderHook(() => useAudioRecorder(onComplete));
  await act(async () => {
    await rendered.result.current.start();
  });
  return rendered;
};

beforeEach(() => {
  MockMediaRecorder.isTypeSupported = vi.fn(() => true);
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.clearAllMocks();
  MockMediaRecorder.isTypeSupported.mockReturnValue(true);
  MockMediaRecorder.lastOptions = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAudioRecorder', () => {
  it('reports supported when MediaRecorder and getUserMedia both exist', () => {
    const { result } = renderHook(() => useAudioRecorder(vi.fn()));

    expect(result.current.isSupported).toBe(true);
  });

  it('reports unsupported when the browser has no MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);

    const { result } = renderHook(() => useAudioRecorder(vi.fn()));

    expect(result.current.isSupported).toBe(false);
  });

  it('start() begins recording and stop() delivers an audio File', async () => {
    const onComplete = vi.fn();
    const { result } = await startRecording(onComplete);

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.isRecording).toBe(true);

    act(() => result.current.stop());

    expect(result.current.isRecording).toBe(false);
    const file = onComplete.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toContain('audio');
    // the mic indicator stays on until the track is stopped, which reads as eavesdropping
    expect(track.stop).toHaveBeenCalled();
  });

  it('cancel() ends the recording without delivering a File', async () => {
    const onComplete = vi.fn();
    const { result } = await startRecording(onComplete);

    act(() => result.current.cancel());

    expect(result.current.isRecording).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('picks the first container the browser supports', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'audio/mp4');

    await startRecording();

    expect(MockMediaRecorder.lastOptions).toEqual({ mimeType: 'audio/mp4' });
  });

  it('names an mp4 recording .m4a, so the upload carries an extension the server accepts', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'audio/mp4');
    const onComplete = vi.fn();
    const { result } = await startRecording(onComplete);

    act(() => result.current.stop());

    expect((onComplete.mock.calls[0][0] as File).name).toMatch(/\.m4a$/);
  });

  // The backend's media validation rejects audio/ogg outright. Letting the browser fall back to
  // its own default here would record exactly that and name the file .webm on top of it, so an
  // ogg-only engine has to be reported as unable to record at all.
  it('reports unsupported where the only container on offer is one the server refuses', async () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type.includes('ogg'));
    const onComplete = vi.fn();

    const { result } = await startRecording(onComplete);

    expect(result.current.isSupported).toBe(false);
    expect(result.current.isRecording).toBe(false);
    // no microphone prompt for a recording that could never be sent
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports unsupported when the browser cannot say which containers it records', () => {
    // @ts-expect-error — probing a browser that predates isTypeSupported
    MockMediaRecorder.isTypeSupported = undefined;

    const { result } = renderHook(() => useAudioRecorder(vi.fn()));

    expect(result.current.isSupported).toBe(false);
  });

  it('surfaces a denied microphone as a recoverable error rather than throwing', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('denied'));
    const { result } = await startRecording();

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
