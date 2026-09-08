import { expect, test } from '@playwright/test';

import { DARK_ACCENT_ORG, serveBranding } from './support/branding';
import {
  TEST_PHONE,
  countRequests,
  seedSession,
  serveOtpRejected,
  serveOtpRequestError,
  serveOtpRequested,
  serveOtpVerified,
  storedSession,
  submitOtp,
  submitPhone,
} from './support/auth';
import { tokenExpiringIn } from './support/token';

// Branding is fetched before first paint, so every journey below needs it served or the app
// renders its error page instead of the login card.
test.beforeEach(async ({ page }) => {
  await serveBranding(page, DARK_ACCENT_ORG);
});

test.describe('signing in with an OTP', () => {
  test('a beneficiary signs in and lands in the chat', async ({ page }) => {
    await serveOtpRequested(page);
    await serveOtpVerified(page, tokenExpiringIn(3600));

    await page.goto('/login');
    await submitPhone(page);

    // The code step confirms the number back, because request-otp answers identically for a
    // mistyped one and this is the only place the user can catch it.
    await expect(page.getByLabel('Enter the OTP')).toBeVisible();
    await expect(page.getByText(TEST_PHONE)).toBeVisible();

    await submitOtp(page, '123456');

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('webChannelChat')).toBeVisible();
    expect(await storedSession(page)).toMatchObject({ contactId: 42, name: 'Asha' });
  });

  // The server runs ExPhoneNumber and stays the authority, but spending a request — and a slot in
  // a 1-per-30s budget — on a number that cannot possibly be valid would strand the user.
  test('a malformed number never reaches the server', async ({ page }) => {
    const requests = countRequests(page, 'request-otp');
    await serveOtpRequested(page);

    await page.goto('/login');
    await submitPhone(page, '12345');

    await expect(page.getByTestId('phoneError')).toBeVisible();
    expect(requests.count).toBe(0);
  });

  test('the server has the last word on a number the client accepted', async ({ page }) => {
    await serveOtpRequestError(page, 422, 'Phone number is not valid because invalid country code.');

    await page.goto('/login');
    await submitPhone(page, '919820198765');

    // 422 text is already user-facing, so it is shown as sent rather than replaced.
    await expect(page.getByTestId('phoneRequestError')).toContainText('not valid');
    await expect(page.getByLabel('Enter your phone number')).toBeVisible();
  });

  // A 429 means a code WAS sent, just not by this request. Treating it as a failure would leave a
  // live code sitting in the user's WhatsApp with no field on screen to type it into.
  test('being throttled carries the user forward to the code step', async ({ page }) => {
    await serveOtpRequestError(page, 429, 'An OTP was just sent. Please try again in 30 seconds.');

    await page.goto('/login');
    await submitPhone(page);

    await expect(page.getByLabel('Enter the OTP')).toBeVisible();
    await expect(page.getByTestId('otpNotice')).toContainText('just sent');
    await expect(page.getByTestId('phoneRequestError')).toHaveCount(0);
  });

  test('a wrong code leaves them on the login screen with no session', async ({ page }) => {
    await serveOtpRequested(page);
    await serveOtpRejected(page);

    await page.goto('/login');
    await submitPhone(page);
    await submitOtp(page, '000000');

    await expect(page.getByTestId('otpError')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(await storedSession(page)).toBeNull();
  });

  // Every 401 reads the same, so a caller cannot learn from the wording whether a code was ever
  // issued for the number.
  test('the rejection says nothing about why', async ({ page }) => {
    await serveOtpRequested(page);
    await serveOtpRejected(page);

    await page.goto('/login');
    await submitPhone(page);
    await submitOtp(page, '000000');

    const message = await page.getByTestId('otpError').textContent();
    expect(message).toBe('That code is not right. Check it and try again.');
  });

  test('a mistyped number is a correction, not a retype', async ({ page }) => {
    await serveOtpRequested(page);

    await page.goto('/login');
    await submitPhone(page);
    await page.getByTestId('otpBack').click();

    await expect(page.getByLabel('Enter your phone number')).toHaveValue(TEST_PHONE);
  });
});

test.describe('resending a code', () => {
  // The countdown exists to keep the user off the server's 1-per-30s throttle. If it ran short,
  // the button would simply walk them into a 429.
  test('resend is held until the server would accept another request', async ({ page }) => {
    await page.clock.install();
    await serveOtpRequested(page);

    await page.goto('/login');
    await submitPhone(page);

    await expect(page.getByTestId('otpResend')).toBeDisabled();
    await expect(page.getByTestId('otpResend')).toContainText('Resend in 30s');

    await page.clock.runFor('00:35');

    await expect(page.getByTestId('otpResend')).toBeEnabled();
    await expect(page.getByTestId('otpResend')).toContainText('Resend code');
  });

  test('resending asks for a second code and restarts the countdown', async ({ page }) => {
    await page.clock.install();
    const requests = countRequests(page, 'request-otp');
    await serveOtpRequested(page);

    await page.goto('/login');
    await submitPhone(page);

    // Wait for the countdown to actually be on screen before advancing the clock — a jump that
    // lands before React has mounted the interval skips nothing, and the timer then runs in real
    // time for the rest of the test.
    await expect(page.getByTestId('otpResend')).toContainText('Resend in 30s');
    await page.clock.runFor('00:35');
    await expect(page.getByTestId('otpResend')).toBeEnabled();

    await page.getByTestId('otpResend').click();

    await expect(page.getByTestId('otpNotice')).toContainText('another code');
    await expect(page.getByTestId('otpResend')).toBeDisabled();
    expect(requests.count).toBe(2);
  });
});

test.describe('an existing session', () => {
  test('a live token goes straight to the chat', async ({ page }) => {
    await seedSession(page, tokenExpiringIn(3600));

    await page.goto('/login');

    await expect(page).toHaveURL(/\/chat$/);
  });

  // An expired token sent to /chat would join a socket that refuses it, leaving the user watching
  // a chat that never connects rather than a login screen they can act on.
  test('an expired token is discarded, not trusted', async ({ page }) => {
    await seedSession(page, tokenExpiringIn(-60));

    await page.goto('/chat');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('webChannelLogin')).toBeVisible();
    expect(await storedSession(page)).toBeNull();
  });

  test('a token whose expiry cannot be read counts as expired', async ({ page }) => {
    await seedSession(page, 'not.a.jwt');

    await page.goto('/chat');

    await expect(page).toHaveURL(/\/login$/);
  });
});
