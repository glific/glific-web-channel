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

describe('webChannelMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('uploadMedia', () => {
    beforeEach(() => {
      setWebChannelSession({ token: 'contact-token', contactId: 7 });
      mockedAxios.post.mockResolvedValue({
        data: { data: { url: 'https://cdn.test/cat.png', content_type: 'image/png' } },
      });
    });

    // Every field is pinned because the controller's success clause matches on all three: an
    // upload missing `type` falls through to the catch-all and 422s on every single attempt.
    it('posts media, type and extension with the contact token, and resolves the hosted url', async () => {
      const file = new File(['bytes'], 'cat.png', { type: 'image/png' });

      const uploaded = await uploadMedia(file, 'image');

      expect(uploaded).toEqual({ url: 'https://cdn.test/cat.png', content_type: 'image/png' });
      const [url, form, options] = mockedAxios.post.mock.calls[0];
      expect(url).toBe(WEB_CHANNEL_UPLOAD);
      expect(form.get('media')).toBe(file);
      expect(form.get('type')).toBe('image');
      expect(form.get('extension')).toBe('png');
      // the org is resolved from this token; a body-supplied org id would be a cross-tenant write
      expect(options.headers.Authorization).toBe('Bearer contact-token');
    });

    it.each(['image', 'audio', 'video', 'document'] as const)(
      'sends %s as a type the controller guard accepts',
      async (type) => {
        await uploadMedia(new File(['bytes'], 'file.bin'), type);

        expect(mockedAxios.post.mock.calls[0][1].get('type')).toBe(type);
      }
    );

    it('sends an empty extension for a file that has none', async () => {
      await uploadMedia(new File(['bytes'], 'scan', { type: 'application/pdf' }), 'document');

      expect(mockedAxios.post.mock.calls[0][1].get('extension')).toBe('');
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

  // The server matches documents by substring on the content type, and the long
  // `application/vnd.openxmlformats-…` types docx and xlsx arrive as contain neither "docx" nor
  // the backend's "xlxs" — offering them would only produce a 415 after the picker.
  describe('UPLOAD_ACCEPT', () => {
    it('offers no document type the server would refuse', () => {
      expect(UPLOAD_ACCEPT).toContain('application/pdf');
      expect(UPLOAD_ACCEPT).not.toContain('openxmlformats');
      expect(UPLOAD_ACCEPT).not.toContain('.docx');
      expect(UPLOAD_ACCEPT).not.toContain('.xlsx');
    });
  });

  describe('uploadErrorMessage', () => {
    it.each([
      ['file_too_large', 413],
      ['unsupported_type', 415],
      ['upload_failed', 422],
      ['unauthorized', 401],
      ['web_channel_disabled', 404],
    ])('renders its own copy for %s, never the server prose', (code, status) => {
      const message = uploadErrorMessage(uploadError(code, status));

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
