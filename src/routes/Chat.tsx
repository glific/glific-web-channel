import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Send } from 'lucide-react';
import type { Channel, Socket } from 'phoenix';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { EditName } from '@/components/chat/EditName';
import { Logo } from '@/components/branding/Logo';
import {
  connectAndJoin,
  disconnect,
  pushLoadMore,
  pushNewMessage,
  pushUpdateName,
  type WebChannelMessage,
} from '@/services/webChannelSocket';
import {
  clearWebChannelSession,
  getWebChannelContact,
  getWebChannelToken,
  setWebChannelName,
} from '@/services/webChannelAuth';

const PAGE_SIZE = 100;

export const Chat = () => {
  const navigate = useNavigate();
  const contact = getWebChannelContact();
  const token = getWebChannelToken();

  const [messages, setMessages] = useState<WebChannelMessage[]>([]);
  const [name, setName] = useState<string>(contact?.name ?? '');
  const [draft, setDraft] = useState('');
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'reconnecting'>('connecting');
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // track seen ids so an echoed "new_message" push never duplicates an already-rendered message
  const seenIds = useRef<Set<string>>(new Set());

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // open socket + join channel on mount
  useEffect(() => {
    if (!token || !contact) {
      navigate('/login');
      return undefined;
    }

    let active = true;

    connectAndJoin({
      token,
      contactId: contact.contactId,
      handlers: {
        onOpen: () => active && setConnectionState('open'),
        onError: () => active && setConnectionState('reconnecting'),
        onNewMessage: (message) => {
          if (!active) return;
          if (seenIds.current.has(String(message.id))) return;
          seenIds.current.add(String(message.id));
          setMessages((prev) => [...prev, message]);
        },
      },
    })
      .then(({ socket, channel, messages: initial }) => {
        if (!active) {
          disconnect(socket, channel);
          return;
        }
        socketRef.current = socket;
        channelRef.current = channel;
        initial.forEach((m) => seenIds.current.add(String(m.id)));
        setMessages(initial);
        setConnectionState('open');
        setReachedStart(initial.length < PAGE_SIZE);
        // jump to the newest message after the first paint
        requestAnimationFrame(scrollToBottom);
      })
      .catch(() => {
        if (active) setConnectionState('reconnecting');
      });

    return () => {
      active = false;
      disconnect(socketRef.current, channelRef.current);
      socketRef.current = null;
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reverse-infinite scroll: prepend older page when the user scrolls to the top
  const handleScroll = () => {
    const el = listRef.current;
    if (!el || el.scrollTop > 0 || loadingMore || reachedStart || !channelRef.current) return;

    setLoadingMore(true);
    const previousHeight = el.scrollHeight;

    pushLoadMore(channelRef.current, messages.length)
      .then((older) => {
        if (older.length === 0) {
          setReachedStart(true);
          return;
        }
        const fresh = older.filter((m) => !seenIds.current.has(String(m.id)));
        fresh.forEach((m) => seenIds.current.add(String(m.id)));
        setReachedStart(older.length < PAGE_SIZE);
        setMessages((prev) => [...fresh, ...prev]);
        // preserve scroll position across the prepend
        requestAnimationFrame(() => {
          const node = listRef.current;
          if (node) node.scrollTop = node.scrollHeight - previousHeight;
        });
      })
      .finally(() => setLoadingMore(false));
  };

  const handleSend = () => {
    const body = draft.trim();
    if (!body || !channelRef.current) return;

    // optimistic append: show the user's own message instantly.
    // Assumption: the server does NOT echo the contact's own inbound message back over "new_message"
    // (that push is used for outbound/flow replies). The id-based dedupe above is a safety net if it does.
    const optimistic: WebChannelMessage = {
      id: `local-${Date.now()}`,
      body,
      flow: 'inbound',
      inserted_at: new Date().toISOString(),
      type: 'TEXT',
    };
    seenIds.current.add(String(optimistic.id));
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    requestAnimationFrame(scrollToBottom);

    pushNewMessage(channelRef.current, body).catch(() => {
      // keep the optimistic bubble; the phoenix client auto-reconnects and the message is queued
    });
  };

  const handleRename = (newName: string) => {
    setName(newName);
    setWebChannelName(newName);
    if (channelRef.current) {
      pushUpdateName(channelRef.current, newName).catch(() => {
        // best-effort; local state already updated
      });
    }
  };

  const handleLogout = () => {
    disconnect(socketRef.current, channelRef.current);
    clearWebChannelSession();
    navigate('/login');
  };

  return (
    <div className="mx-auto flex h-[100svh] w-full max-w-2xl flex-col bg-background" data-testid="webChannelChat">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Logo className="h-7 max-w-[7rem] shrink-0 object-contain" />
          <EditName name={name} onSave={handleRename} />
        </div>
        <div className="flex items-center gap-3">
          {connectionState !== 'open' && (
            <span className="text-xs text-muted-foreground" data-testid="connectionStatus">
              {connectionState === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        ref={listRef}
        onScroll={handleScroll}
        data-testid="messageList"
      >
        {loadingMore && <div className="py-1 text-center text-xs text-muted-foreground">Loading…</div>}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <footer className="flex items-center gap-2 border-t px-4 py-3">
        <Input
          value={draft}
          placeholder="Type a message"
          data-testid="composerInput"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          size="icon"
          aria-label="send message"
          data-testid="sendButton"
          onClick={handleSend}
          disabled={!draft.trim()}
        >
          <Send />
        </Button>
      </footer>
    </div>
  );
};

export default Chat;
