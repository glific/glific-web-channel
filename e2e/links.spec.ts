import { expect, test, type Page } from '@playwright/test';

import { DARK_ACCENT_ORG, serveBranding } from './support/branding';
import { seedSession, serveOtpRequested, serveOtpVerified, submitOtp, submitPhone } from './support/auth';
import { tokenExpiringIn } from './support/token';
import { mockPhoenix } from './support/socket';

/**
 * Links an organisation shares to its web chat: `?text=` pre-fills the composer, `?start=` sends a
 * keyword as the contact's message, once. The socket and auth are stubbed; what is real is that the link
 * survives the redirects and the login in between.
 */

const signedIn = async (page: Page) => {
  await serveBranding(page, DARK_ACCENT_ORG);
  await seedSession(page, tokenExpiringIn(3600), 42);
};

test.describe('a ?text= link', () => {
  test('opens the chat with the message in the composer, not sent', async ({ page }) => {
    await signedIn(page);
    const socket = await mockPhoenix(page);

    await page.goto('/?text=I%20want%20to%20volunteer');

    await expect(page.getByTestId('composerInput')).toHaveValue('I want to volunteer');
    expect(page.url()).not.toContain('text=');
    expect(socket.payloadsFor('new_message')).toHaveLength(0);
    await expect(page.getByTestId('webChannelMessage')).toHaveCount(0);
  });

  test('survives signing in first', async ({ page }) => {
    await serveBranding(page, DARK_ACCENT_ORG);
    await serveOtpRequested(page);
    await serveOtpVerified(page, tokenExpiringIn(3600));
    await mockPhoenix(page);

    await page.goto('/?text=Hello');
    await expect(page).toHaveURL(/\/login$/);

    await submitPhone(page);
    await submitOtp(page, '123456');

    await expect(page.getByTestId('composerInput')).toHaveValue('Hello');
  });
});

test.describe('a ?start= link', () => {
  test('starts the flow once the chat opens, and not again on reload', async ({ page }) => {
    await signedIn(page);
    const socket = await mockPhoenix(page);

    await page.goto('/?start=Adopt');

    expect(await socket.waitForPush('new_message')).toEqual({ body: 'adopt' });
    await expect(page.getByTestId('content')).toHaveText('adopt');

    await page.reload();
    await expect(page.getByTestId('connectionStatus')).toHaveText('online');
    await page.waitForTimeout(300);
    expect(socket.payloadsFor('new_message')).toHaveLength(1);
  });

  // The common case for a shared link: the person isn't signed in yet.
  test('starts the flow after signing in first, without the person typing', async ({ page }) => {
    await serveBranding(page, DARK_ACCENT_ORG);
    await serveOtpRequested(page);
    await serveOtpVerified(page, tokenExpiringIn(3600));
    const socket = await mockPhoenix(page);

    await page.goto('/?start=adopt');
    await expect(page).toHaveURL(/\/login$/);
    expect(socket.payloadsFor('new_message')).toHaveLength(0);

    await submitPhone(page);
    await submitOtp(page, '123456');

    expect(await socket.waitForPush('new_message')).toEqual({ body: 'adopt' });
    await expect(page.getByTestId('content')).toHaveText('adopt');
    await expect(page.getByTestId('composerInput')).toHaveValue('');
  });

  test('does not start it again when the same link is opened later', async ({ page }) => {
    await signedIn(page);
    const socket = await mockPhoenix(page);

    await page.goto('/?start=adopt');
    await socket.waitForPush('new_message');

    await page.goto('/?start=adopt');
    await expect(page.getByTestId('connectionStatus')).toHaveText('online');
    await page.waitForTimeout(300);
    expect(socket.payloadsFor('new_message')).toHaveLength(1);
  });

  // A refused send (rate limited, say) is not recorded, so opening the link again tries again.
  test('a keyword the server refuses is tried again the next time the link is opened', async ({ page }) => {
    await signedIn(page);
    const socket = await mockPhoenix(page, { failOn: ['new_message'] });

    await page.goto('/?start=adopt');
    await socket.waitForPush('new_message');
    await expect(page.getByTestId('webChannelMessage')).toHaveCount(0);

    socket.recover('new_message');
    await page.goto('/?start=adopt');

    await expect(page.getByTestId('content')).toHaveText('adopt');
    expect(socket.payloadsFor('new_message')).toHaveLength(2);
  });
});
