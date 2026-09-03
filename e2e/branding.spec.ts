import { expect, test } from '@playwright/test';

import { THEMES } from '../src/services/themes';
import {
  DARK_ACCENT_ORG,
  LIGHT_ACCENT_ORG,
  BRANDING_ROUTE,
  buttonContrast,
  expectCircularLogo,
  rootVar,
  serveBranding,
  serveBrandingNotFound,
} from './support/branding';

// WCAG AA for normal-size text. Button labels are normal-size.
const AA_NORMAL_TEXT = 4.5;

// index.css authors this as `oklch(0.205 0 0)` and Tailwind emits it as a percentage, which is
// what getComputedStyle reports back. Runtime-set values round-trip verbatim instead, so seeing
// this form means nothing was ever written onto :root.
const UNTHEMED_PRIMARY = 'oklch(20.5% 0 0)';

test.describe('per-org theming', () => {
  // One browser context, one deployment, two tabs — each routed to a different org's /branding.
  // That is the production arrangement: the bundle is identical and only the response differs.
  test('two orgs render their own branding from one build', async ({ context }) => {
    const darkOrg = await context.newPage();
    await serveBranding(darkOrg, DARK_ACCENT_ORG);
    await darkOrg.goto('/login');

    const lightOrg = await context.newPage();
    await serveBranding(lightOrg, LIGHT_ACCENT_ORG);
    await lightOrg.goto('/login');

    for (const [page, org] of [
      [darkOrg, DARK_ACCENT_ORG],
      [lightOrg, LIGHT_ACCENT_ORG],
    ] as const) {
      await expect(page.getByText(org.display_name)).toBeVisible();
      await expect(page.getByTestId('orgLogo')).toHaveAttribute('src', org.logo_url!);
      await expect(page).toHaveTitle(`${org.display_name} — Chat`);
      expect(await rootVar(page, '--primary')).toBe(THEMES[org.theme as keyof typeof THEMES].primary);
    }

    expect(await rootVar(darkOrg, '--primary')).not.toBe(await rootVar(lightOrg, '--primary'));
  });

  // Whatever an org uploads — landscape wordmark, square mark, tall crest — the frame is the
  // same circle, so two orgs' login cards stay visually consistent.
  test('the logo renders as a circle whatever its aspect ratio', async ({ context }) => {
    const wide = await context.newPage();
    await serveBranding(wide, DARK_ACCENT_ORG);
    await wide.route('https://cdn.example.org/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80"><rect width="600" height="80" fill="#7b1fa2"/></svg>',
      }),
    );
    await wide.goto('/login');

    const { width, height, radius } = await expectCircularLogo(wide);

    expect(Math.round(width)).toBe(Math.round(height));
    expect(radius).toBeGreaterThanOrEqual(width / 2);
    // Contained, not cropped — a 600x80 wordmark must not have its sides cut off.
    await expect(wide.getByTestId('orgLogo')).toHaveCSS('object-fit', 'contain');
  });

  // Amber is deliberately light and Violet deliberately dark, so this covers both directions:
  // dark text on a pale button, and light text on a saturated one.
  test('button text stays legible on both a light and a dark theme', async ({ context }) => {
    for (const org of [LIGHT_ACCENT_ORG, DARK_ACCENT_ORG]) {
      const page = await context.newPage();
      await serveBranding(page, org);
      await page.goto('/login');
      await expect(page.getByTestId('phoneSubmit')).toBeVisible();

      expect(await buttonContrast(page)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  test('there is no flash of the default palette before the accent lands', async ({ context }) => {
    const prompt = await context.newPage();
    await serveBranding(prompt, LIGHT_ACCENT_ORG);
    await prompt.goto('/login');
    const settled = await rootVar(prompt, '--primary');
    expect(settled).not.toBe(UNTHEMED_PRIMARY);

    // Delay /branding well past the point the app would otherwise have painted. Because first
    // paint is held behind the fetch, the accent must already be final the moment anything is
    // on screen — not merely arrive shortly afterwards.
    const slow = await context.newPage();
    await slow.route(BRANDING_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: LIGHT_ACCENT_ORG }),
      });
    });

    await slow.goto('/login', { waitUntil: 'commit' });

    await expect(slow.getByTestId('phoneSubmit')).toBeVisible();
    expect(await rootVar(slow, '--primary')).toBe(settled);
  });

  test('falls back to the default theme when the org has no web channel', async ({ page }) => {
    await serveBrandingNotFound(page);

    await page.goto('/login');

    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByTestId('orgLogo')).toHaveCount(0);
    // A 404 still resolves to a theme — the default one — rather than leaving :root untouched.
    expect(await rootVar(page, '--primary')).toBe(THEMES.zinc.primary);
    expect(await rootVar(page, '--primary')).not.toBe(UNTHEMED_PRIMARY);
  });
});
