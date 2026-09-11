import { MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatShortTime, whatsappToJsx } from '@/lib/whatsapp';
import type {
  WebChannelInteractiveContent,
  WebChannelInteractiveOption,
  WebChannelMessage,
} from '@/services/webChannelSocket';

export interface MessageBubbleProps {
  message: WebChannelMessage;
  // Tapping an option answers with its title, which is exactly what WhatsApp records for an
  // interactive reply — so the conversation reads the same on either channel.
  onSelectOption?: (title: string) => void;
}

const MEDIA_TYPES = ['image', 'audio', 'video', 'document'];

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

const interactiveOptions = (content: WebChannelInteractiveContent): WebChannelInteractiveOption[] => {
  if (content.type === 'quick_reply') return content.options ?? [];
  // A list's options live one level down, inside its sections; flatten them, since the widget
  // has no room for the two-step "open the list, then choose" flow WhatsApp uses.
  if (content.type === 'list') return (content.items ?? []).flatMap((item) => item.options ?? []);
  return [];
};

const InteractiveContent = ({
  content,
  body,
  onSelectOption,
}: {
  content: WebChannelInteractiveContent;
  body: string;
  onSelectOption?: (title: string) => void;
}) => {
  const options = interactiveOptions(content).filter((option) => !!option.title);
  const text = content.content?.text ?? content.body ?? body;

  return (
    <div className="flex flex-col gap-2" data-testid="interactiveContent">
      {content.content?.header && <span className="font-semibold">{whatsappToJsx(content.content.header)}</span>}
      {content.type === 'list' && content.title && <span className="font-semibold">{content.title}</span>}
      {text && <span className="whitespace-pre-wrap">{whatsappToJsx(text)}</span>}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            // Bordered in the org's decorative colour, never filled with it: it is chosen for looks
            // and nothing guarantees a label stays legible on top.
            <button
              key={option.title}
              type="button"
              data-testid="interactiveOption"
              disabled={!onSelectOption}
              onClick={() => onSelectOption?.(option.title as string)}
              className="rounded-full border-2 border-brand-accent px-4 py-2 text-left text-sm font-semibold hover:bg-brand-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="block">{option.title}</span>
              {option.description && (
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// A lean single-conversation bubble in the WhatsApp visual style. Self-contained
// (no staff ChatMessage coupling: no templates/managed-phone logic).
export const MessageBubble = ({ message, onSelectOption }: MessageBubbleProps) => {
  // "inbound" = the end user's own message -> sent (right); "outbound" = from NGO/flow -> received (left)
  const isSent = message.flow === 'inbound';
  const mediaUrl = message.media?.url;
  const isMedia = !!mediaUrl && !!message.type && MEDIA_TYPES.includes(message.type);
  const isLocation = message.type === 'location' && !!message.body;
  // Only an inbound-to-the-browser interactive message is answerable; the contact's own echoed
  // choice is just text.
  const interactive = !isSent && message.interactive_content?.type ? message.interactive_content : null;

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
            <InteractiveContent content={interactive} body={message.body} onSelectOption={onSelectOption} />
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
