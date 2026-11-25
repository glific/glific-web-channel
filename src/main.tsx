import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './index.css';
import App from './App.tsx';
import { loadBranding } from '@/services/branding';
import { restoreExpiredSession } from '@/services/webChannelAuth';
import { captureTriggerKeywords } from '@/lib/triggerKeywords';
import { initPostHog, initSentry } from '@/lib/telemetry';
import { whenShown } from '@/lib/whenShown';
import { BrandingUnavailable } from '@/components/branding/BrandingUnavailable';

// Branding resolves BEFORE the first render, so the org's accent is already on :root by the
// time anything paints — otherwise every load flashes the default near-black primary first.
//
// If it could not be fetched at all we render an error page rather than the app: falling back to
// the default palette would serve a Glific-looking page under the NGO's own domain, which reads
// as the wrong organisation rather than as a failure.
//
// The same page shows when an expired session could not be renewed because the server never
// answered: rendering the app would let the route guards sign out a contact the server may still
// accept, and "Try again" reloads with the session kept.
const bootstrap = async () => {
  // In this order, so PostHog's first pageview cannot record a link's ?text=/?start=.
  captureTriggerKeywords();
  void initSentry();
  void initPostHog();

  const [status, restore] = await Promise.all([loadBranding(), restoreExpiredSession()]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {status === 'unavailable' || restore === 'unreachable' ? (
        <BrandingUnavailable />
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </StrictMode>,
  );
};

whenShown(() => void bootstrap());
