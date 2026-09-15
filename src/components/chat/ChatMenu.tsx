import { useEffect } from 'react';
import { Building2, LogOut, User } from 'lucide-react';
import type { ComponentType } from 'react';

interface ChatMenuProps {
  open: boolean;
  onClose: () => void;
  orgName: string;
  contactName?: string;
  contactPhone?: string;
  onAbout: () => void;
  onLogout: () => void;
}

const Row = ({
  icon: Icon,
  label,
  detail,
  danger,
  testId,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  danger?: boolean;
  testId: string;
  onClick?: () => void;
}) => {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      data-testid={testId}
      className="flex w-full items-center gap-4 px-5 py-3.5 text-left enabled:hover:bg-muted"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-destructive/10' : 'bg-primary/10'}`}>
        <Icon className={`size-5 ${danger ? 'text-destructive' : 'text-primary'}`} />
      </span>
      <span className={`flex-1 text-base font-semibold ${danger ? 'text-destructive' : ''}`}>{label}</span>
      {detail && <span className="text-sm text-muted-foreground">{detail}</span>}
    </Tag>
  );
};

// A bottom sheet rather than a dropdown: this is a phone-shaped surface, and the rows are thumb
// targets. Built here rather than on the shared Dialog because that one centres its content and
// the whole point of the shape is that it rises from the bottom edge.
export const ChatMenu = ({
  open,
  onClose,
  orgName,
  contactName,
  contactPhone,
  onAbout,
  onLogout,
}: ChatMenuProps) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" data-testid="chatMenu">
      <button type="button" aria-label="Close menu" data-testid="chatMenuBackdrop" className="flex-1 bg-black/40" onClick={onClose} />

      <div className="mx-auto w-full max-w-md rounded-t-3xl bg-background pt-3 pb-6" role="dialog" aria-label="Menu">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />

        {/* Read-only: there is no endpoint for a contact to change their own name or number, so
            an edit affordance here would lead nowhere. */}
        <Row
          icon={User}
          label={contactName || 'My profile'}
          detail={contactPhone}
          testId="menuProfile"
        />
        <Row icon={Building2} label={`About ${orgName}`} testId="menuAbout" onClick={onAbout} />
        <Row icon={LogOut} label="Log out" danger testId="menuLogout" onClick={onLogout} />
      </div>
    </div>
  );
};
