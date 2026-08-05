import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAudioRecorder } from './useAudioRecorder';

// Minimal MediaRecorder stand-in: stop() emits one chunk then fires onstop, like the real API.
class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = 'audio/webm';
  state = 'inactive';
  // eslint-disable-next-line no-useless-constructor, @typescript-eslint/no-unused-vars
  constructor(_stream: MediaStream, _opts?: MediaRecorderOptions) {}
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream));

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  vi.clearAllMocks();
  MockMediaRecorder.isTypeSupported.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAudioRecorder', () => {
  it('reports supported when MediaRecorder + getUserMedia exist', () => {
    const { result } = renderHook(() => useAudioRecorder(vi.fn()));
    expect(result.current.isSupported).toBe(true);
  });

  it('start() begins recording and stop() delivers an audio File', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useAudioRecorder(onComplete));

    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.isRecording).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isRecording).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const file = onComplete.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toContain('audio');
    expect(file.name).toMatch(/\.webm$/);
    expect(track.stop).toHaveBeenCalled(); // mic released
  });

  it('cancel() ends recording without delivering a File', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useAudioRecorder(onComplete));

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.cancel();
    });

    expect(result.current.isRecording).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('surfaces an error when microphone permission is denied', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('denied'));
    const { result } = renderHook(() => useAudioRecorder(vi.fn()));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
