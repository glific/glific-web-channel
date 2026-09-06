import axios from 'axios';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WEB_CHANNEL_UPLOAD } from '@/config';
import { setWebChannelSession } from '@/services/webChannelAuth';
import { mediaTypeFor, uploadErrorMessage, uploadMedia, UPLOAD_ACCEPT } from './webChannelMedia';

vi.mock('axios');
const mockedAxios = axios as any;

const uploadError = (code: string, status: number) => ({
  response: { status, data: { error: { status, code, message: 'server prose' } } },
});

const signedUpload = (suffix = '1') => ({
  data: {
    data: {
      upload_url: `https://storage.googleapis.com/bucket/uuid?X-Goog-Signature=sig${suffix}`,
      url: 'https://cdn.test/cat.png',
      content_type: 'image/png',
      expires_in: 300,
    },
  },
});

describe('webChannelMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('uploadMedia', () => {
    beforeEach(() => {
      setWebChannelSession({ token: 'contact-token', contactId: 7 });
      mockedAxios.post.mockResolvedValue(signedUpload());
      mockedAxios.put.mockResolvedValue({ status: 200 });
    });

    // Both halves are pinned together because neither is meaningful alone: the signing request
    // is what the controller matches on, and the PUT is the only step that moves the bytes.
    it('asks Glific to sign an upload, then sends the bytes to the url it signed', async () => {
      const file = new File(['bytes'], 'cat.png', { type: 'image/png' });

      const uploaded = await uploadMedia(file, 'image');

      expect(uploaded).toEqual({ url: 'https://cdn.test/cat.png', content_type: 'image/png' });

      const [signUrl, body, signOptions] = mockedAxios.post.mock.calls[0];
      expect(signUrl).toBe(WEB_CHANNEL_UPLOAD);
      expect(body).toEqual({ type: 'image', content_type: 'image/png', size: file.size });
      // the org is resolved from this token; a body-supplied org id would be a cross-tenant write
      expect(signOptions.headers.Authorization).toBe('Bearer contact-token');

      const [putUrl, putBody, putOptions] = mockedAxios.put.mock.calls[0];
      expect(putUrl).toBe(signedUpload().data.data.upload_url);
      expect(putBody).toBe(file);
      expect(putOptions.headers['Content-Type']).toBe('image/png');
    });

    // Only host and content-type are signed, so an extra header is not merely useless: Google
    // refuses the request outright.
    it('sends no Authorization header to storage', async () => {
      await uploadMedia(new File(['bytes'], 'cat.png', { type: 'image/png' }), 'image');

      const putOptions = mockedAxios.put.mock.calls[0][2];
      expect(putOptions.headers.Authorization).toBeUndefined();
      expect(Object.keys(putOptions.headers)).toEqual(['Content-Type']);
    });

    it('never sends the file to Glific', async () => {
      const file = new File(['bytes'], 'cat.png', { type: 'image/png' });

      await uploadMedia(file, 'image');

      expect(JSON.stringify(mockedAxios.post.mock.calls[0][1])).not.toContain('bytes');
      expect(mockedAxios.post.mock.calls[0][1]).not.toBeInstanceOf(FormData);
    });

    it.each(['image', 'audio', 'video', 'document'] as const)(
      'sends %s as a type the controller guard accepts',
      async (type) => {
        await uploadMedia(new File(['bytes'], 'file.bin'), type);

        expect(mockedAxios.post.mock.calls[0][1].type).toBe(type);
      }
    );

    // The url is signed for five minutes, so a retry against the one that just failed can fail
    // again for a reason the user has no way to act on.
    it('signs a fresh url when a failed upload is retried', async () => {
      const file = new File(['bytes'], 'cat.png', { type: 'image/png' });
      mockedAxios.post.mockResolvedValueOnce(signedUpload('1')).mockResolvedValueOnce(signedUpload('2'));
      mockedAxios.put.mockRejectedValueOnce(new Error('Network Error'));

      await expect(uploadMedia(file, 'image')).rejects.toThrow();
      await uploadMedia(file, 'image');

      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.put.mock.calls[1][0]).toBe(signedUpload('2').data.data.upload_url);
    });

    it('surfaces a CORS or network failure on the PUT as a retryable upload failure', async () => {
      mockedAxios.put.mockRejectedValueOnce(new Error('Network Error'));

      const failure = await uploadMedia(new File(['bytes'], 'cat.png', { type: 'image/png' }), 'image').catch(
        (error) => error
      );

      expect(failure).toBeInstanceOf(Error);
      expect(uploadErrorMessage(failure)).toBe('Upload failed. Please try again.');
    });

    // Storage answers with its own XML envelope, which happens to be shaped nothing like
    // Glific's — matching a `code` out of it would show copy about the wrong failure.
    it('does not read an error code out of the storage response', async () => {
      mockedAxios.put.mockRejectedValueOnce(uploadError('unauthorized', 403));

      const failure = await uploadMedia(new File(['bytes'], 'cat.png', { type: 'image/png' }), 'image').catch(
        (error) => error
      );

      expect(uploadErrorMessage(failure)).toBe('Upload failed. Please try again.');
    });

    it('does not touch storage when the signing request fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(uploadError('file_too_large', 413));

      await expect(uploadMedia(new File(['bytes'], 'big.png', { type: 'image/png' }), 'image')).rejects.toBeTruthy();

      expect(mockedAxios.put).not.toHaveBeenCalled();
    });
  });

  describe('mediaTypeFor', () => {
    it.each([
      ['photo.png', 'image/png', 'image'],
      ['clip.mp4', 'video/mp4', 'video'],
      ['note.webm', 'audio/webm;codecs=opus', 'audio'],
      ['report.pdf', 'application/pdf', 'document'],
    ])('maps %s (%s) to a %s message', (name, mime, expected) => {
      expect(mediaTypeFor(new File([''], name, { type: mime }))).toBe(expected);
    });

    // Some Android pickers report no MIME type at all; document is the branch most likely to
    // accept the file, and the server has the final say either way.
    it('treats a file with no reported type as a document', () => {
      expect(mediaTypeFor(new File([''], 'mystery'))).toBe('document');
    });
  });

  // Pinned against the server's document allowlist. These are the exact types a browser sends for
  // an Office file, and the server matches them exactly rather than by substring.
  describe('UPLOAD_ACCEPT', () => {
    it.each([
      'application/pdf',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ])('offers %s, which the server accepts', (contentType) => {
      expect(UPLOAD_ACCEPT).toContain(contentType);
    });

    it('offers no document type the server would refuse', () => {
      expect(UPLOAD_ACCEPT).not.toContain('application/zip');
      expect(UPLOAD_ACCEPT).not.toContain('text/html');
    });
  });

  describe('uploadErrorMessage', () => {
    it.each([
      ['file_too_large', 413],
      ['unsupported_type', 415],
      ['upload_failed', 422],
      ['unauthorized', 401],
      ['web_channel_disabled', 404],
      ['signing_failed', 500],
    ])('renders its own copy for %s, never the server prose', (code, status) => {
      const message = uploadErrorMessage(uploadError(code as string, status as number));

      expect(message).not.toContain('server prose');
      expect(message.length).toBeGreaterThan(0);
    });

    it('tells a file that is too large apart from one of the wrong type', () => {
      expect(uploadErrorMessage(uploadError('file_too_large', 413))).not.toBe(
        uploadErrorMessage(uploadError('unsupported_type', 415))
      );
    });

    it('falls back to a generic message for a network error with no code', () => {
      expect(uploadErrorMessage(new Error('Network Error'))).toBe('Upload failed. Please try again.');
    });

    it('falls back for a code it does not know', () => {
      expect(uploadErrorMessage(uploadError('teapot', 418))).toBe('Upload failed. Please try again.');
    });
  });
});
