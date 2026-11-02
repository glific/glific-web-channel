import axios from 'axios';

import { WEB_CHANNEL_UPLOAD } from '@/config';
import { getWebChannelToken } from '@/services/webChannelAuth';
import type { OutboundMediaType } from '@/services/webChannelSocket';

export interface UploadedMedia {
  url: string;
  content_type: string | null;
}

interface SignedUpload {
  upload_url: string;
  url: string;
  content_type: string;
  expires_in: number;
}

// Only the formats WhatsApp itself supports, since these messages reach staff and flows like any
// WhatsApp message would, rather than the server's wildcards: an `image/*` picker also offers HEIC,
// GIF and SVG. Naming JPEG in the picker also makes an iPhone convert a HEIC photo before upload.
// Extensions sit alongside the MIME types because some pickers filter on one, some on the other.
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const VIDEO_TYPES = ['video/mp4', 'video/3gpp'];
// No audio/ogg: the server refuses it. webm is what the voice-note recorder produces on
// Chrome, Firefox and Android, and is only ever recorded, never offered in a picker.
const AUDIO_FILE_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr'];
const RECORDING_TYPES = ['audio/webm', 'audio/mp4'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
const VIDEO_EXTENSIONS = ['.mp4', '.3gp'];
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.amr'];
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];

const SUPPORTED_TYPES = new Set([...PHOTO_TYPES, ...VIDEO_TYPES, ...AUDIO_FILE_TYPES, ...RECORDING_TYPES, ...DOCUMENT_TYPES]);
const SUPPORTED_EXTENSIONS = [...PHOTO_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...DOCUMENT_EXTENSIONS];

// What each attach-menu option offers the picker. Audio files sit under Document, as files the
// contact already has, the way WhatsApp files them.
export const CAMERA_ACCEPT = [...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(',');
export const GALLERY_ACCEPT = [...PHOTO_TYPES, ...VIDEO_TYPES, ...PHOTO_EXTENSIONS, ...VIDEO_EXTENSIONS].join(',');
export const DOCUMENT_ACCEPT = [...DOCUMENT_TYPES, ...AUDIO_FILE_TYPES, ...DOCUMENT_EXTENSIONS, ...AUDIO_EXTENSIONS].join(',');

export const UPLOAD_ACCEPT = [CAMERA_ACCEPT, GALLERY_ACCEPT, DOCUMENT_ACCEPT].join(',');

/** Shown when a file outside the list is picked anyway, e.g. through a picker's "All files". */
export const UNSUPPORTED_FILE_ERROR =
  "That file type can't be sent. You can send JPG or PNG photos, MP4 videos, MP3, M4A or AAC audio, and PDF, Word, Excel or PowerPoint files.";

/**
 * Whether a file is one the widget will send. A picker's `accept` is only a hint — "All files" and
 * drag-and-drop ignore it — so this is checked on every file before it is attached. A file the
 * browser cannot name a type for is judged by its extension instead.
 */
export const isSupportedFile = (file: File): boolean => {
  const type = file.type.split(';')[0].trim().toLowerCase();
  if (type) return SUPPORTED_TYPES.has(type);

  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
};

// Anything the browser cannot name goes as a document: a picker that reports no MIME type is
// still likely to be a file the document branch accepts.
export const mediaTypeFor = (file: File): OutboundMediaType => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
};

// `type` is required by the controller's only success clause and is guarded there against the
// same four names — omitting it falls through to the catch-all 422.
//
// The org is resolved from the bearer token, never from the request: a body-supplied org id
// would let one contact write into another NGO's storage.
const requestSignedUpload = async (file: File, type: OutboundMediaType): Promise<SignedUpload> => {
  const { data } = await axios.post(
    WEB_CHANNEL_UPLOAD,
    { type, content_type: file.type, size: file.size },
    { headers: { Authorization: `Bearer ${getWebChannelToken()}` } }
  );

  return data.data as SignedUpload;
};

// The signature covers host and content-type only, so any header beyond the signed Content-Type
// — an Authorization header above all — makes Google reject the PUT.
const putToStorage = async (file: File, signed: SignedUpload): Promise<void> => {
  try {
    await axios.put(signed.upload_url, file, {
      headers: { 'Content-Type': signed.content_type },
    });
  } catch (cause) {
    // Google's body is not Glific's error envelope, and a CORS failure carries no body at all;
    // both would otherwise reach `uploadErrorMessage` and risk matching a `code` of its own.
    throw new Error('storage_put_failed', { cause });
  }
};

/**
 * Signs an upload, then sends the bytes straight to storage — they never pass through Glific.
 *
 * The signed url is deliberately not held anywhere: it expires in five minutes, so a retry has to
 * be a fresh handshake rather than a second attempt against a url that may already be dead.
 */
export const uploadMedia = async (file: File, type: OutboundMediaType): Promise<UploadedMedia> => {
  const signed = await requestSignedUpload(file, type);

  await putToStorage(file, signed);

  return { url: signed.url, content_type: signed.content_type };
};

const UPLOAD_ERRORS: Record<string, string> = {
  file_too_large: 'That file is too large to send. Please choose a smaller one.',
  unsupported_type: 'That kind of file cannot be sent.',
  // Nothing here routes to the login screen — the session refresh owns that transition — so the
  // copy asks for the one thing the user can do from this screen.
  unauthorized: 'Your session has ended. Refresh the page to sign in again.',
  web_channel_disabled: 'Messaging is not available for this organisation yet.',
  storage_unavailable: 'Attachments are not available right now. You can still send a message.',
  signing_failed: 'Could not start the upload. Please try again.',
  upload_failed: 'Upload failed. Please try again.',
};

const GENERIC_UPLOAD_ERROR = 'Upload failed. Please try again.';

// Keyed on the server's `code`, not its `message`: the copy is the widget's, so it can be
// translated later without the server's prose becoming an interface.
export const uploadErrorMessage = (error: unknown): string => {
  const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;

  return (code && UPLOAD_ERRORS[code]) || GENERIC_UPLOAD_ERROR;
};
