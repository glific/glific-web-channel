import { useId, useState } from 'react';
import { List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import type { WebChannelInteractiveContent, WebChannelInteractiveOption } from '@/services/webChannelSocket';

interface ListMessageProps {
  content: WebChannelInteractiveContent;
  onSelectOption?: (option: WebChannelInteractiveOption) => void;
}

// WhatsApp's own label when a list names no button.
const DEFAULT_BUTTON = 'Select';

/**
 * A list message the way WhatsApp shows one: a single button under the text, which opens a sheet
 * of the list's sections. Each option is a row with its description and a radio; Send answers
 * with the chosen one.
 */
export const ListMessage = ({ content, onSelectOption }: ListMessageProps) => {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<WebChannelInteractiveOption | null>(null);
  const name = useId();

  const buttonLabel = content.globalButtons?.[0]?.title || DEFAULT_BUTTON;
  const sections = (content.items ?? [])
    .map((section) => ({
      ...section,
      options: (section.options ?? []).filter((option) => !!option.title),
    }))
    .filter((section) => section.options.length > 0);

  const openSheet = (next: boolean) => {
    setOpen(next);
    if (!next) setChosen(null);
  };

  const send = () => {
    if (!chosen) return;
    onSelectOption?.(chosen);
    openSheet(false);
  };

  return (
    <>
      <button
        type="button"
        data-testid="listButton"
        disabled={!onSelectOption || sections.length === 0}
        onClick={() => openSheet(true)}
        className="-mx-3 -mb-1 mt-2 flex items-center justify-center gap-2 border-t px-3 pt-2 pb-1 font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <List className="size-4" />
        {buttonLabel}
      </button>

      <Dialog open={open} onOpenChange={openSheet}>
        {/* A sheet from the bottom on a phone, as on WhatsApp; a centred dialog on a wider screen. */}
        <DialogContent
          data-testid="listSheet"
          className="top-auto bottom-0 max-h-[85dvh] max-w-full translate-y-0 gap-0 overflow-hidden rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:max-w-sm sm:-translate-y-1/2 sm:rounded-xl"
        >
          <DialogTitle className="border-b px-4 py-3 text-center font-semibold">{buttonLabel}</DialogTitle>
          <DialogDescription className="sr-only">Choose one option to send</DialogDescription>

          <div className="overflow-y-auto px-4">
            {sections.map((section, index) => (
              <fieldset key={`${section.title}-${index}`} className="border-b py-2 last:border-b-0">
                {section.title && (
                  <legend className="pt-2 text-xs font-semibold text-primary" data-testid="listSection">
                    {section.title}
                  </legend>
                )}
                {section.options.map((option) => (
                  <label
                    key={option.title}
                    data-testid="listOption"
                    className="flex cursor-pointer items-center gap-3 py-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm">{option.title}</span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      )}
                    </span>
                    <input
                      type="radio"
                      name={name}
                      checked={chosen === option}
                      onChange={() => setChosen(option)}
                      className="size-4 shrink-0 accent-primary"
                    />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-none p-3">
            <Button data-testid="listSend" disabled={!chosen} onClick={send} className="w-full">
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
