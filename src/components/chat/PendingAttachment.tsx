import { useEffect, useState } from 'react';
import { Paperclip, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { PendingMedia } from '@/hooks/useMediaSend';

interface PendingAttachmentProps {
  pending: PendingMedia;
  status?: string;
  disabled: boolean;
  onRemove: () => void;
}

/**
 * The file waiting to be sent, above the composer. A picture is shown as itself, so the contact
 * can see what they are captioning; anything else is shown by name.
 */
export const PendingAttachment = ({ pending, status, disabled, onRemove }: PendingAttachmentProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = pending.type === 'image';

  // An object URL holds the file in memory until revoked, so each one is released with the file.
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(pending.file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [pending.file, isImage]);

  const remove = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="remove attachment"
      data-testid="removeAttachmentButton"
      onClick={onRemove}
      disabled={disabled}
    >
      <X />
    </Button>
  );

  if (isImage && previewUrl) {
    return (
      <div className="flex items-start gap-2" data-testid="pendingAttachment">
        <img
          src={previewUrl}
          alt={pending.file.name}
          data-testid="pendingImagePreview"
          className="max-h-48 max-w-[70%] rounded-xl object-contain ring-1 ring-foreground/10"
        />
        <div className="flex flex-1 flex-col items-end gap-1">
          {remove}
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1" data-testid="pendingAttachment">
      <Paperclip className="size-4 shrink-0" />
      <span className="truncate text-xs" data-testid="pendingAttachmentName">
        {pending.file.name}
      </span>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
      <div className="flex-1" />
      {remove}
    </div>
  );
};
