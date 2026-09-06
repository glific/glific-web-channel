import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  connectAndJoin,
  getActiveChannel,
  onWebChannelSessionEvent,
  pushNewMessage,
  pushNewMediaMessage,
  pushNewLocationMessage,
  pushRenewToken,
  pushLoadMore,
  disconnect,
} from './webChannelSocket';

// Chainable phoenix `push`/`join` result: receive(event, cb) fires cb when we have a response for `event`.
const makeReceiver = (responses: Record<string, any>) => {
  const chain: any = {
    receive: vi.fn((event: string, cb: (payload?: any) => void) => {
      if (event in responses) cb(responses[event]);
      return chain;
    }),
  };
  return chain;
};

const { mockSocket, mockChannel, SocketMock } = vi.hoisted(() => {
  const mockChannel = {
    on: vi.fn(),
    join: vi.fn(),
    push: vi.fn(),
    leave: vi.fn(),
  };
  const mockSocket = {
    connect: vi.fn(),
    channel: vi.fn(() => mockChannel),
    onOpen: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    disconnect: vi.fn(),
  };
  // must be usable with `new` -> a regular function returning the mock socket
  const SocketMock = vi.fn(function () {
    return mockSocket;
  });
  return { mockSocket, mockChannel, SocketMock };
});

vi.mock('phoenix', () => ({
  Socket: SocketMock,
  Channel: class {},
}));

// A join/push result whose hooks are held rather than fired, so a test can drive the reply — and
// fire it more than once, the way phoenix re-runs the join hooks on every rejoin.
const makeHeldReceiver = () => {
  const hooks: Record<string, (payload?: any) => void> = {};
  const chain: any = {
    receive: vi.fn((event: string, cb: (payload?: any) => void) => {
      hooks[event] = cb;
      return chain;
    }),
  };
  return { chain, reply: (event: string, payload?: any) => hooks[event]?.(payload) };
};

// Fire the server push the channel subscribed to with `channel.on(event, handler)`.
const fireServerPush = (event: string) => {
  const subscription = mockChannel.on.mock.calls.find(([name]: [string]) => name === event);
  subscription?.[1]();
};

describe('webChannelSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connectAndJoin builds the socket with the token, joins the contact topic and resolves initial messages', async () => {
    const initial = [{ id: 1, body: 'hello', flow: 'outbound', inserted_at: '2026-01-01T00:00:00Z' }];
    mockChannel.join.mockReturnValue(makeReceiver({ ok: { messages: initial } }));

    const onNewMessage = vi.fn();
    const result = await connectAndJoin({
      token: 'my-token',
      contactId: 42,
      handlers: { onNewMessage },
    });

    // Socket constructed with a params FUNCTION, which phoenix re-evaluates on every connect
    // attempt. With nothing stored yet it falls back to the token it was handed.
    expect(SocketMock).toHaveBeenCalledWith(expect.any(String), { params: expect.any(Function) });
    const params = SocketMock.mock.calls[0][1].params as () => { token: string | null };
    expect(params()).toEqual({ token: 'my-token' });
    expect(mockSocket.connect).toHaveBeenCalled();
    // joined the correct channel topic
    expect(mockSocket.channel).toHaveBeenCalledWith('web_channel:42', {});
    // wired the new_message listener
    expect(mockChannel.on).toHaveBeenCalledWith('new_message', expect.any(Function));
    // resolved with the initial page
    expect(result.messages).toEqual(initial);
    expect(result.socket).toBe(mockSocket);
    expect(result.channel).toBe(mockChannel);
  });

  it('connectAndJoin rejects when the join replies with error', async () => {
    mockChannel.join.mockReturnValue(makeReceiver({ error: { reason: 'unauthorized' } }));

    await expect(connectAndJoin({ token: 't', contactId: 1 })).rejects.toEqual({ reason: 'unauthorized' });
  });

  it('pushNewMessage pushes the body and resolves on ok', async () => {
    mockChannel.push.mockReturnValue(makeReceiver({ ok: { status: 'sent' } }));

    const reply = await pushNewMessage(mockChannel as any, 'hi there');

    expect(mockChannel.push).toHaveBeenCalledWith('new_message', { body: 'hi there' });
    expect(reply).toEqual({ status: 'sent' });
  });

  it('pushLoadMore pushes the offset and resolves the older page', async () => {
    const older = [{ id: 5, body: 'old', flow: 'inbound', inserted_at: '2025-12-31T00:00:00Z' }];
    mockChannel.push.mockReturnValue(makeReceiver({ ok: { messages: older } }));

    const page = await pushLoadMore(mockChannel as any, 100);

    expect(mockChannel.push).toHaveBeenCalledWith('load_more', { offset: 100 });
    expect(page).toEqual(older);
  });

  it('disconnect leaves the channel and disconnects the socket', () => {
    disconnect(mockSocket as any, mockChannel as any);

    expect(mockChannel.leave).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
  it('pushNewMediaMessage carries only the hosted url, never the bytes', async () => {
    mockChannel.push.mockReturnValue(makeReceiver({ ok: {} }));

    await pushNewMediaMessage(mockChannel as any, {
      type: 'image',
      url: 'https://cdn.test/cat.png',
      content_type: 'image/png',
      caption: 'my cat',
    });

    expect(mockChannel.push).toHaveBeenCalledWith('new_media_message', {
      type: 'image',
      url: 'https://cdn.test/cat.png',
      content_type: 'image/png',
      caption: 'my cat',
    });
  });

  it('pushNewLocationMessage pushes the coordinates', async () => {
    mockChannel.push.mockReturnValue(makeReceiver({ ok: {} }));

    await pushNewLocationMessage(mockChannel as any, { latitude: 12.9, longitude: 77.5 });

    expect(mockChannel.push).toHaveBeenCalledWith('new_location_message', { latitude: 12.9, longitude: 77.5 });
  });

  it('pushRenewToken hands the channel the renewed token', async () => {
    mockChannel.push.mockReturnValue(makeReceiver({ ok: {} }));

    await pushRenewToken(mockChannel as any, 'renewed-token');

    expect(mockChannel.push).toHaveBeenCalledWith('renew_token', { token: 'renewed-token' });
  });

  it('pushRenewToken rejects when the server refuses the token', async () => {
    mockChannel.push.mockReturnValue(makeReceiver({ error: { reason: 'invalid_token' } }));

    await expect(pushRenewToken(mockChannel as any, 'someone-elses-token')).rejects.toEqual({
      reason: 'invalid_token',
    });
  });

  it('exposes the joined channel so the session refresh can renew on it, and forgets it on disconnect', async () => {
    mockChannel.join.mockReturnValue(makeReceiver({ ok: { messages: [] } }));

    await connectAndJoin({ token: 't', contactId: 1 });
    expect(getActiveChannel()).toBe(mockChannel);

    disconnect(mockSocket as any, mockChannel as any);
    expect(getActiveChannel()).toBeNull();
  });

  it('fans the server session pushes out to subscribers until they unsubscribe', async () => {
    mockChannel.join.mockReturnValue(makeReceiver({ ok: { messages: [] } }));
    const listener = vi.fn();
    const unsubscribe = onWebChannelSessionEvent(listener);

    await connectAndJoin({ token: 't', contactId: 1 });
    fireServerPush('token_expiring');
    fireServerPush('session_expired');

    expect(listener).toHaveBeenNthCalledWith(1, 'token_expiring');
    expect(listener).toHaveBeenNthCalledWith(2, 'session_expired');

    unsubscribe();
    fireServerPush('token_expiring');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('closes the socket a failed join left behind, which the caller never received', async () => {
    const join = makeHeldReceiver();
    mockChannel.join.mockReturnValue(join.chain);

    const connecting = connectAndJoin({ token: 't', contactId: 1 });
    join.reply('error', { reason: 'unauthorized' });
    await expect(connecting).rejects.toEqual({ reason: 'unauthorized' });

    // phoenix keeps the socket open and retries the join on its own, so the connection outlives
    // the rejection — but the caller holds no reference to it and can only unmount with nulls.
    join.reply('ok', { messages: [] });
    expect(getActiveChannel()).toBe(mockChannel);

    disconnect(null, null);

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(getActiveChannel()).toBeNull();
  });

  it('re-presents a token renewed since the socket connected when the channel rejoins', async () => {
    const join = makeHeldReceiver();
    mockChannel.join.mockReturnValue(join.chain);
    mockChannel.push.mockReturnValue(makeReceiver({ ok: {} }));
    localStorage.setItem('web_channel_session', JSON.stringify({ token: 'token-at-connect', contactId: 1 }));

    const connecting = connectAndJoin({ token: 'token-at-connect', contactId: 1 });
    join.reply('ok', { messages: [] });
    await connecting;
    expect(mockChannel.push).not.toHaveBeenCalled();

    // A rejoin does not re-run connect/3, so the server is still holding the expiry of the token
    // the socket connected with.
    localStorage.setItem('web_channel_session', JSON.stringify({ token: 'token-after-renewal', contactId: 1 }));
    join.reply('ok', { messages: [] });

    expect(mockChannel.push).toHaveBeenCalledWith('renew_token', { token: 'token-after-renewal' });
    localStorage.clear();
  });

  it('re-reads the stored token on each connect, so a reconnect after a renewal is authorised', async () => {
    localStorage.setItem(
      'web_channel_session',
      JSON.stringify({ token: 'token-at-mount', contactId: 42 })
    );

    mockChannel.join.mockReturnValue(makeReceiver({ ok: { messages: [] } }));
    await connectAndJoin({ token: 'token-at-mount', contactId: 42 });
    const params = SocketMock.mock.calls[0][1].params as () => { token: string | null };
    expect(params()).toEqual({ token: 'token-at-mount' });

    // The silent refresh replaces the stored token while the socket is already open. A phoenix
    // auto-reconnect must present the NEW one — a params object captured at mount would retry
    // forever with the dead token and surface as a permanent "Reconnecting…".
    localStorage.setItem(
      'web_channel_session',
      JSON.stringify({ token: 'token-after-renewal', contactId: 42 })
    );

    expect(params()).toEqual({ token: 'token-after-renewal' });
    localStorage.clear();
  });
});
