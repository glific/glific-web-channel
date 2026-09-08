import { expect, test } from '@playwright/test';

import { latestMessageId, readOtpSentTo, seedMessageableContact } from './support/backend';
import { storedSession, submitOtp, submitPhone } from '../support/auth';

/**
 * The OTP journey against a real Glific backend — nothing stubbed.
 *
 * Opt-in (`yarn e2e:live`) and excluded from CI, which has neither Postgres nor Phoenix. See the
 * README for the preconditions; `readOtpSentTo` explains what to check when a run finds no code.
 *
 * The one hop this does not exercise is the last one: Gupshup handing the message to WhatsApp.
 * That needs a real handset and a human reading it, so it stays a manual acceptance check rather
 * than an assertion.
 */

// One number per journey. The backend throttles a phone to one request per 30s, and sharing a
// number between tests would make them fail in whatever order they happened to run.
const SIGN_IN_PHONE = process.env.E2E_PHONE ?? '919999900001';
const WRONG_CODE_PHONE = process.env.E2E_PHONE_ALT ?? '919999900002';

test.describe('signing in against a real backend', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');

    // Fail here, with the cause named, rather than 20s later on a missing message.
    await expect(
      page.getByTestId('webChannelDisabledBanner'),
      'web_channel_enabled is off for this organisation — turn it on before running the live suite',
    ).toHaveCount(0);
    await expect(
      page.getByTestId('webChannelLogin'),
      'the widget could not reach the backend — is it running on https://localhost:4001?',
    ).toBeVisible();
  });

  test('a beneficiary receives a real code and signs in with it', async ({ page }) => {
    await seedMessageableContact(SIGN_IN_PHONE);
    const watermark = await latestMessageId();

    await submitPhone(page, SIGN_IN_PHONE);
    await expect(page.getByLabel('Enter the OTP')).toBeVisible();

    // Minted by Glific.OTP and composed into the message by the real send path.
    const code = await readOtpSentTo(SIGN_IN_PHONE, watermark);
    expect(code).toMatch(/^\d{6}$/);

    await submitOtp(page, code);

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByTestId('webChannelChat')).toBeVisible();

    // A real signed JWT from the backend, not a fixture — the route guard reads its exp.
    const session = await storedSession(page);
    expect(session?.token.split('.')).toHaveLength(3);
    expect(session?.contactId).toEqual(expect.any(Number));
  });

  test('a code the backend never issued is refused', async ({ page }) => {
    await seedMessageableContact(WRONG_CODE_PHONE);

    await submitPhone(page, WRONG_CODE_PHONE);
    await expect(page.getByLabel('Enter the OTP')).toBeVisible();

    await submitOtp(page, '000000');

    await expect(page.getByTestId('otpError')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(await storedSession(page)).toBeNull();
  });

  // The throttle is the only thing standing between a public login box and an organisation's HSM
  // budget, so it is worth one real assertion that it is actually wired.
  test('a second request for the same number inside the window is throttled', async ({ page }) => {
    await seedMessageableContact(SIGN_IN_PHONE);

    const response = page.waitForResponse((candidate) => candidate.url().includes('request-otp'));
    await submitPhone(page, SIGN_IN_PHONE);
    await (await response).finished();

    await page.getByTestId('otpBack').click();
    const throttled = page.waitForResponse((candidate) => candidate.url().includes('request-otp'));
    await page.getByTestId('phoneSubmit').click();

    expect((await throttled).status()).toBe(429);
    // 429 means a code WAS sent, so the widget carries the user forward rather than blocking them.
    await expect(page.getByTestId('otpNotice')).toBeVisible();
  });
});
