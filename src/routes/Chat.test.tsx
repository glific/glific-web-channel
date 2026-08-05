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
