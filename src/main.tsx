import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './index.css';
import App from './App.tsx';
import { getBranding, loadBranding } from '@/services/branding';
import { captureTriggerKeywords } from '@/lib/triggerKeywords';
import { identifyContact, initAnalytics, setAnalyticsOrganization, track } from '@/lib/analytics';
import { initMonitoring, setMonitoringUser } from '@/lib/monitoring';
import { getWebChannelContact, isSessionValid } from '@/services/webChannelAuth';
import { whenShown } from '@/lib/whenShown';
import { BrandingUnavailable } from '@/components/branding/BrandingUnavailable';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Branding resolves BEFORE the first render, so the org's accent is already on :root by the
// time anything paints — otherwise every load flashes the default near-black primary first.
//
// If it could not be fetched at all we render an error page rather than the app: falling back to
// the default palette would serve a Glific-looking page under the NGO's own domain, which reads
// as the wrong organisation rather than as a failure.
const bootstrap = async () => {
  // In this order: analytics and monitoring start only once a link's ?text=/?start= is off the
  // address bar, so the first pageview cannot record what the contact was about to say.
  const link = captureTriggerKeywords();
  void initMonitoring();
  void initAnalytics();
  if (link) track('trigger_link_opened', { kind: link.start ? 'start' : 'text' });

  // A contact still signed in from an earlier visit: Sentry keeps no identity across reloads.
  const contact = isSessionValid() ? getWebChannelContact() : null;
  if (contact) {
    identifyContact(contact.contactId);
    setMonitoringUser(contact.contactId);
  }

  const status = await loadBranding();
  if (status === 'unavailable') track('branding_unavailable_shown');
  else setAnalyticsOrganization(getBranding().display_name);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary fallback={<BrandingUnavailable />}>
        {status === 'unavailable' ? (
          <BrandingUnavailable />
        ) : (
          <BrowserRouter>
            <App />
          </BrowserRouter>
        )}
      </ErrorBoundary>
    </StrictMode>,
  );
};

whenShown(() => void bootstrap());
