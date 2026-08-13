import { MapPin } from 'lucide-react';

import { InteractiveMessage } from '@/components/chat/InteractiveMessage';
import { cn } from '@/lib/utils';
import { formatShortTime, whatsappToJsx } from '@/lib/whatsapp';
import type { BlocksResponse, InteractiveContent, WebChannelMessage } from '@/services/webChannelSocket';

export interface MessageBubbleProps {
  message: WebChannelMessage;
  // reply to a tapped interactive option; routed through the composer's optimistic send path
  onInteractiveReply?: (title: string) => void;
  // structured answer to a blocks message (contract §4) — a separate path from the text reply
  onBlocksResponse?: (response: BlocksResponse) => Promise<unknown> | void;
}

const MEDIA_TYPES = ['image', 'audio', 'video', 'document'];

// An interactive_content map only counts if it carries a `type` — a plain text message
// arrives with an empty `{}` here.
const asInteractive = (message: WebChannelMessage): InteractiveContent | null => {
  const ic = message.interactive_content;
  if (ic && typeof ic === 'object' && 'type' in ic) return ic as InteractiveContent;
  return null;
};

// Render an audio/video/image/document message from its type + hosted url, plus an optional
// caption. Shared by the user's own sent media and media the flow/staff sends back.
const MediaContent = ({ type, url, caption }: { type: string; url: string; caption?: string }) => (
  <div className="flex flex-col gap-1" data-testid="mediaContent">
    {type === 'image' && <img src={url} alt={caption || 'image'} className="max-h-64 rounded-lg" />}
    {type === 'video' && <video src={url} controls className="max-h-64 rounded-lg" />}
    {type === 'audio' && <audio src={url} controls className="w-64 max-w-full" />}
    {type === 'document' && (
      <a href={url} target="_blank" rel="noreferrer" download className="underline">
        {caption || 'Download file'}
      </a>
    )}
    {caption && type !== 'document' && <span className="whitespace-pre-wrap">{whatsappToJsx(caption)}</span>}
  </div>
);

// A location message: the body is a Google Maps URL.
const LocationContent = ({ url }: { url: string }) => (
  <a
    href={url}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 underline"
    data-testid="locationContent"
  >
    <MapPin className="size-4" /> Location
  </a>
);

// A lean single-conversation bubble in the WhatsApp visual style. Self-contained
// (no staff ChatMessage coupling). Interactive messages (received only) render their own
// header/text + tappable options instead of the plain body.
export const MessageBubble = ({ message, onInteractiveReply, onBlocksResponse }: MessageBubbleProps) => {
  // "inbound" = the end user's own message -> sent (right); "outbound" = from NGO/flow -> received (left)
  // The received-only gate matters for blocks too: the persisted inbound blocks_response
  // also carries interactive_content, and this is what makes it render as its plain summary body.
  const isSent = message.flow === 'inbound';
  const interactive = isSent ? null : asInteractive(message);
  const mediaUrl = message.media?.url;
  const isMedia = !!mediaUrl && !!message.type && MEDIA_TYPES.includes(message.type);
  const isLocation = message.type === 'location' && !!message.body;

  return (
    <div
      className={cn('flex w-full', isSent ? 'justify-end' : 'justify-start')}
      data-testid="webChannelMessage"
    >
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          isSent
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-card text-card-foreground ring-1 ring-foreground/10'
        )}
      >
        <div className="break-words whitespace-pre-wrap" data-testid="content">
          {interactive ? (
            <InteractiveMessage
              content={interactive}
              messageId={message.id}
              body={message.body}
              onReply={onInteractiveReply}
              onBlocksResponse={onBlocksResponse}
            />
          ) : isMedia ? (
            <MediaContent type={message.type as string} url={mediaUrl as string} caption={message.body} />
          ) : isLocation ? (
            <LocationContent url={message.body} />
          ) : (
            whatsappToJsx(message.body)
          )}
        </div>
        <span
          className={cn(
            'mt-1 block text-right text-[0.65rem] tabular-nums',
            isSent ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
          data-testid="date"
        >
          {formatShortTime(message.inserted_at)}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;
