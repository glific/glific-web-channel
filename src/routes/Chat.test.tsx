import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { clearWebChannelSession } from '@/services/webChannelAuth';
import { uploadMedia } from '@/services/webChannelMedia';
import { pushNewMediaMessage, pushNewLocationMessage } from '@/services/webChannelSocket';
import { Chat } from './Chat';

vi.mock('@/services/webChannelAuth', () => ({
  getWebChannelContact: () => ({ contactId: 1, name: 'Priya', phone: '+919820198765' }),
  getWebChannelToken: () => 'contact-token',
  clearWebChannelSession: vi.fn(),
}));

vi.mock('@/services/branding', () => ({
  getBranding: () => ({
    display_name: 'Test NGO',
    logo_url: null,
    primary_color: '#119656',
    primary_foreground: '#fafafa',
    secondary_color: '#eab308',
    about: { description: null, address: null, website: null, email: null, hours: null },
  }),
}));

vi.mock('@/services/webChannelSocket', () => ({
  // a truthy channel, so the composer's send paths see a joined connection
  connectAndJoin: vi.fn(() => Promise.resolve({ socket: {}, channel: { id: 'ch' }, messages: [] })),
  disconnect: vi.fn(),
  pushLoadMore: vi.fn(() => Promise.resolve([])),
  pushNewMessage: vi.fn(() => Promise.resolve()),
  pushNewMediaMessage: vi.fn(() => Promise.resolve()),
  pushNewLocationMessage: vi.fn(() => Promise.resolve()),
}));

// Only the upload is stubbed: the accept list and the error copy are what the composer is being
// tested on here.
vi.mock('@/services/webChannelMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/webChannelMedia')>()),
  uploadMedia: vi.fn(),
}));

// The recorder is unit-tested against a MediaRecorder stand-in; here it is driven directly.
const { recorderMock } = vi.hoisted(() => ({
  recorderMock: {
    isSupported: true,
    isRecording: false,
    seconds: 0,
    error: null as string | null,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    finish: (_file: File) => {},
  },
}));

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: (onComplete: (file: File) => void) => {
    recorderMock.finish = onComplete;
    return recorderMock;
  },
}));

const mockedUpload = uploadMedia as unknown as ReturnType<typeof vi.fn>;
const mockedMediaPush = pushNewMediaMessage as unknown as ReturnType<typeof vi.fn>;
const mockedLocationPush = pushNewLocationMessage as unknown as ReturnType<typeof vi.fn>;

const hosted = { url: 'https://cdn.test/cat.png', content_type: 'image/png' };
const file = new File(['bytes'], 'cat.png', { type: 'image/png' });

const uploadRejects = (code: string, status: number) =>
  mockedUpload.mockRejectedValueOnce({ response: { status, data: { error: { status, code } } } });

const renderChat = async () => {
  render(
    <MemoryRouter>
      <Chat />
    </MemoryRouter>
  );
  // the composer is live only once the channel has joined
  await screen.findByTestId('composerInput');
};

const pickFile = (picked = file) =>
  fireEvent.change(screen.getByTestId('fileInput'), { target: { files: [picked] } });

describe('<Chat /> media, voice and location composers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpload.mockResolvedValue(hosted);
    recorderMock.isSupported = true;
    recorderMock.isRecording = false;
    recorderMock.seconds = 0;
    recorderMock.error = null;
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({ coords: { latitude: 12.9, longitude: 77.5 } } as GeolocationPosition)
        ),
      },
      configurable: true,
    });
  });

  it('uploads a picked file and sends it with the composer text as its caption', async () => {
    await renderChat();

    pickFile();
    expect(screen.getByTestId('pendingAttachmentName')).toHaveTextContent('cat.png');

    fireEvent.change(screen.getByTestId('composerInput'), { target: { value: 'my cat' } });
    fireEvent.click(screen.getByTestId('sendButton'));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith(file, 'image'));
    await waitFor(() =>
      expect(mockedMediaPush).toHaveBeenCalledWith(
        { id: 'ch' },
        { type: 'image', url: hosted.url, content_type: 'image/png', caption: 'my cat' }
      )
    );
    // the bubble appears once the server has it, and the composer is empty again
    expect(await screen.findByRole('img')).toHaveAttribute('src', hosted.url);
    await waitFor(() => expect(screen.queryByTestId('pendingAttachment')).not.toBeInTheDocument());
    expect(screen.getByTestId('composerInput')).toHaveValue('');
  });

  // The ticket's acceptance criterion: a failed upload is retried without re-composing.
  it('keeps the file and its caption when the upload fails, and retries on the same tap', async () => {
    uploadRejects('file_too_large', 413);
    await renderChat();

    pickFile();
    fireEvent.change(screen.getByTestId('composerInput'), { target: { value: 'my cat' } });
    fireEvent.click(screen.getByTestId('sendButton'));

    expect(await screen.findByTestId('composerError')).toHaveTextContent(/too large/i);
    expect(screen.getByTestId('pendingAttachmentName')).toHaveTextContent('cat.png');
    expect(screen.getByTestId('composerInput')).toHaveValue('my cat');
    expect(mockedMediaPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('sendButton'));

    await waitFor(() => expect(mockedMediaPush).toHaveBeenCalledTimes(1));
    expect(mockedUpload).toHaveBeenCalledTimes(2);
  });

  it('shows the server-refused type in the widget’s own words', async () => {
    uploadRejects('unsupported_type', 415);
    await renderChat();

    pickFile(new File([''], 'virus.exe', { type: 'application/x-msdownload' }));
    fireEvent.click(screen.getByTestId('sendButton'));

    expect(await screen.findByTestId('composerError')).toHaveTextContent(/cannot be sent/i);
  });

  it('discards an attachment without sending it', async () => {
    await renderChat();

    pickFile();
    fireEvent.click(screen.getByTestId('removeAttachmentButton'));

    expect(screen.queryByTestId('pendingAttachment')).not.toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('sends a finished recording through the same upload-then-send path', async () => {
    await renderChat();
    fireEvent.click(screen.getByTestId('recordButton'));
    expect(recorderMock.start).toHaveBeenCalled();

    const recording = new File(['audio'], 'recording-1.webm', { type: 'audio/webm' });
    mockedUpload.mockResolvedValueOnce({ url: 'https://cdn.test/voice.webm', content_type: 'audio/webm' });
    await act(async () => recorderMock.finish(recording));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledWith(recording, 'audio'));
    await waitFor(() =>
      expect(mockedMediaPush).toHaveBeenCalledWith(
        { id: 'ch' },
        expect.objectContaining({ type: 'audio', url: 'https://cdn.test/voice.webm' })
      )
    );
  });

  it('sends a voice note with whatever caption was typed while recording', async () => {
    await renderChat();

    fireEvent.change(screen.getByTestId('composerInput'), { target: { value: 'listen to this' } });
    const recording = new File(['audio'], 'recording-1.webm', { type: 'audio/webm' });
    mockedUpload.mockResolvedValueOnce({ url: 'https://cdn.test/voice.webm', content_type: 'audio/webm' });
    await act(async () => recorderMock.finish(recording));

    await waitFor(() =>
      expect(mockedMediaPush).toHaveBeenCalledWith(
        { id: 'ch' },
        expect.objectContaining({ type: 'audio', caption: 'listen to this' })
      )
    );
    expect(screen.getByTestId('composerInput')).toHaveValue('');
  });

  it('replaces the composer with a recording bar while recording', async () => {
    recorderMock.isRecording = true;
    recorderMock.seconds = 65;

    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    );

    await screen.findByTestId('recordingBar');
    expect(screen.getByTestId('recordingTimer')).toHaveTextContent('1:05');
    expect(screen.queryByTestId('composerInput')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sendRecordingButton'));
    expect(recorderMock.stop).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('cancelRecordingButton'));
    expect(recorderMock.cancel).toHaveBeenCalled();
  });

  it('hides the mic where the browser cannot record, rather than offering a dead button', async () => {
    recorderMock.isSupported = false;
    await renderChat();

    expect(screen.queryByTestId('recordButton')).not.toBeInTheDocument();
  });

  it('surfaces a denied microphone', async () => {
    recorderMock.error = 'Microphone access is blocked.';
    await renderChat();

    expect(screen.getByTestId('composerError')).toHaveTextContent(/microphone/i);
  });

  it('shares the location and renders it as a map link', async () => {
    await renderChat();

    fireEvent.click(screen.getByTestId('locationButton'));

    await waitFor(() =>
      expect(mockedLocationPush).toHaveBeenCalledWith({ id: 'ch' }, { latitude: 12.9, longitude: 77.5 })
    );
    expect(await screen.findByTestId('locationContent')).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=12.9,77.5'
    );
  });

  it('surfaces a refused location instead of doing nothing', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, failure?: PositionErrorCallback) =>
          failure?.({ code: 1 } as GeolocationPositionError)
        ),
      },
      configurable: true,
    });
    await renderChat();

    fireEvent.click(screen.getByTestId('locationButton'));

    expect(await screen.findByTestId('composerError')).toHaveTextContent(/blocked/i);
    expect(mockedLocationPush).not.toHaveBeenCalled();
  });

  it('sends plain text when nothing is attached', async () => {
    await renderChat();

    fireEvent.change(screen.getByTestId('composerInput'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('sendButton'));

    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});

describe('the chat header and menu', () => {
  // The contact is chatting WITH the organisation, so the header carries the org's name and the
  // channel's presence — not the contact's own name, which they already know.
  it('names the organisation and shows the connection as its presence', async () => {
    await renderChat();

    expect(screen.getByTestId('orgName')).toHaveTextContent('Test NGO');
    expect(screen.getByTestId('connectionStatus')).toHaveTextContent('online');
  });

  it('shows the contact their own profile, read-only', async () => {
    await renderChat();

    fireEvent.click(screen.getByTestId('chatMenuButton'));

    expect(screen.getByTestId('menuProfile')).toHaveTextContent('Priya');
    expect(screen.getByTestId('menuProfile')).toHaveTextContent('+919820198765');
    // No endpoint lets a contact change their own name or number, so there is nothing to press.
    expect(screen.getByTestId('menuProfile').tagName).toBe('DIV');
  });

  it('closes on the backdrop rather than trapping the contact in the menu', async () => {
    await renderChat();

    fireEvent.click(screen.getByTestId('chatMenuButton'));
    fireEvent.click(screen.getByTestId('chatMenuBackdrop'));

    expect(screen.queryByTestId('chatMenu')).not.toBeInTheDocument();
  });

  it('ends the session from the menu', async () => {
    await renderChat();

    fireEvent.click(screen.getByTestId('chatMenuButton'));
    fireEvent.click(screen.getByTestId('menuLogout'));

    expect(clearWebChannelSession).toHaveBeenCalled();
  });
});
