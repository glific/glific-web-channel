import { Logo } from '@/components/branding/Logo';
import { getBranding } from '@/services/branding';

// Shown instead of the app when this organisation has not switched the web channel on — either
// /branding answered 404 at boot, or the organisation switched it off while the tab was open.
//
// A page rather than a banner over the sign-in form: the form would take a phone number, send
// nothing, and leave the visitor waiting for a code that is never coming. There is nothing to
// sign in to, so there is no form.
//
// A network failure deliberately does NOT land here — the channel may be perfectly enabled and
// the backend momentarily unreachable, and "not enabled" would be the wrong thing to say. That
// case renders BrandingUnavailable, which offers a retry.
export const WebChannelDisabled = () => {
  const { display_name: displayName } = getBranding();

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      data-testid="webChannelDisabled"
    >
      <Logo size={72} className="border border-border" />
      <div className="text-xl font-bold">Chat is not available</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {displayName} has not switched on chatting in a browser. If you were already in a
        conversation, it has ended here — you can still reach them on WhatsApp.
      </p>
      <p className="text-xs text-muted-foreground">Powered by Glific</p>
    </div>
  );
};

export default WebChannelDisabled;
