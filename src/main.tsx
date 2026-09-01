import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './index.css';
import App from './App.tsx';
import { loadTheme } from '@/services/theme';

// The theme resolves BEFORE the first render, so the org's accent is already on :root by the
// time anything paints — otherwise every load flashes the default near-black primary first.
// A failed or 404'd fetch leaves the default palette in place and still renders.
const bootstrap = async () => {
  await loadTheme();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
};

void bootstrap();
