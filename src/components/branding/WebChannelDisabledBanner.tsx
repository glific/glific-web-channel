import { isWebChannelEnabled } from '@/services/branding';

// Shown when /branding returned 404 — this org has not switched the web channel on. Without
// it the visitor sees a fully working-looking login screen that can never authenticate them.
// A network failure deliberately does NOT show this: the channel may be perfectly enabled and
// the backend momentarily unreachable, and telling someone it is "not enabled" would be wrong.
export const WebChannelDisabledBanner = () => {
  if (isWebChannelEnabled()) return null;

  return (
    <div
      role="status"
      className="w-full bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
      data-testid="webChannelDisabledBanner"
    >
      Web channel is not enabled for this organisation.
    </div>
  );
};
