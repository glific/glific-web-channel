import { Socket, Channel } from 'phoenix';

import { WEB_SOCKET } from '@/config';
import { getWebChannelToken } from '@/services/webChannelAuth';

export interface WebChannelMedia {
  url: string;
  content_type?: string | null;
}

// An interactive template as Glific stores it. Only the parts the widget renders are typed;
// `quick_reply` carries its options flat, `list` nests them under sectioned items.
export interface WebChannelInteractiveOption {
  title?: string;
  description?: string;
}

export interface WebChannelInteractiveContent {
  type?: 'quick_reply' | 'list' | string;
  title?: string;
  body?: string;
  content?: { text?: string; header?: string };
  options?: WebChannelInteractiveOption[];
  items?: { title?: string; subtitle?: string; options?: WebChannelInteractiveOption[] }[];
}

export interface WebChannelMessage {
  id: number | string;
  body: string;
  type?: string;
  // "inbound" = the end user's own message (render right/sent),
  // "outbound" = from the NGO/flow (render left/received).
  flow: 'inbound' | 'outbound';
  inserted_at: string;
  media?: WebChannelMedia | null;
  interactive_content?: WebChannelInteractiveContent | null;
}

// The media types the server accepts on "new_media_message"
export type OutboundMediaType = 'image' | 'audio' | 'video' | 'document';

export interface OutboundMedia {
  type: OutboundMediaType;
  url: string;
  content_type?: string | null;
  caption?: string;
}

// Server pushes about the credential the channel is holding: "token_expiring" while there is
// still time to renew, "session_expired" once the channel has been stopped.
export type WebChannelSessionEvent = 'token_expiring' | 'session_expired';

type SessionEventListener = (event: WebChannelSessionEvent) => void;

export interface ConnectHandlers {
  // fired for every server "new_message" push (a single message to append)
  onNewMessage?: (message: WebChannelMessage) => void;
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

let activeSocket: Socket | null = null;
let activeChannel: Channel | null = null;
const sessionEventListeners = new Set<SessionEventListener>();

// The renewal lives in useSessionRefresh, which is mounted above the route that owns the channel
// and so can neither be handed it as a prop nor be sure it exists yet. This module is the one
// place both sides already reach.
export const getActiveChannel = (): Channel | null => activeChannel;

export const onWebChannelSessionEvent = (listener: SessionEventListener): (() => void) => {
  sessionEventListeners.add(listener);
  return () => {
    sessionEventListeners.delete(listener);
  };
};

const emitSessionEvent = (event: WebChannelSessionEvent) =>
  sessionEventListeners.forEach((listener) => listener(event));

// Open the phoenix socket, join the contact's channel and resolve with the initial messages.
// The phoenix client provides auto-reconnect + heartbeats out of the box.
export const connectAndJoin = ({ token, contactId, handlers = {} }: ConnectParams): Promise<WebChannelConnection> => {
  // A function, not a value: phoenix re-evaluates params on every connect attempt. A captured
  // token would make any auto-reconnect after a renewal retry forever with the replaced one,
  // surfacing as a permanent "Reconnecting…" rather than an auth failure.
  // Recorded because only a socket connect carries the token to the server: a channel rejoin
  // does not re-run connect/3, so the server keeps the expiry of whatever this held.
  let socketToken = token;

  const socket = new Socket(WEB_SOCKET, {
    params: () => {
      socketToken = getWebChannelToken() ?? token;
      return { token: socketToken };
    },
  });

  if (handlers.onOpen) socket.onOpen(handlers.onOpen);
  if (handlers.onError) socket.onError(handlers.onError);
  if (handlers.onClose) socket.onClose(handlers.onClose);

  socket.connect();
  activeSocket = socket;

  const channel = socket.channel(`web_channel:${contactId}`, {});

  if (handlers.onNewMessage) {
    channel.on('new_message', (message: WebChannelMessage) => {
      handlers.onNewMessage?.(message);
    });
  }

  channel.on('token_expiring', () => emitSessionEvent('token_expiring'));
  channel.on('session_expired', () => emitSessionEvent('session_expired'));

  return new Promise((resolve, reject) => {
    channel
      .join()
      // phoenix re-fires this hook on every rejoin, which is what lets a rejoin re-present a
      // token renewed since the socket connected.
      .receive('ok', (reply: { messages?: WebChannelMessage[] }) => {
        activeChannel = channel;

        const stored = getWebChannelToken();
        if (stored && stored !== socketToken) pushRenewToken(channel, stored).catch(() => {});

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

// push an already-uploaded file. The bytes went over the REST upload endpoint; this carries the
// hosted url only.
export const pushNewMediaMessage = (channel: Channel, media: OutboundMedia): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('new_media_message', media)
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('new_media_message timeout')));
  });

// push the contact's coordinates; the server derives the message body from them
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

// Hand the channel a renewed token. Without this the channel keeps the expiry it read at join and
// its sweep expires a session the client has already renewed.
export const pushRenewToken = (channel: Channel, token: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    channel
      .push('renew_token', { token })
      .receive('ok', resolve)
      .receive('error', reject)
      .receive('timeout', () => reject(new Error('renew_token timeout')));
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

// Falls back to the live connection when handed nothing: a caller whose join rejected never
// received the socket, but phoenix is still holding it open and retrying, so this is the only
// way it gets closed.
export const disconnect = (socket: Socket | null, channel: Channel | null): void => {
  const closingChannel = channel ?? activeChannel;
  const closingSocket = socket ?? activeSocket;

  if (closingChannel) {
    if (closingChannel === activeChannel) activeChannel = null;
    closingChannel.leave();
  }

  if (closingSocket) {
    if (closingSocket === activeSocket) activeSocket = null;
    closingSocket.disconnect();
  }
};
