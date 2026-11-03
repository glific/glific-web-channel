import { useEffect, useRef } from 'react';
import { Camera, FileText, Image, MapPin, type LucideIcon } from 'lucide-react';

export type AttachOption = 'camera' | 'gallery' | 'document' | 'location';

// Fixed colours, as in WhatsApp, rather than the org's: each option is recognised by its colour.
// Every one keeps a white icon above the 3:1 WCAG minimum for non-text graphics.
const OPTIONS: { option: AttachOption; label: string; icon: LucideIcon; colour: string }[] = [
  { option: 'camera', label: 'Camera', icon: Camera, colour: '#d0566c' },
  { option: 'gallery', label: 'Gallery', icon: Image, colour: '#7b59c0' },
  { option: 'document', label: 'Document', icon: FileText, colour: '#5e6bbf' },
  { option: 'location', label: 'Location', icon: MapPin, colour: '#52a06d' },
];

interface AttachMenuProps {
  onPick: (option: AttachOption) => void;
  onClose: () => void;
  /** Location while a share is already in flight. */
  disabled?: AttachOption[];
}

/**
 * The options behind the composer's + button, as a bottom sheet over a dimmed chat. Rendered
 * only while open; closes on Escape or a tap on the dimmed area. Positioned against the nearest
 * positioned ancestor, which is the chat screen.
 */
export const AttachMenu = ({ onPick, onClose, disabled = [] }: AttachMenuProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20" data-testid="attachSheet">
      <div
        className="absolute inset-0 bg-black/30 animate-in fade-in motion-reduce:animate-none"
        data-testid="attachBackdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="menu"
        aria-label="Attach"
        data-testid="attachMenu"
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg animate-in slide-in-from-bottom duration-200 motion-reduce:animate-none"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        <div className="grid grid-cols-4 gap-2">
          {OPTIONS.map(({ option, label, icon: Icon, colour }) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              data-testid={`attach-${option}`}
              disabled={disabled.includes(option)}
              onClick={() => onPick(option)}
              className="flex flex-col items-center gap-2 rounded-xl p-2 text-sm text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            >
              <span
                className="flex size-14 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: colour }}
              >
                <Icon className="size-6" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
