import { Socket, Channel } from 'phoenix';

import { WEB_SOCKET } from '@/config';

// A single tappable option in a quick_reply / list message.
export interface InteractiveOption {
  type?: string;
  title: string;
  description?: string;
}

// The three interactive shapes Glific supports, as they arrive over the socket
// (lowercase `type`, snake_case keys — the raw `interactive_content` map).
export interface QuickReplyContent {
  type: 'quick_reply';
  content: {
    type: string; // "text" | "image" | "video" | "file"
    header?: string;
    text?: string;
    url?: string;
    caption?: string;
    filename?: string;
  };
  options: InteractiveOption[];
}

export interface ListContent {
  type: 'list';
  title?: string;
  body?: string;
  globalButtons?: { type?: string; title: string }[];
  items: { title?: string; subtitle?: string; options: InteractiveOption[] }[];
}

export interface LocationRequestContent {
  type: 'location_request_message';
  body: { type?: string; text: string };
  action?: { name?: string };
}

// The custom UI envelope (contract §3). `props` is opaque to the transport layer — each
// registered renderer knows the shape of its own props. `answered` / `answer_summary` are
// written into the stored content by the backend once a response is accepted, so a reloaded
// history renders the block in its true answered state.
export interface CustomUiContent {
  type: 'custom_ui';
  version?: string;
  component: string;
  props?: Record<string, unknown>;
  fallback?: string;
  context?: Record<string, unknown>;
  answered?: boolean;
  answer_summary?: string | null;
}

export type InteractiveContent =
  | QuickReplyContent
  | ListContent
  | LocationRequestContent
  | CustomUiContent;

// The media payload as it arrives on a message over the socket (the serializer emits `{ url }`;
// content_type is filled in for optimistic bubbles the widget builds locally).
export interface WebChannelMedia {
  url: string;
  content_type?: string | null;
}

// The media message types a browser contact can send inbound (mirrors the backend whitelist).
export type OutboundMediaType = 'image' | 'audio' | 'video' | 'document';

export interface WebChannelMessage {
  id: number | string;
  body: string;
  type?: string;
  // "inbound" = the end user's own message (render right/sent),
  // "outbound" = from the NGO/flow (render left/received).
  flow: 'inbound' | 'outbound';
  inserted_at: string;
  media?: WebChannelMedia | null;
  // Present (and non-empty) only for interactive messages; a plain text message
  // carries an empty object `{}` here, so callers must check for a `type` key.
  interactive_content?: InteractiveContent | Record<string, never> | null;
}

export interface ConnectHandlers {
  // fired for every server "new_message" push (a single message to append)
  onNewMessage?: (message: WebChannelMessage) => void;
  // fired when the server resolves a new display name for the contact (e.g. a flow captured
  // @contact.fields.name mid-session); `name` is null when the contact has no name.
  onContactUpdated?: (name: string | null) => void;
  // socket connection lifecycle — surface a "reconnecting…" state in the UI
  onOpen?: () => void;
  onError?: (error?: unknown) => void;
  onClose?: () => void;
}

export interface ConnectParams {
  token: string;
  contactId: number | string;
  handlers?: ConnectHandlers;
}

export interface WebChannelConnection {
  socket: Socket;
  channel: Channel;
  // initial page of messages returned by the channel join (oldest -> newest)
  messages: WebChannelMessage[];
}

// Open the phoenix socket, join the contact's channel and resolve with the initial messages.
// The phoenix client provides auto-reconnect + heartbeats out of the box.
export const connectAndJoin = ({ token, contactId, handlers = {} }: ConnectParams): Promise<WebChannelConnection> => {
  const socket = new Socket(WEB_SOCKET, { params: { token } });

  if (handlers.onOpen) socket.onOpen(handlers.onOpen);
  if (handlers.onError) socket.onError(handlers.onError);
  if (handlers.onClose) socket.onClose(handlers.onClose);

  socket.connect();

  const channel = socket.channel(`web_channel:${contactId}`, {});

  if (handlers.onNewMessage) {
    channel.on('new_message', (message: WebChannelMessage) => {
      handlers.onNewMessage?.(message);
    });
  }

  if (handlers.onContactUpdated) {
    channel.on('contact_updated', (payload: { name: string | null }) => {
      handlers.onContactUpdated?.(payload?.name ?? null);
    });
  }

  return new Promise((resolve, reject) => {
    channel
      .join()
      .receive('ok', (reply: { messages?: WebChannelMessage[] }) => {
        resolve({ socket, channel, messages: reply?.messages ?? [] });
      })
      .receive('error', (reason: unknown) => {
        reject(reason);
      })
      .receive('timeout', () => {
        reject(new Error('web_channel join timeout'));
      });
  });
};

// push the contact's outgoing message; resolves on the server ":ok" reply
export const pushNewMessage = (channel: Channel, body: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('new_message', { body })
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('new_message timeout')));
  });

// push an already-uploaded media message (audio/video/image/document). The file bytes are NOT
// sent here — they were uploaded via the REST endpoint first; this carries only the hosted url.
export interface OutboundMedia {
  type: OutboundMediaType;
  url: string;
  content_type?: string | null;
  filename?: string;
  caption?: string;
}

export const pushNewMediaMessage = (channel: Channel, media: OutboundMedia): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('new_media_message', media)
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('new_media_message timeout')));
  });

// push the contact's current location (latitude/longitude); resolves on the server ":ok" reply
export const pushNewLocationMessage = (
  channel: Channel,
  coords: { latitude: number; longitude: number }
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('new_location_message', coords)
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('new_location_message timeout')));
  });

// A structured answer to a custom_ui block (contract §4). NOT a text message: `summary` is the
// human-readable string persisted as the message body, `values` is what the flow reads.
export interface CustomUiResponse {
  // the server id of the outbound custom_ui message; the backend guards on `is_integer`, so an
  // optimistic `local-…` id must never reach here
  message_id: number;
  component: string;
  values: Record<string, unknown>;
  summary: string;
  context?: Record<string, unknown>;
}

export const pushCustomUiResponse = (channel: Channel, response: CustomUiResponse): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('custom_ui_response', response)
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('custom_ui_response timeout')));
  });

// request an older page of messages (offset = current message count). Resolves with the page (oldest -> newest).
export const pushLoadMore = (channel: Channel, offset: number): Promise<WebChannelMessage[]> =>
  new Promise((resolve, reject) => {
    channel
      .push('load_more', { offset })
      .receive('ok', (reply: { messages?: WebChannelMessage[] }) => resolve(reply?.messages ?? []))
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('load_more timeout')));
  });

// rename the contact; resolves on the server ":ok" reply
export const pushUpdateName = (channel: Channel, name: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('update_name', { name })
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('update_name timeout')));
  });

// tear down the connection
export const disconnect = (socket: Socket | null, channel: Channel | null): void => {
  if (channel) channel.leave();
  if (socket) socket.disconnect();
};
