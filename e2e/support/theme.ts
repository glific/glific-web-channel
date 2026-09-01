import type { Page } from '@playwright/test';

export interface OrgTheme {
  theme: string;
  logo_url: string | null;
  display_name: string;
}

export const THEME_ROUTE = '**/api/v1/web_channel/theme';

/**
 * Stand in for one org's backend.
 *
 * The org is resolved server-side from the request Host, and the client sends no org
 * identifier — so from the browser's side "which org am I" *is* the /theme response. Serving
 * two different ones to the same build is exactly the two-org case, without two backends.
 */
export const serveTheme = (page: Page, theme: OrgTheme) =>
  page.route(THEME_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: theme }) })
  );

/** An org without the `web_channel_enabled` feature flag. */
export const serveThemeNotFound = (page: Page) =>
  page.route(THEME_ROUTE, (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { status: 404, message: 'Web channel is not enabled.' } }),
    })
  );

/** Read a custom property off :root as the browser resolved it. */
export const rootVar = (page: Page, name: string) =>
  page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);

export const REAP_BENEFIT: OrgTheme = {
  theme: 'violet',
  logo_url: 'https://cdn.example.org/reap-benefit.svg',
  display_name: 'Reap Benefit',
};

// A deliberately light accent, so the pair below covers both foreground cases.
export const SUNSHINE_TRUST: OrgTheme = {
  theme: 'amber',
  logo_url: 'https://cdn.example.org/sunshine.svg',
  display_name: 'Sunshine Trust',
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
