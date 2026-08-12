import { useState } from 'react';
import { List, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CustomUiBlock } from '@/components/chat/customUi/CustomUiBlock';
import { whatsappToJsx } from '@/lib/whatsapp';
import type {
  CustomUiResponse,
  InteractiveContent,
  ListContent,
  LocationRequestContent,
  QuickReplyContent,
} from '@/services/webChannelSocket';

// Renders an interactive message (quick_reply / list / location_request_message) for a
// received (flow="outbound") bubble. A tap sends the chosen option's title back as a plain
// text reply via `onReply` — that is exactly the field the flow router matches on (mirrors how
// WhatsApp interactive replies arrive as body=title), so no structured payload is needed.
//
// `onReply` is the same optimistic send path the composer uses. Once the user has replied we
// disable the controls locally so a second tap can't advance the flow twice (the widget user,
// unlike the read-only staff view, can actually click).
//
// A `custom_ui` envelope is the exception: it is rendered by CustomUiBlock and answered with a
// structured `custom_ui_response` push (contract §4) via `onCustomUiResponse` — NOT a text
// reply — which is why it needs the message id.
export interface InteractiveMessageProps {
  content: InteractiveContent;
  messageId: number | string;
  onReply?: (title: string) => void;
  onCustomUiResponse?: (response: CustomUiResponse) => Promise<unknown> | void;
}

export const InteractiveMessage = ({
  content,
  messageId,
  onReply,
  onCustomUiResponse,
}: InteractiveMessageProps) => {
  const [replied, setReplied] = useState(false);

  const reply = (title: string) => {
    if (replied) return;
    setReplied(true);
    onReply?.(title);
  };

  switch (content.type) {
    case 'custom_ui':
      return <CustomUiBlock messageId={messageId} content={content} onRespond={onCustomUiResponse} />;
    case 'quick_reply':
      return <QuickReply content={content} disabled={replied} onSelect={reply} />;
    case 'list':
      return <ListMessage content={content} disabled={replied} onSelect={reply} />;
    case 'location_request_message':
      return <LocationRequest content={content} disabled={replied} onSelect={reply} />;
    default:
      return null;
  }
};

interface RendererProps<T> {
  content: T;
  disabled: boolean;
  onSelect: (title: string) => void;
}

// Optional media header (image inline, everything else as a link) shown above quick-reply text.
const MediaHeader = ({ content }: { content: QuickReplyContent['content'] }) => {
  if (!content.url || content.type === 'text') return null;
  if (content.type === 'image') {
    return (
      <img
        src={content.url}
        alt={content.caption ?? ''}
        className="mb-2 max-h-48 w-full rounded-lg object-cover"
      />
    );
  }
  return (
    <a
      href={content.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-2 block truncate text-xs underline"
    >
      {content.filename || content.caption || content.url}
    </a>
  );
};

const QuickReply = ({ content, disabled, onSelect }: RendererProps<QuickReplyContent>) => (
  <div data-testid="interactiveQuickReply">
    <MediaHeader content={content.content} />
    {content.content.header && (
      <div className="mb-1 font-semibold">{whatsappToJsx(content.content.header)}</div>
    )}
    {content.content.text && (
      <div className="break-words whitespace-pre-wrap">{whatsappToJsx(content.content.text)}</div>
    )}
    {content.content.caption && (
      <div className="mt-1 text-xs opacity-80">{whatsappToJsx(content.content.caption)}</div>
    )}
    <div className="mt-2 flex flex-col gap-1.5">
      {(content.options ?? []).map((option, i) => (
        <Button
          key={`${option.title}-${i}`}
          variant="outline"
          size="sm"
          disabled={disabled}
          className="w-full"
          data-testid="quickReplyOption"
          onClick={() => onSelect(option.title)}
        >
          {option.title}
        </Button>
      ))}
    </div>
  </div>
);

const ListMessage = ({ content, disabled, onSelect }: RendererProps<ListContent>) => {
  const [open, setOpen] = useState(false);
  const globalTitle = content.globalButtons?.[0]?.title || 'Menu';

  const choose = (title: string) => {
    setOpen(false);
    onSelect(title);
  };

  return (
    <div data-testid="interactiveList">
      {content.title && <div className="mb-1 font-semibold">{whatsappToJsx(content.title)}</div>}
      {content.body && (
        <div className="break-words whitespace-pre-wrap">{whatsappToJsx(content.body)}</div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="mt-2 w-full"
            data-testid="listMenuButton"
          >
            <List /> {globalTitle}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{globalTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="flex flex-col gap-4">
              {(content.items ?? []).map((section, si) => (
                <div key={`section-${si}`}>
                  {section.title && (
                    <div className="mb-0.5 text-sm font-semibold">{section.title}</div>
                  )}
                  {section.subtitle && (
                    <div className="mb-1.5 text-xs text-muted-foreground">{section.subtitle}</div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {(section.options ?? []).map((option, oi) => (
                      <button
                        key={`opt-${si}-${oi}`}
                        type="button"
                        className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                        data-testid="listOption"
                        onClick={() => choose(option.title)}
                      >
                        <div className="font-medium">{option.title}</div>
                        {option.description && (
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const LocationRequest = ({ content, disabled, onSelect }: RendererProps<LocationRequestContent>) => {
  const [error, setError] = useState<string | null>(null);

  const share = () => {
    if (!('geolocation' in navigator)) {
      setError('Location is not available in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onSelect(`${pos.coords.latitude}, ${pos.coords.longitude}`),
      () => setError('Could not get your location'),
    );
  };

  return (
    <div data-testid="interactiveLocation">
      {content.body?.text && (
        <div className="break-words whitespace-pre-wrap">{whatsappToJsx(content.body.text)}</div>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        className="mt-2 w-full"
        data-testid="sendLocationButton"
        onClick={share}
      >
        <MapPin /> Send location
      </Button>
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
    </div>
  );
};

export default InteractiveMessage;
