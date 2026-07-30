import { cn } from '@/lib/utils';
import { formatShortTime, whatsappToJsx } from '@/lib/whatsapp';
import type { WebChannelMessage } from '@/services/webChannelSocket';

export interface MessageBubbleProps {
  message: WebChannelMessage;
}

// A lean single-conversation bubble in the WhatsApp visual style. Self-contained
// (no staff ChatMessage coupling: no templates/options/interactive/managed-phone logic).
export const MessageBubble = ({ message }: MessageBubbleProps) => {
  // "inbound" = the end user's own message -> sent (right); "outbound" = from NGO/flow -> received (left)
  const isSent = message.flow === 'inbound';

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
          {whatsappToJsx(message.body)}
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
