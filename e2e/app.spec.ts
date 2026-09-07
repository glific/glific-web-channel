import { expect, test } from '@playwright/test';

import { DARK_ACCENT_ORG, serveBranding, serveBrandingNotFound } from './support/branding';

test.describe('the widget loads', () => {
  test('an unauthenticated visitor lands on the login screen', async ({ page }) => {
    await serveBranding(page, DARK_ACCENT_ORG);

    await page.goto('/');

    // Every route guard sends an unauthenticated visitor here, so this is the entry point
    // every later journey builds on.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByText('Enter your phone number')).toBeVisible();
    await expect(page.getByTestId('phoneSubmit')).toBeEnabled();
  });

  test('tells the visitor when this org has not enabled the web channel', async ({ page }) => {
    await serveBrandingNotFound(page);

    await page.goto('/');

    // Without this the visitor gets a working-looking login screen that can never authenticate
    // them, and no indication why.
    await expect(page.getByTestId('webChannelDisabledBanner')).toBeVisible();
    await expect(page.getByTestId('webChannelDisabledBanner')).toContainText('not enabled');
  });

  // An unreachable backend is neither presented as a disabled channel nor quietly served on the
  // default palette: a Glific-looking page under an NGO's own domain reads as the wrong
  // organisation rather than as a failure.
  test('shows a retryable error when branding cannot be loaded at all', async ({ page }) => {
    await page.route('**/api/v1/web_channel/branding', (route) => route.abort());

    await page.goto('/');

    await expect(page.getByTestId('brandingUnavailable')).toBeVisible();
    await expect(page.getByTestId('brandingRetry')).toBeVisible();
    // Neither the login form nor the disabled banner — this is a transient failure, not a
    // settled state, and not a usable app.
    await expect(page.getByTestId('webChannelLogin')).toHaveCount(0);
    await expect(page.getByTestId('webChannelDisabledBanner')).toHaveCount(0);
  });

  test('retrying recovers once branding is reachable', async ({ page }) => {
    let attempt = 0;
    await page.route('**/api/v1/web_channel/branding', (route) => {
      attempt += 1;
      return attempt === 1
        ? route.abort()
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: DARK_ACCENT_ORG }),
          });
    });

    await page.goto('/');
    await expect(page.getByTestId('brandingUnavailable')).toBeVisible();

    await page.getByTestId('brandingRetry').click();

    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByText(DARK_ACCENT_ORG.display_name)).toBeVisible();
  });
});
