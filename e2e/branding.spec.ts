import { expect, test } from '@playwright/test';

import {
  DARK_ACCENT_ORG,
  LIGHT_ACCENT_ORG,
  BRANDING_ROUTE,
  buttonContrast,
  logoFrame,
  rootVar,
  serveBranding,
  serveBrandingDisabled,
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
      await expect(page.getByTestId('phoneSubmit')).toBeVisible();
      await expect(page.getByTestId('orgName')).toHaveText(org.display_name);
      await expect(page.getByTestId('orgLogo')).toHaveAttribute('src', org.logo_url!);
      await expect(page).toHaveTitle(`${org.display_name} — Chat`);
      expect(await rootVar(page, '--primary')).toBe(org.primary_color);
    }

    expect(await rootVar(darkOrg, '--primary')).not.toBe(await rootVar(lightOrg, '--primary'));
  });

  // Whatever an org uploads — landscape wordmark, square mark, tall crest — the frame is the
  // same square, so two orgs' sign-in screens stay visually consistent.
  test('the logo renders in a fixed square frame whatever its aspect ratio', async ({ context }) => {
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

    const { width, height, radius } = await logoFrame(wide);

    expect(Math.round(width)).toBe(Math.round(height));
    // Rounded, but nowhere near a circle — a circle would crop a wordmark to uselessness.
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThan(width / 4);
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
    // goto resolves on `load`, which can fire before the async bootstrap has applied the
    // palette. Wait for something only the render produces before reading :root.
    await expect(prompt.getByTestId('phoneSubmit')).toBeVisible();

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

  // A switched-off channel is a settled state rather than a transient one, so something renders
  // — the disabled page, on the default palette, with no way to sign in.
  test('renders the disabled page when the org has the web channel switched off', async ({ page }) => {
    await serveBrandingDisabled(page, 'Yein Udaan');

    await page.goto('/login');

    await expect(page.getByTestId('disabledOrgName')).toHaveText('Yein Udaan');
    await expect(page.getByTestId('webChannelLogin')).toHaveCount(0);
    // No logo and no monogram: the name is what identifies the org here.
    await expect(page.getByTestId('orgLogo')).toHaveCount(0);
    await expect(page.getByTestId('orgInitials')).toHaveCount(0);
    await expect(page.getByTestId('whatsappLink')).toHaveAttribute('href', 'https://wa.me/919876543210');
    // No chat to mark, so the Glific icon from index.html is removed rather than replaced.
    await expect(page.locator('link[rel="icon"]')).toHaveCount(0);
    // Still resolves to a palette — the default one — rather than leaving :root untouched.
    expect(await rootVar(page, '--primary')).toBe('#119656');
    expect(await rootVar(page, '--primary')).not.toBe(UNTHEMED_PRIMARY);
  });

  // The widget is a standalone site on the org's own subdomain, so the Glific mark shipped in
  // index.html must not survive into an NGO's tab.
  test('the tab icon becomes the org logo, not the one in index.html', async ({ page }) => {
    await serveBranding(page, DARK_ACCENT_ORG);
    await page.goto('/login');
    await expect(page.getByTestId('phoneSubmit')).toBeVisible();

    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href).toBe(DARK_ACCENT_ORG.logo_url);
  });

  // The business profile belongs behind sign-in, on the About screen the chat menu opens. The
  // org's description still carries on the hero, which is what identifies the organisation.
  test('keeps the business profile off the sign-in screen', async ({ page }) => {
    await serveBranding(page, DARK_ACCENT_ORG);
    await page.goto('/login');

    await expect(page.getByTestId('phoneSubmit')).toBeVisible();
    await expect(page.getByTestId('aboutToggle')).toHaveCount(0);
    await expect(page.getByTestId('orgProfile')).toHaveCount(0);
    await expect(page.getByTestId('orgCaption')).toContainText(DARK_ACCENT_ORG.about.description!);
  });
});
