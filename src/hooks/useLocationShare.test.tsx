import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { pushNewLocationMessage } from '@/services/webChannelSocket';
import { useLocationShare } from './useLocationShare';

vi.mock('@/services/webChannelSocket', () => ({ pushNewLocationMessage: vi.fn() }));

const mockedPush = pushNewLocationMessage as unknown as ReturnType<typeof vi.fn>;

const channel = { id: 'ch' };
const coords = { latitude: 12.9, longitude: 77.5 };

const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

const geolocationResolves = () =>
  vi.fn((success: PositionCallback) => success({ coords } as GeolocationPosition));

const geolocationFails = (code: number) =>
  vi.fn((_success: PositionCallback, failure?: PositionErrorCallback) =>
    failure?.({ code } as GeolocationPositionError)
  );

const withGeolocation = (getCurrentPosition: unknown) =>
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

const renderLocationShare = (onSent = vi.fn(), getChannel = () => channel as never) => ({
  ...renderHook(() => useLocationShare(getChannel, onSent)),
  onSent,
});

describe('useLocationShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPush.mockResolvedValue(undefined);
    withGeolocation(geolocationResolves());
  });

  it('pushes the coordinates and reports the sent location', async () => {
    const { result, onSent } = renderLocationShare();

    act(() => result.current.share());

    await waitFor(() => expect(mockedPush).toHaveBeenCalledWith(channel, coords));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(coords));
    expect(result.current.error).toBeNull();
    expect(result.current.isSharing).toBe(false);
  });

  // A blocked permission is the common case on a phone, and a button that silently does nothing
  // reads as broken.
  it('surfaces a blocked location permission', async () => {
    withGeolocation(geolocationFails(PERMISSION_DENIED));
    const { result } = renderLocationShare();

    act(() => result.current.share());

    expect(result.current.error).toMatch(/blocked/i);
    expect(result.current.isSharing).toBe(false);
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it('surfaces a fix that took too long, distinctly from a refusal', async () => {
    withGeolocation(geolocationFails(TIMEOUT));
    const { result } = renderLocationShare();

    act(() => result.current.share());
    const timeoutMessage = result.current.error;

    withGeolocation(geolocationFails(PERMISSION_DENIED));
    act(() => result.current.share());

    expect(timeoutMessage).toBeTruthy();
    expect(result.current.error).not.toBe(timeoutMessage);
  });

  it('asks the browser for a bounded fix rather than waiting forever', () => {
    const getCurrentPosition = geolocationResolves();
    withGeolocation(getCurrentPosition);

    const { result } = renderLocationShare();
    act(() => result.current.share());

    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ timeout: expect.any(Number) });
  });

  it('reports a failed push separately from a failed fix', async () => {
    mockedPush.mockRejectedValueOnce(new Error('socket closed'));
    const { result, onSent } = renderLocationShare();

    act(() => result.current.share());

    await waitFor(() => expect(result.current.error).toMatch(/send/i));
    expect(onSent).not.toHaveBeenCalled();
  });

  // The button is live from the first paint, and a silent return would read as a dead button.
  it('says so when the socket has not joined yet, rather than doing nothing', () => {
    const { result } = renderLocationShare(vi.fn(), () => null);

    act(() => result.current.share());

    expect(result.current.error).toBeTruthy();
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it('says so when the browser cannot share a location at all', () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });

    const { result } = renderLocationShare();
    act(() => result.current.share());

    expect(result.current.isSupported).toBe(false);
    expect(result.current.error).toMatch(/cannot share/i);
  });
});
