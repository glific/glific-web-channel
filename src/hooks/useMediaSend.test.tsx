import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { uploadMedia } from '@/services/webChannelMedia';
import { pushNewMediaMessage } from '@/services/webChannelSocket';
import { useMediaSend } from './useMediaSend';

// The error copy is deliberately NOT mocked: a test that stubs it cannot notice the widget
// falling back to the server's prose.
vi.mock('@/services/webChannelMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/webChannelMedia')>()),
  uploadMedia: vi.fn(),
}));

vi.mock('@/services/webChannelSocket', () => ({ pushNewMediaMessage: vi.fn() }));

const mockedUpload = uploadMedia as unknown as ReturnType<typeof vi.fn>;
const mockedPush = pushNewMediaMessage as unknown as ReturnType<typeof vi.fn>;

const channel = { id: 'ch' };
const file = new File(['bytes'], 'cat.png', { type: 'image/png' });
const hosted = { url: 'https://cdn.test/cat.png', content_type: 'image/png' };

const uploadRejects = (code: string, status: number) =>
  mockedUpload.mockRejectedValueOnce({ response: { status, data: { error: { status, code } } } });

const renderMediaSend = (onSent = vi.fn(), getChannel = () => channel as never) => ({
  ...renderHook(() => useMediaSend(getChannel, onSent)),
  onSent,
});

describe('useMediaSend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpload.mockResolvedValue(hosted);
    mockedPush.mockResolvedValue(undefined);
  });

  it('uploads the file, then pushes a media message carrying the hosted url and caption', async () => {
    const { result, onSent } = renderMediaSend();

    act(() => result.current.attach(file));
    expect(result.current.pending).toMatchObject({ file, type: 'image' });

    await act(async () => {
      await result.current.send('  my cat  ');
    });

    expect(mockedUpload).toHaveBeenCalledWith(file, 'image');
    expect(mockedPush).toHaveBeenCalledWith(channel, {
      type: 'image',
      url: hosted.url,
      content_type: 'image/png',
      caption: 'my cat',
    });
    expect(onSent).toHaveBeenCalledTimes(1);
    // both halves acknowledged, so nothing is left to retry
    expect(result.current.pending).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('sends no caption when the composer is empty', async () => {
    const { result } = renderMediaSend();

    act(() => result.current.attach(file));
    await act(async () => {
      await result.current.send('   ');
    });

    expect(mockedPush.mock.calls[0][1].caption).toBeUndefined();
  });

  // The acceptance criterion: a failure must be retryable without re-composing the message.
  it('keeps the file when the upload fails, and the retry re-uploads it', async () => {
    uploadRejects('file_too_large', 413);
    const { result, onSent } = renderMediaSend();

    act(() => result.current.attach(file));
    await act(async () => {
      await result.current.send();
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toMatch(/too large/i);
    expect(result.current.pending?.file).toBe(file);
    expect(mockedPush).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.send();
    });

    expect(mockedUpload).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.pending).toBeNull());
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('does not re-upload when only the socket push failed', async () => {
    mockedPush.mockRejectedValueOnce(new Error('socket closed'));
    const { result } = renderMediaSend();

    act(() => result.current.attach(file));
    await act(async () => {
      await result.current.send('caption');
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.pending?.uploaded).toEqual(hosted);

    await act(async () => {
      await result.current.send('caption');
    });

    // the bytes are already stored; a second upload would double-charge storage for one message
    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedPush).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBeNull();
  });

  it('tells an upload failure apart from a send failure in what it shows', async () => {
    uploadRejects('upload_failed', 422);
    const { result } = renderMediaSend();

    act(() => result.current.attach(file));
    await act(async () => {
      await result.current.send();
    });
    const uploadMessage = result.current.error;

    mockedPush.mockRejectedValueOnce(new Error('socket closed'));
    await act(async () => {
      await result.current.send();
    });

    expect(result.current.error).not.toBe(uploadMessage);
  });

  it('clears the error when a new file replaces the failed one', async () => {
    uploadRejects('unsupported_type', 415);
    const { result } = renderMediaSend();

    act(() => result.current.attach(file));
    await act(async () => {
      await result.current.send();
    });
    expect(result.current.error).toBeTruthy();

    act(() => result.current.attach(new File([''], 'note.pdf', { type: 'application/pdf' })));

    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('idle');
    expect(result.current.pending).toMatchObject({ type: 'document' });
  });

  it('discards the attachment on request', async () => {
    const { result } = renderMediaSend();

    act(() => result.current.attach(file));
    act(() => result.current.discard());

    expect(result.current.pending).toBeNull();
    await act(async () => {
      await result.current.send();
    });
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it('says so instead of uploading when the socket has not joined yet', async () => {
    const { result } = renderMediaSend(vi.fn(), () => null);

    act(() => result.current.attach(file));
    await act(async () => {
      await result.current.send();
    });

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(result.current.pending?.file).toBe(file);
  });

  it('uploads once when send is triggered twice before the first finishes', async () => {
    const { result } = renderMediaSend();

    act(() => result.current.attach(file));
    await act(async () => {
      await Promise.all([result.current.send(), result.current.send()]);
    });

    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedPush).toHaveBeenCalledTimes(1);
  });
});
