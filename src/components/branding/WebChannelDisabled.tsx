import { getBranding } from '@/services/branding';

// Shown instead of the app when this organisation has not switched the web channel on — either
// the branding endpoint said so at boot, or the organisation switched it off while the tab was
// open.
//
// A page rather than a banner over the sign-in form: the form would take a phone number, send
// nothing, and leave the visitor waiting for a code that is never coming. There is nothing to
// sign in to, so there is no form — only where to go instead.
//
// No logo: an organisation that never configured the channel never uploaded one, and the name
// is what identifies them here.
//
// A network failure deliberately does NOT land here — the channel may be perfectly enabled and
// the backend momentarily unreachable, and "not enabled" would be the wrong thing to say. That
// case renders BrandingUnavailable, which offers a retry.
export const WebChannelDisabled = () => {
  const { display_name: displayName, whatsapp_number: whatsappNumber } = getBranding();

  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      data-testid="webChannelDisabled"
    >
      <div className="text-2xl font-bold" data-testid="disabledOrgName">
        {displayName}
      </div>

      <p className="max-w-sm text-sm text-muted-foreground">
        {displayName} has not enabled messaging through browser.
        {whatsappNumber ? (
          <>
            {' '}
            You can reach them on WhatsApp at{' '}
            <a
              href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
              data-testid="whatsappLink"
            >
              {whatsappNumber}
            </a>
            .
          </>
        ) : null}
      </p>

      <p className="text-xs text-muted-foreground">Powered by Glific</p>
    </div>
  );
};

export default WebChannelDisabled;
