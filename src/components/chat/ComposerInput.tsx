import { useLayoutEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

// As many lines as WhatsApp shows before the field scrolls instead of growing.
export const MAX_LINES = 6;

interface ComposerInputProps {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

// A phone's Enter key is the only way to start a new line, so there it does that and the send
// button sends, as in WhatsApp. With a keyboard, Enter sends and Shift+Enter breaks the line.
const enterSends = () => !window.matchMedia?.('(pointer: coarse)').matches;

/**
 * The message field: one line when empty, growing with what is typed up to MAX_LINES, then
 * scrolling within itself so the conversation above keeps its room.
 */
export const ComposerInput = ({ value, placeholder, onChange, onSubmit }: ComposerInputProps) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Measured rather than left to `field-sizing: content`, which Firefox and Safari don't support.
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;

    const style = getComputedStyle(field);
    const lineHeight = parseFloat(style.lineHeight);
    const chrome =
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
    const maxHeight = lineHeight * MAX_LINES + chrome;

    field.style.height = 'auto';
    const fullHeight = field.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    field.style.height = `${Math.min(fullHeight, maxHeight)}px`;
    field.style.overflowY = fullHeight > maxHeight ? 'auto' : 'hidden';
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      data-testid="composerInput"
      aria-label="Message"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && enterSends()) {
          e.preventDefault();
          onSubmit();
        }
      }}
      className={cn(
        'block min-w-0 flex-1 resize-none rounded-2xl border border-input bg-transparent px-3 py-2 text-base leading-6 transition-colors outline-none',
        'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
      )}
    />
  );
};
