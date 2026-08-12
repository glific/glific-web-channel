import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { whatsappToJsx } from '@/lib/whatsapp';

// The v0 primitive vocabulary the built-in blocks are composed from (contract §6):
// text, image, input, option. Not addressable as components on their own.

// `text` — static copy, rendered with the same WhatsApp markup support as a plain bubble.
export const BlockText = ({ children, className }: { children?: string; className?: string }) => {
  if (!children) return null;
  return (
    <div className={cn('break-words whitespace-pre-wrap', className)} data-testid="customUiText">
      {whatsappToJsx(children)}
    </div>
  );
};

// `image` — url + alt. Decorative by default (alt=""), so the accessible name of an enclosing
// button is the option label alone.
export const BlockImage = ({ url, alt = '', className }: { url?: string; alt?: string; className?: string }) => {
  if (!url) return null;
  return <img src={url} alt={alt} className={cn('w-full rounded-lg object-cover', className)} loading="lazy" />;
};

// `input` — text entry (v0 is text only).
export const BlockInput = ({
  id,
  label,
  placeholder,
  required,
  value,
  disabled,
  testId,
  onChange,
}: {
  id: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  disabled?: boolean;
  testId?: string;
  onChange: (value: string) => void;
}) => (
  <div className="flex flex-col gap-1" data-testid={testId}>
    {label && (
      <Label htmlFor={id} className="text-xs">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
    )}
    <Input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={label || id}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

// `option` — a tappable id + label with an optional image. The label is the button's only text
// content, which makes the accessible name exactly the label.
export const BlockOption = ({
  label,
  image,
  description,
  selected,
  disabled,
  testId,
  className,
  onSelect,
}: {
  label: string;
  image?: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  testId?: string;
  className?: string;
  onSelect: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={selected}
    data-testid={testId}
    className={cn(
      'flex flex-col overflow-hidden rounded-lg border border-border text-left transition-colors',
      'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
      selected && 'border-primary ring-2 ring-primary',
      className
    )}
    onClick={onSelect}
  >
    <BlockImage url={image} className="aspect-square" />
    <span className="px-2 py-1.5 text-sm font-medium">{label}</span>
    {description && <span className="px-2 pb-1.5 text-xs text-muted-foreground">{description}</span>}
  </button>
);

// Shared chrome around every block: the prompt text plus the block's own controls.
export const BlockShell = ({
  testId,
  body,
  children,
}: {
  testId: string;
  body?: string;
  children: ReactNode;
}) => (
  <div data-testid={testId} className="flex flex-col gap-2">
    <BlockText>{body}</BlockText>
    {children}
  </div>
);
