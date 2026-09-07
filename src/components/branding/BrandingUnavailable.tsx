import { Button } from '@/components/ui/button';

// Shown instead of the app when branding could not be loaded at all.
//
// Deliberately not a silent fall back to the default palette: an org's beneficiaries would then
// see a Glific-looking page under their NGO's domain, which reads as the wrong organisation
// rather than as a failure. Better to say something went wrong and let them retry.
//
// This is distinct from the org not having the web channel enabled — that answers 404, is a
// settled state rather than a transient one, and shows WebChannelDisabledBanner instead.
export const BrandingUnavailable = () => (
  <div
    role="alert"
    className="flex min-h-[100svh] flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center"
    data-testid="brandingUnavailable"
  >
    <div className="text-xl font-semibold">Something went wrong</div>
    <p className="max-w-sm text-sm text-muted-foreground">
      We could not load this page. Check your connection and try again.
    </p>
    <Button data-testid="brandingRetry" onClick={() => window.location.reload()}>
      Try again
    </Button>
  </div>
);
