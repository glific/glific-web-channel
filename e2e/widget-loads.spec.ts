import { expect, test } from '@playwright/test';

import { REAP_BENEFIT, serveTheme } from './support/theme';

test.describe('the widget loads', () => {
  test('an unauthenticated visitor lands on the login screen', async ({ page }) => {
    await serveTheme(page, REAP_BENEFIT);

    await page.goto('/');

    // Every route guard sends an unauthenticated visitor here, so this is the entry point
    // every later journey builds on.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByText('Enter your phone number')).toBeVisible();
    await expect(page.getByTestId('phoneSubmit')).toBeEnabled();
  });

  test('renders on the default palette when the org has the feature flag off', async ({ page }) => {
    // No /theme route is registered, so the request fails outright — the harshest version of
    // the fallback. The widget must still render rather than hang behind the held first paint.
    await page.route('**/api/v1/web_channel/theme', (route) => route.abort());

    await page.goto('/');

    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    await expect(page.getByTestId('orgLogo')).toHaveCount(0);
  });
});
