import axios from 'axios';

import { WEB_CHANNEL_UPLOAD } from '@/config';
import { getWebChannelToken } from '@/services/webChannelAuth';
import type { OutboundMediaType } from '@/services/webChannelSocket';

export interface UploadedMedia {
  url: string;
  content_type: string | null;
}

// Audio is offered whole even though the server refuses ogg: `accept` cannot express an
// exception, and the picker is a hint rather than the authority.
export const UPLOAD_ACCEPT = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx',
].join(',');

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
  storage_unavailable: 'Attachments are not available right now. You can still send a message.',
  upload_failed: 'Upload failed. Please try again.',
};

const GENERIC_UPLOAD_ERROR = 'Upload failed. Please try again.';

// Keyed on the server's `code`, not its `message`: the copy is the widget's, so it can be
// translated later without the server's prose becoming an interface.
export const uploadErrorMessage = (error: unknown): string => {
  const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;

  return (code && UPLOAD_ERRORS[code]) || GENERIC_UPLOAD_ERROR;
};
