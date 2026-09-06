import axios from 'axios';

import { WEB_CHANNEL_UPLOAD } from '@/config';
import { getWebChannelToken } from '@/services/webChannelAuth';
import type { OutboundMediaType } from '@/services/webChannelSocket';

export interface UploadedMedia {
  url: string;
  content_type: string | null;
}

// The server matches a document by substring against the browser-sent content type, and a docx
// or xlsx arrives as `application/vnd.openxmlformats-…`, which contains neither "docx" nor the
// backend's "xlxs" — so pdf is the only document that gets through today. Offering the others
// would only walk the user into a 415. Audio is offered whole even though the server refuses
// ogg: `accept` cannot express an exception, and the picker is a hint, not the authority.
export const UPLOAD_ACCEPT = 'image/*,video/*,audio/*,application/pdf,.pdf';

// Anything the browser cannot name goes as a document: a picker that reports no MIME type is
// still likely to be a file the document branch accepts.
export const mediaTypeFor = (file: File): OutboundMediaType => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
};

const extensionOf = (filename: string): string =>
  filename.includes('.') ? (filename.split('.').pop() ?? '') : '';

// `type` is required by the controller's only success clause and is guarded there against the
// same four names — omitting it falls through to the catch-all 422.
//
// The org is resolved from the bearer token, never from the request: a body-supplied org id
// would let one contact write into another NGO's storage.
export const uploadMedia = async (file: File, type: OutboundMediaType): Promise<UploadedMedia> => {
  const form = new FormData();
  form.append('media', file);
  form.append('type', type);
  form.append('extension', extensionOf(file.name));

  const { data } = await axios.post(WEB_CHANNEL_UPLOAD, form, {
    headers: { Authorization: `Bearer ${getWebChannelToken()}` },
  });

  return data.data as UploadedMedia;
};

const UPLOAD_ERRORS: Record<string, string> = {
  file_too_large: 'That file is too large to send. Please choose a smaller one.',
  unsupported_type: 'That kind of file cannot be sent.',
  // Nothing here routes to the login screen — the session refresh owns that transition — so the
  // copy asks for the one thing the user can do from this screen.
  unauthorized: 'Your session has ended. Refresh the page to sign in again.',
  web_channel_disabled: 'Messaging is not available for this organisation yet.',
  upload_failed: 'Upload failed. Please try again.',
};

const GENERIC_UPLOAD_ERROR = 'Upload failed. Please try again.';

// Keyed on the server's `code`, not its `message`: the copy is the widget's, so it can be
// translated later without the server's prose becoming an interface.
export const uploadErrorMessage = (error: unknown): string => {
  const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;

  return (code && UPLOAD_ERRORS[code]) || GENERIC_UPLOAD_ERROR;
};
