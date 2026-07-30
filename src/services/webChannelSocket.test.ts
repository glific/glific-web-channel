import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  connectAndJoin,
  pushNewMessage,
  pushLoadMore,
  pushUpdateName,
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

    // Socket constructed with token as a connect param
    expect(SocketMock).toHaveBeenCalledWith(expect.any(String), { params: { token: 'my-token' } });
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

  it('pushUpdateName pushes the new name and resolves on ok', async () => {
    mockChannel.push.mockReturnValue(makeReceiver({ ok: {} }));

    await pushUpdateName(mockChannel as any, 'New Name');

    expect(mockChannel.push).toHaveBeenCalledWith('update_name', { name: 'New Name' });
  });

  it('disconnect leaves the channel and disconnects the socket', () => {
    disconnect(mockSocket as any, mockChannel as any);

    expect(mockChannel.leave).toHaveBeenCalled();
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });
});
