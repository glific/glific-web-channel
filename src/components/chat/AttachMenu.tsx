import { useEffect, useRef, type RefObject } from 'react';
import { Camera, FileText, Image, MapPin, type LucideIcon } from 'lucide-react';

export type AttachOption = 'camera' | 'gallery' | 'document' | 'location';

const OPTIONS: { option: AttachOption; label: string; icon: LucideIcon }[] = [
  { option: 'camera', label: 'Camera', icon: Camera },
  { option: 'gallery', label: 'Gallery', icon: Image },
  { option: 'document', label: 'Document', icon: FileText },
  { option: 'location', label: 'Location', icon: MapPin },
];

interface AttachMenuProps {
  onPick: (option: AttachOption) => void;
  /** `returnFocus` is true for Escape, false for a press elsewhere, which has its own target. */
  onClose: (returnFocus: boolean) => void;
  /** The button that toggles the menu: a press on it is its own toggle, not a press outside. */
  toggleRef: RefObject<HTMLElement | null>;
  /** Location while a share is already in flight. */
  disabled?: AttachOption[];
}

/**
 * The options behind the composer's + button, as a panel above the composer the way WhatsApp
 * lays them out. Rendered only while open; closes on Escape or a press anywhere outside it.
 */
export const AttachMenu = ({ onPick, onClose, toggleRef, disabled = [] }: AttachMenuProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(true);
    };
    // A press rather than a click, so the click that opened the menu is over before this listens.
    // Both mouse and touch, because Firefox's touch handling does not always raise pointerdown.
    const onPress = (event: Event) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !toggleRef.current?.contains(target)) onClose(false);
    };
    const PRESS_EVENTS = ['mousedown', 'touchstart'] as const;

    document.addEventListener('keydown', onKeyDown);
    PRESS_EVENTS.forEach((type) => document.addEventListener(type, onPress, { passive: true }));
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      PRESS_EVENTS.forEach((type) => document.removeEventListener(type, onPress));
    };
  }, [onClose, toggleRef]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Attach"
      data-testid="attachMenu"
      className="absolute bottom-full left-4 mb-2 grid grid-cols-4 gap-2 rounded-2xl bg-card p-3 shadow-lg ring-1 ring-foreground/10"
    >
      {OPTIONS.map(({ option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="menuitem"
          data-testid={`attach-${option}`}
          disabled={disabled.includes(option)}
          onClick={() => onPick(option)}
          className="flex min-w-16 flex-col items-center gap-1 rounded-xl p-2 text-xs hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
};
