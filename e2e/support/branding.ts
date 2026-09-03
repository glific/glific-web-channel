import type { Page } from '@playwright/test';

export interface OrgBranding {
  theme: string;
  logo_url: string | null;
  display_name: string;
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

/** An org without the `web_channel_enabled` feature flag. */
export const serveBrandingNotFound = (page: Page) =>
  page.route(BRANDING_ROUTE, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { status: 404, message: 'Web channel is not enabled.' },
      }),
    }),
  );

/** Read a custom property off :root as the browser resolved it. */
export const rootVar = (page: Page, name: string) =>
  page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);

// Two fictional orgs, named after what they exercise rather than after any real NGO. Violet is
// a dark accent and Amber a light one, so between them they cover both foreground cases.
export const DARK_ACCENT_ORG: OrgBranding = {
  theme: 'violet',
  logo_url: 'https://cdn.example.org/violet.svg',
  display_name: 'Violet NGO',
};

export const LIGHT_ACCENT_ORG: OrgBranding = {
  theme: 'amber',
  logo_url: 'https://cdn.example.org/amber.svg',
  display_name: 'Amber NGO',
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
 * Assert the logo is rendered as a circle.
 *
 * Checked numerically rather than against a literal `border-radius`: Tailwind v4's
 * `rounded-full` computes to `calc(infinity * 1px)`, which serialises as `3.35544e+07px`.
 * A radius of at least half the box, on a square box, is what "circle" actually means.
 */
export const expectCircularLogo = async (page: Page) => {
  const logo = page.getByTestId('orgLogo');
  const box = (await logo.boundingBox())!;
  const radius = await logo.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius));

  return { width: box.width, height: box.height, radius };
};
