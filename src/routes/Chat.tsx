import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { MapPin, Paperclip, Send } from 'lucide-react';
import type { Channel, Socket } from 'phoenix';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { EditName } from '@/components/chat/EditName';
import {
  connectAndJoin,
  disconnect,
  pushLoadMore,
  pushNewMessage,
  pushNewMediaMessage,
  pushNewLocationMessage,
  pushUpdateName,
  type OutboundMediaType,
  type WebChannelMessage,
} from '@/services/webChannelSocket';
import {
  clearWebChannelSession,
  getWebChannelContact,
  getWebChannelToken,
  setWebChannelName,
  uploadMedia,
} from '@/services/webChannelAuth';

const PAGE_SIZE = 100;
// Cap the picked file client-side; the backend's multipart parser also caps at 20 MB.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Map a file's MIME type to the Glific message type used for flow routing.
const mimeToType = (mime: string): OutboundMediaType => {
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'document';
};

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
  const [uploadError, setUploadError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // Send a body as the contact's own inbound message. Shared by the composer and by tapping
  // an interactive option (a tap replies with the option's title — see InteractiveMessage).
  const sendBody = (raw: string) => {
    const body = raw.trim();
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
    requestAnimationFrame(scrollToBottom);

    pushNewMessage(channelRef.current, body).catch(() => {
      // keep the optimistic bubble; the phoenix client auto-reconnects and the message is queued
    });
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    sendBody(draft);
    setDraft('');
  };

  // Append an optimistic inbound bubble instantly, then run the network send. `local` bubbles
  // use a placeholder id so the echo dedupe never collides with a real server id.
  const appendOptimistic = (message: Omit<WebChannelMessage, 'id' | 'flow' | 'inserted_at'>) => {
    const optimistic: WebChannelMessage = {
      ...message,
      id: `local-${Date.now()}`,
      flow: 'inbound',
      inserted_at: new Date().toISOString(),
    };
    seenIds.current.add(String(optimistic.id));
    setMessages((prev) => [...prev, optimistic]);
    requestAnimationFrame(scrollToBottom);
  };

  // Upload a picked file, show it immediately (via a local object URL), then send the message
  // referencing the hosted URL the upload returns.
  const sendFile = async (file: File) => {
    if (!channelRef.current) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError('That file is too large (max 15 MB).');
      return;
    }
    setUploadError(null);

    const type = mimeToType(file.type);
    const caption = draft.trim();
    setDraft('');
    appendOptimistic({ body: caption, type, media: { url: URL.createObjectURL(file) } });

    try {
      const { url, content_type } = await uploadMedia(file);
      await pushNewMediaMessage(channelRef.current, {
        type,
        url,
        content_type,
        filename: file.name,
        caption: caption || undefined,
      });
    } catch {
      setUploadError('Upload failed. Please try again.');
    }
  };

  const sendLocation = () => {
    if (!channelRef.current) return;
    if (!('geolocation' in navigator)) {
      setUploadError('Location is not available in this browser.');
      return;
    }
    setUploadError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        appendOptimistic({ body: `https://www.google.com/maps?q=${latitude},${longitude}`, type: 'location' });
        if (channelRef.current) {
          pushNewLocationMessage(channelRef.current, { latitude, longitude }).catch(() => {
            setUploadError('Could not send your location.');
          });
        }
      },
      () => setUploadError('Could not get your location.')
    );
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
        <EditName name={name} onSave={handleRename} />
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
          <MessageBubble key={message.id} message={message} onInteractiveReply={sendBody} />
        ))}
      </div>

      <footer className="flex flex-col gap-1 border-t px-4 py-3">
        {uploadError && (
          <span className="text-xs text-destructive" data-testid="uploadError">
            {uploadError}
          </span>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="audio/*,video/*,image/*,application/pdf"
            data-testid="fileInput"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) sendFile(file);
              e.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="attach file"
            data-testid="attachButton"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="share location"
            data-testid="locationButton"
            onClick={sendLocation}
          >
            <MapPin />
          </Button>
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
        </div>
      </footer>
    </div>
  );
};

export default Chat;
