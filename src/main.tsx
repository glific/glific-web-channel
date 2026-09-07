import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './index.css';
import App from './App.tsx';
import { loadBranding } from '@/services/branding';
import { BrandingUnavailable } from '@/components/branding/BrandingUnavailable';

// Branding resolves BEFORE the first render, so the org's accent is already on :root by the
// time anything paints — otherwise every load flashes the default near-black primary first.
//
// If it could not be fetched at all we render an error page rather than the app: falling back to
// the default palette would serve a Glific-looking page under the NGO's own domain, which reads
// as the wrong organisation rather than as a failure.
const bootstrap = async () => {
  const status = await loadBranding();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {status === 'unavailable' ? (
        <BrandingUnavailable />
      ) : (
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )}
    </StrictMode>,
  );
};

void bootstrap();
