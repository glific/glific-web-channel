import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Chat } from './Chat';
import { pushNewMediaMessage, pushNewLocationMessage } from '@/services/webChannelSocket';
import { uploadMedia } from '@/services/webChannelAuth';

vi.mock('@/services/webChannelAuth', () => ({
  getWebChannelContact: () => ({ contactId: 1, name: 'Test' }),
  getWebChannelToken: () => 't',
  setWebChannelName: vi.fn(),
  clearWebChannelSession: vi.fn(),
  uploadMedia: vi.fn(() => Promise.resolve({ url: 'https://cdn/cat.png', content_type: 'image/png' })),
}));

vi.mock('@/services/webChannelSocket', () => ({
  // resolve with a truthy channel so channelRef.current is set for the send paths
  connectAndJoin: vi.fn(() => Promise.resolve({ socket: {}, channel: { id: 'ch' }, messages: [] })),
  disconnect: vi.fn(),
  pushLoadMore: vi.fn(() => Promise.resolve([])),
  pushNewMessage: vi.fn(() => Promise.resolve()),
  pushNewMediaMessage: vi.fn(() => Promise.resolve()),
  pushNewLocationMessage: vi.fn(() => Promise.resolve()),
  pushUpdateName: vi.fn(() => Promise.resolve()),
}));

// Controllable audio-recorder stand-in (the real hook is unit-tested separately).
const { recorderMock } = vi.hoisted(() => ({
  recorderMock: {
    isSupported: true,
    isRecording: false,
    seconds: 0,
    error: null as string | null,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock('@/hooks/useAudioRecorder', () => ({ useAudioRecorder: () => recorderMock }));

const renderChat = () =>
  render(
    <MemoryRouter>
      <Chat />
    </MemoryRouter>
  );

describe('<Chat /> media & location composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    recorderMock.isSupported = true;
    recorderMock.isRecording = false;
    recorderMock.seconds = 0;
    recorderMock.error = null;
  });

  it('shows a mic button and starts recording on click', async () => {
    renderChat();
    await screen.findByTestId('composerInput');

    fireEvent.click(screen.getByTestId('recordButton'));
    expect(recorderMock.start).toHaveBeenCalled();
  });

  it('shows a recording bar while recording; stop and cancel drive the recorder', async () => {
    recorderMock.isRecording = true;
    recorderMock.seconds = 5;

    renderChat();
    await screen.findByTestId('recordingBar');
    expect(screen.getByTestId('recordingTimer')).toHaveTextContent('0:05');
    // the normal composer is replaced while recording
    expect(screen.queryByTestId('composerInput')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sendRecordingButton'));
    expect(recorderMock.stop).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('cancelRecordingButton'));
    expect(recorderMock.cancel).toHaveBeenCalled();
  });

  it('hides the mic button when recording is unsupported', async () => {
    recorderMock.isSupported = false;
    renderChat();
    await screen.findByTestId('composerInput');
    expect(screen.queryByTestId('recordButton')).not.toBeInTheDocument();
  });

  it('uploads a picked file and pushes a media message with the hosted url', async () => {
    renderChat();
    // wait for the socket connection (channelRef) to be established
    await screen.findByTestId('composerInput');

    const file = new File(['x'], 'cat.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('fileInput'), { target: { files: [file] } });

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledWith(file));
    await waitFor(() =>
      expect(pushNewMediaMessage).toHaveBeenCalledWith(
        { id: 'ch' },
        expect.objectContaining({ type: 'image', url: 'https://cdn/cat.png', filename: 'cat.png' })
      )
    );
    // optimistic bubble is shown immediately from the local object URL
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('shares the browser location and pushes a location message', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 12.9, longitude: 77.5 } } as GeolocationPosition)
    );
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });

    renderChat();
    await screen.findByTestId('composerInput');

    fireEvent.click(screen.getByTestId('locationButton'));

    expect(getCurrentPosition).toHaveBeenCalled();
    await waitFor(() =>
      expect(pushNewLocationMessage).toHaveBeenCalledWith({ id: 'ch' }, { latitude: 12.9, longitude: 77.5 })
    );
  });
});
