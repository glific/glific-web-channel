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

  test('does not claim the channel is off when the backend is merely unreachable', async ({ page }) => {
    await page.route('**/api/v1/web_channel/branding', (route) => route.abort());

    await page.goto('/');

    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByTestId('webChannelDisabledBanner')).toHaveCount(0);
  });

  test('renders on the default palette when the org has the feature flag off', async ({ page }) => {
    // No /branding route is registered, so the request fails outright — the harshest version of
    // the fallback. The widget must still render rather than hang behind the held first paint.
    await page.route('**/api/v1/web_channel/branding', (route) => route.abort());

    await page.goto('/');

    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByTestId('orgLogo')).toHaveCount(0);
  });
});
