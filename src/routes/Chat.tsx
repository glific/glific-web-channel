import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Mic, MoreVertical, Plus, Send, Trash2 } from 'lucide-react';
import type { Channel, Socket } from 'phoenix';

import { Button } from '@/components/ui/button';
import { AttachMenu, type AttachOption } from '@/components/chat/AttachMenu';
import { ComposerInput } from '@/components/chat/ComposerInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { PendingAttachment } from '@/components/chat/PendingAttachment';
import { ChatMenu } from '@/components/chat/ChatMenu';
import { Logo } from '@/components/branding/Logo';
import { getBranding } from '@/services/branding';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useLocationShare, type SharedLocation } from '@/hooks/useLocationShare';
import { useMediaSend } from '@/hooks/useMediaSend';
import { CAMERA_ACCEPT, DOCUMENT_ACCEPT, GALLERY_ACCEPT } from '@/services/webChannelMedia';
import {
  connectAndJoin,
  disconnect,
  pushLoadMore,
  pushNewMessage,
  type OutboundMedia,
  type WebChannelMessage,
} from '@/services/webChannelSocket';
import { clearWebChannelSession, getWebChannelContact, getWebChannelToken } from '@/services/webChannelAuth';

const PAGE_SIZE = 100;

// What the header says under the org's name. The contact is chatting WITH the organisation, so
// the presence shown is the channel's, not their own.
const CONNECTION_LABELS: Record<string, string> = {
  connecting: 'connecting…',
  open: 'online',
  reconnecting: 'reconnecting…',
};

const STATUS_LABELS: Record<string, string> = {
  uploading: 'Uploading…',
  sending: 'Sending…',
};

const formatDuration = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

export const Chat = () => {
  const navigate = useNavigate();
  const contact = getWebChannelContact();
  const token = getWebChannelToken();
  const branding = getBranding();

  const [messages, setMessages] = useState<WebChannelMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [connectionState, setConnectionState] = useState<'connecting' | 'open' | 'reconnecting'>('connecting');
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachButtonRef = useRef<HTMLButtonElement | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  // track seen ids so an echoed "new_message" push never duplicates an already-rendered message
  const seenIds = useRef<Set<string>>(new Set());

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // The contact's own message, rendered once the server has accepted it. Media and location are
  // appended on the ack rather than optimistically: a bubble for a file whose upload then failed
  // would claim something was said that was not.
  const appendLocal = useCallback((message: Omit<WebChannelMessage, 'id' | 'flow' | 'inserted_at'>) => {
    const local: WebChannelMessage = {
      ...message,
      id: `local-${Date.now()}`,
      flow: 'inbound',
      inserted_at: new Date().toISOString(),
    };
    seenIds.current.add(String(local.id));
    setMessages((prev) => [...prev, local]);
    requestAnimationFrame(scrollToBottom);
  }, []);

  const getChannel = useCallback(() => channelRef.current, []);

  const handleMediaSent = useCallback(
    (sent: OutboundMedia) => {
      appendLocal({
        body: sent.caption ?? '',
        type: sent.type,
        media: { url: sent.url, content_type: sent.content_type },
      });
      setDraft('');
    },
    [appendLocal]
  );

  const handleLocationSent = useCallback(
    ({ latitude, longitude }: SharedLocation) =>
      appendLocal({ body: `https://www.google.com/maps?q=${latitude},${longitude}`, type: 'location' }),
    [appendLocal]
  );

  const media = useMediaSend(getChannel, handleMediaSent);
  const location = useLocationShare(getChannel, handleLocationSent);

  // A finished recording is a file like any other, so it takes the same upload-then-send path —
  // including the retry bar, if either half fails.
  const recorder = useAudioRecorder((file: File) => {
    media.attach(file);
    // A voice note can carry a caption like any other attachment: whatever is in the composer
    // when the recording ends is about to be cleared by the send either way.
    void media.send(draft);
  });

  const busy = media.status === 'uploading' || media.status === 'sending';
  const hasContent = !!media.pending || !!draft.trim();

  const closeAttach = useCallback((returnFocus: boolean) => {
    setAttachOpen(false);
    if (returnFocus) attachButtonRef.current?.focus();
  }, []);

  // One file input serves every picker option; each one only changes what the picker offers.
  // `capture` is what makes a phone open its camera instead of the gallery.
  const pickFile = (accept: string, capture = false) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  const handleAttach = (option: AttachOption) => {
    setAttachOpen(false);
    if (option === 'camera') pickFile(CAMERA_ACCEPT, true);
    else if (option === 'gallery') pickFile(GALLERY_ACCEPT);
    else if (option === 'document') pickFile(DOCUMENT_ACCEPT);
    else location.share();
  };
  const composerError = media.error ?? recorder.error ?? location.error;

  // open socket + join channel on mount
  useEffect(() => {
    if (!token || !contact) {
      navigate('/login');
      return undefined;
    }

    let active = true;

    connectAndJoin({
      token,
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

  // An interactive option is answered as ordinary text, the way WhatsApp records one, so nothing
  // downstream — the message row, the staff inbox, a future flow — has to know it came from a tap.
  const handleSelectOption = (title: string) => {
    if (!channelRef.current) return;

    appendLocal({ body: title, type: 'text' });
    pushNewMessage(channelRef.current, title).catch(() => {});
  };

  const handleSend = () => {
    // With a file attached the composer's text is its caption, so the same button sends both.
    if (media.pending) {
      void media.send(draft);
      return;
    }

    const body = draft.trim();
    if (!body || !channelRef.current) return;

    // optimistic append: show the user's own message instantly.
    // Assumption: the server does NOT echo the contact's own inbound message back over "new_message"
    // (that push is used for outbound/flow replies). The id-based dedupe above is a safety net if it does.
    appendLocal({ body, type: 'text' });
    setDraft('');

    pushNewMessage(channelRef.current, body).catch(() => {
      // keep the optimistic bubble; the phoenix client auto-reconnects and the message is queued
    });
  };

  const handleLogout = () => {
    disconnect(socketRef.current, channelRef.current);
    clearWebChannelSession();
    navigate('/login');
  };

  return (
    <div className="mx-auto flex h-[100svh] w-full max-w-2xl flex-col bg-background" data-testid="webChannelChat">
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-brand-foreground">
        {/* The whole identity block, the way WhatsApp opens contact info — a 44px mark and two
            lines of text make a far better thumb target than any icon added beside them. */}
        <button
          type="button"
          aria-label={`About ${branding.display_name}`}
          data-testid="orgDetailsButton"
          onClick={() => navigate('/about')}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:opacity-90"
        >
          <Logo size={44} />
          <div className="min-w-0">
            <div className="truncate font-bold" data-testid="orgName">
              {branding.display_name}
            </div>
            <div className="text-xs text-brand-foreground" data-testid="connectionStatus">
              {CONNECTION_LABELS[connectionState]}
            </div>
          </div>
        </button>
        <button
          type="button"
          aria-label="Menu"
          data-testid="chatMenuButton"
          onClick={() => setMenuOpen(true)}
          className="rounded-full p-1.5 hover:bg-white/10"
        >
          <MoreVertical className="size-5" />
        </button>
      </header>

      <ChatMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        orgName={branding.display_name}
        contactName={contact?.name}
        contactPhone={contact?.phone}
        onAbout={() => {
          setMenuOpen(false);
          navigate('/about');
        }}
        onLogout={handleLogout}
      />

      <div
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        ref={listRef}
        onScroll={handleScroll}
        data-testid="messageList"
      >
        {loadingMore && <div className="py-1 text-center text-xs text-muted-foreground">Loading…</div>}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onSelectOption={handleSelectOption} />
        ))}
      </div>

      <footer className="relative flex flex-col gap-2 border-t px-4 py-3">
        {composerError && (
          <span className="text-xs text-destructive" data-testid="composerError">
            {composerError}
          </span>
        )}

        {media.pending && (
          <PendingAttachment
            pending={media.pending}
            status={STATUS_LABELS[media.status]}
            disabled={busy}
            onRemove={media.discard}
          />
        )}

        {recorder.isRecording ? (
          <div className="flex items-center gap-2" data-testid="recordingBar">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
            <span className="text-sm tabular-nums" data-testid="recordingTimer">
              {formatDuration(recorder.seconds)}
            </span>
            <span className="text-sm text-muted-foreground">Recording…</span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="cancel recording"
              data-testid="cancelRecordingButton"
              onClick={recorder.cancel}
            >
              <Trash2 />
            </Button>
            <Button size="icon" aria-label="send recording" data-testid="sendRecordingButton" onClick={recorder.stop}>
              <Send />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              data-testid="fileInput"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) media.attach(file);
                // cleared so picking the same file again still fires a change event
                e.target.value = '';
              }}
            />
            {attachOpen && (
              <AttachMenu
                onPick={handleAttach}
                onClose={closeAttach}
                toggleRef={attachButtonRef}
                disabled={location.isSharing ? ['location'] : []}
              />
            )}
            <Button
              ref={attachButtonRef}
              variant="ghost"
              size="icon"
              aria-label="attach"
              aria-haspopup="menu"
              aria-expanded={attachOpen}
              data-testid="attachButton"
              onClick={() => setAttachOpen((open) => !open)}
              disabled={busy}
            >
              <Plus />
            </Button>
            <ComposerInput
              value={draft}
              placeholder={media.pending ? 'Add a caption' : 'Type a message'}
              onChange={setDraft}
              onSubmit={handleSend}
            />
            {/* As in WhatsApp: the mic until there is something to send, then Send. */}
            {!hasContent && recorder.isSupported ? (
              <Button
                size="icon"
                aria-label="record voice note"
                data-testid="recordButton"
                onClick={recorder.start}
                disabled={busy}
              >
                <Mic />
              </Button>
            ) : (
              <Button
                size="icon"
                aria-label={media.status === 'failed' ? 'retry sending' : 'send message'}
                data-testid="sendButton"
                onClick={handleSend}
                disabled={busy || !hasContent}
              >
                <Send />
              </Button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
};

export default Chat;
