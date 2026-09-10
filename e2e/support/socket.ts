import type { Page, WebSocketRoute } from '@playwright/test';

/**
 * A stand-in Phoenix server for the chat channel.
 *
 * The chat is unreachable without one: `Chat.tsx` renders "Connecting…" until a join is
 * acknowledged, so every journey below a text message needs a socket that answers. Rather than
 * stand up Phoenix, this speaks its v2 wire format directly — a five element array
 * `[join_ref, ref, topic, event, payload]` — which is a small enough contract to keep honest and
 * lets a test assert on exactly what the widget pushed.
 */
export interface ClientPush {
  event: string;
  payload: Record<string, unknown>;
}

export interface MockPhoenixOptions {
  /** The page of history the join replies with, oldest first. */
  messages?: unknown[];
  /** Reply `{status: "error"}` to these events instead of "ok". */
  failOn?: string[];
}

export interface MockPhoenix {
  /** Everything the widget pushed, in order. Excludes joins and heartbeats. */
  pushes: ClientPush[];
  /** The payloads of one event, for asserting what was sent without index arithmetic. */
  payloadsFor: (event: string) => Record<string, unknown>[];
  /** Wait for the widget to push `event`, and return its payload. */
  waitForPush: (event: string, timeoutMs?: number) => Promise<Record<string, unknown>>;
  /** Push a message from the server, the way an NGO reply arrives. */
  sendToClient: (event: string, payload: unknown) => void;
  /** Start failing an event that was previously accepted, to exercise a retry. */
  failOn: (event: string) => void;
  /** Stop failing it. */
  recover: (event: string) => void;
}

const CHANNEL_TOPIC = /^web_channel:/;

export const mockPhoenix = async (page: Page, options: MockPhoenixOptions = {}): Promise<MockPhoenix> => {
  const pushes: ClientPush[] = [];
  const failing = new Set(options.failOn ?? []);
  let socket: WebSocketRoute | null = null;
  let joinedTopic: string | null = null;

  await page.routeWebSocket(/\/web_socket/, (ws) => {
    socket = ws;

    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));

      const reply = (status: string, response: unknown = {}) =>
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status, response }]));

      // The phoenix client drops the connection if heartbeats go unanswered, which surfaces as a
      // "Reconnecting…" banner midway through an otherwise passing test.
      if (event === 'heartbeat') return reply('ok');

      if (event === 'phx_join') {
        if (CHANNEL_TOPIC.test(topic)) joinedTopic = topic;
        return reply('ok', { messages: options.messages ?? [] });
      }

      if (event === 'phx_leave') return reply('ok');

      pushes.push({ event, payload: payload ?? {} });

      return failing.has(event) ? reply('error', { reason: 'test_failure' }) : reply('ok');
    });
  });

  const payloadsFor = (event: string) => pushes.filter((push) => push.event === event).map((push) => push.payload);

  return {
    pushes,
    payloadsFor,

    waitForPush: async (event, timeoutMs = 5_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = pushes.find((push) => push.event === event);
        if (found) return found.payload;
        await page.waitForTimeout(50);
      }
      throw new Error(
        `The widget never pushed "${event}". It pushed: ${pushes.map((p) => p.event).join(', ') || '(nothing)'}`,
      );
    },

    // join_ref and ref are null on a server-initiated push, which is what distinguishes it from a
    // reply to something the client asked for.
    sendToClient: (event, payload) => {
      if (!socket || !joinedTopic) throw new Error('No channel has joined yet');
      socket.send(JSON.stringify([null, null, joinedTopic, event, payload]));
    },

    failOn: (event) => failing.add(event),
    recover: (event) => failing.delete(event),
  };
};
