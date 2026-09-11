import { Download, FileText, MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatShortTime, whatsappToJsx } from '@/lib/whatsapp';
import type { WebChannelMessage } from '@/services/webChannelSocket';

export interface MessageBubbleProps {
  message: WebChannelMessage;
}

const MEDIA_TYPES = ['image', 'audio', 'video', 'document'];

const MediaContent = ({ type, url, caption }: { type: string; url: string; caption?: string }) => (
  <div className="flex flex-col gap-1" data-testid="mediaContent">
    {type === 'image' && <img src={url} alt={caption || 'image'} className="max-h-64 rounded-lg" />}
    {type === 'video' && <video src={url} controls className="max-h-64 rounded-lg" />}
    {type === 'audio' && <audio src={url} controls className="w-64 max-w-full" />}
    {type === 'document' && (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        download
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted"
      >
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{caption || 'Document'}</span>
        <Download className="size-4 shrink-0 text-muted-foreground" />
      </a>
    )}
    {caption && type !== 'document' && <span className="whitespace-pre-wrap">{whatsappToJsx(caption)}</span>}
  </div>
);

// The body of a location message is a maps URL, both server-side and for the local bubble.
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
// (no staff ChatMessage coupling: no templates/options/interactive/managed-phone logic).
export const MessageBubble = ({ message }: MessageBubbleProps) => {
  // "inbound" = the end user's own message -> sent (right); "outbound" = from NGO/flow -> received (left)
  const isSent = message.flow === 'inbound';
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
          {isMedia ? (
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
