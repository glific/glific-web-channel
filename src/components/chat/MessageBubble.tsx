import { InteractiveMessage } from '@/components/chat/InteractiveMessage';
import { cn } from '@/lib/utils';
import { formatShortTime, whatsappToJsx } from '@/lib/whatsapp';
import type { InteractiveContent, WebChannelMessage } from '@/services/webChannelSocket';

export interface MessageBubbleProps {
  message: WebChannelMessage;
  // reply to a tapped interactive option; routed through the composer's optimistic send path
  onInteractiveReply?: (title: string) => void;
}

// An interactive_content map only counts if it carries a `type` — a plain text message
// arrives with an empty `{}` here.
const asInteractive = (message: WebChannelMessage): InteractiveContent | null => {
  const ic = message.interactive_content;
  if (ic && typeof ic === 'object' && 'type' in ic) return ic as InteractiveContent;
  return null;
};

// A lean single-conversation bubble in the WhatsApp visual style. Self-contained
// (no staff ChatMessage coupling). Interactive messages (received only) render their own
// header/text + tappable options instead of the plain body.
export const MessageBubble = ({ message, onInteractiveReply }: MessageBubbleProps) => {
  // "inbound" = the end user's own message -> sent (right); "outbound" = from NGO/flow -> received (left)
  const isSent = message.flow === 'inbound';
  const interactive = isSent ? null : asInteractive(message);

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
            <InteractiveMessage content={interactive} onReply={onInteractiveReply} />
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
