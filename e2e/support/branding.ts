import type { Page } from '@playwright/test';

export interface OrgBranding {
  enabled: true;
  display_name: string;
  whatsapp_number: string | null;
  logo_url: string | null;
  primary_color: string;
  primary_foreground: string;
  secondary_color: string;
  about: {
    description: string | null;
    address: string | null;
    website: string | null;
    email: string | null;
    hours: string | null;
  };
}

export const BRANDING_ROUTE = '**/api/v1/web_channel/branding';

/**
 * Stand in for one org's backend.
 *
 * The org is resolved server-side from the request Host, and the client sends no org
 * identifier — so from the browser's side "which org am I" *is* the /theme response. Serving
 * two different ones to the same build is exactly the two-org case, without two backends.
 */
export const serveBranding = (page: Page, branding: OrgBranding) =>
  page.route(BRANDING_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: branding }),
    }),
  );

/**
 * An org with the web channel switched off.
 *
 * 200, not 404: the endpoint still has the org's name and the WhatsApp number to send a
 * visitor to, and the disabled page is built from them.
 */
export const serveBrandingDisabled = (page: Page, displayName = 'Switched Off NGO') =>
  page.route(BRANDING_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { enabled: false, display_name: displayName, whatsapp_number: '919876543210' },
      }),
    }),
  );

/** Read a custom property off :root as the browser resolved it. */
export const rootVar = (page: Page, name: string) =>
  page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);

// Two fictional orgs, named after what they exercise rather than after any real NGO. Violet is
// a dark primary and Amber a light one, so between them they cover both foreground cases — the
// server computes `primary_foreground`, and these are what it returns for those two colours.
export const DARK_ACCENT_ORG: OrgBranding = {
  enabled: true,
  display_name: 'Violet NGO',
  whatsapp_number: null,
  logo_url: 'https://cdn.example.org/violet.svg',
  primary_color: '#5b21b6',
  primary_foreground: '#fafafa',
  secondary_color: '#eab308',
  about: {
    description: 'Violet NGO runs after-school programmes.',
    address: 'Mumbai, Maharashtra',
    website: 'https://violet.example.org',
    email: 'hello@violet.example.org',
    hours: 'Mon-Fri, 10am-6pm IST',
  },
};

export const LIGHT_ACCENT_ORG: OrgBranding = {
  enabled: true,
  display_name: 'Amber NGO',
  whatsapp_number: null,
  logo_url: 'https://cdn.example.org/amber.svg',
  primary_color: '#ffb900',
  primary_foreground: '#18181b',
  secondary_color: '#5b21b6',
  about: {
    description: null,
    address: null,
    website: null,
    email: null,
    hours: null,
  },
};

/**
 * The WCAG contrast ratio actually rendered on the primary button.
 *
 * Colours are rasterised through a canvas rather than string-compared, because computed custom
 * properties serialise inconsistently (`oklch(0.985 0 0)` can read back as `oklch(98.5% 0 0)`).
 * This measures what the user sees, which is what the acceptance criterion is about.
 */
export const buttonContrast = (page: Page, testId = 'phoneSubmit') =>
  page.evaluate((id) => {
    const toRgb = (cssColour: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = cssColour;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };

    const luminance = (cssColour: string) => {
      const [r, g, b] = toRgb(cssColour)
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const style = getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!);
    const [lighter, darker] = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  }, testId);

/**
 * The logo's rendered box and corner radius.
 *
 * Measured numerically rather than compared against a literal `border-radius`, because
 * Tailwind serialises those unpredictably — `rounded-full` computes to `calc(infinity * 1px)`,
 * which parseFloat reads back as Infinity.
 */
export const logoFrame = async (page: Page) => {
  const logo = page.getByTestId('orgLogo');
  const box = (await logo.boundingBox())!;
  const radius = await logo.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius));

  return { width: box.width, height: box.height, radius };
};
