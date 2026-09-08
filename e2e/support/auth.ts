import type { Page } from '@playwright/test';

/**
 * Stand-ins for the three endpoints in glific#5710.
 *
 * Bodies mirror `GlificWeb.API.V1.WebChannelAuthController` exactly — including the parts that
 * look redundant. `request-otp` answering 200 for a number it has never seen is the property that
 * stops the endpoint enumerating an NGO's beneficiaries, so a fixture that returned 404 for an
 * unknown number would be testing a kinder API than the one that ships.
 */
export const REQUEST_OTP_ROUTE = '**/api/v1/web_channel/request-otp';
export const VERIFY_OTP_ROUTE = '**/api/v1/web_channel/verify-otp';

/** A number that clears the client-side format check, so the server is what answers. */
export const TEST_PHONE = '919820198765';

/** The neutral acknowledgement, whether or not the number is known and whether or not it sent. */
const REQUEST_OTP_MESSAGE = 'If this number is registered on WhatsApp, you will receive a one-time code';

const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const error = (status: number, message: string) => json(status, { error: { status, message } });

export const serveOtpRequested = (page: Page) =>
  page.route(REQUEST_OTP_ROUTE, (route) =>
    route.fulfill(json(200, { data: { phone: TEST_PHONE, message: REQUEST_OTP_MESSAGE } })),
  );

export const serveOtpRequestError = (page: Page, status: number, message: string) =>
  page.route(REQUEST_OTP_ROUTE, (route) => route.fulfill(error(status, message)));

export const serveOtpVerified = (page: Page, token: string, contactId = 42, name = 'Asha') =>
  page.route(VERIFY_OTP_ROUTE, (route) =>
    route.fulfill(json(200, { data: { token, contact_id: contactId, name, phone: TEST_PHONE } })),
  );

/** 401 covers wrong, expired, never-issued and attempt-blocked alike — the widget cannot tell. */
export const serveOtpRejected = (page: Page) =>
  page.route(VERIFY_OTP_ROUTE, (route) => route.fulfill(error(401, 'Invalid OTP')));

/** Count requests without answering them, for asserting a request was never made. */
export const countRequests = (page: Page, pattern: string) => {
  const seen = { count: 0 };
  page.on('request', (request) => {
    if (request.url().includes(pattern)) seen.count += 1;
  });
  return seen;
};

/** Drive the phone step and land on the code step. */
export const submitPhone = async (page: Page, phone = TEST_PHONE) => {
  await page.getByLabel('Enter your phone number').fill(phone);
  await page.getByTestId('phoneSubmit').click();
};

/** Drive the code step. */
export const submitOtp = async (page: Page, otp: string) => {
  await page.getByLabel('Enter the OTP').fill(otp);
  await page.getByTestId('otpSubmit').click();
};

/** The session the widget persists, as the browser sees it. */
export const storedSession = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('web_channel_session');
    return raw ? (JSON.parse(raw) as { token: string; contactId: number; name?: string }) : null;
  });

/** Put a session in place before the app boots, so route guards see it on first render. */
export const seedSession = (page: Page, token: string, contactId = 42, name = 'Asha') =>
  page.addInitScript(
    ([storedToken, storedContactId, storedName]) => {
      localStorage.setItem(
        'web_channel_session',
        JSON.stringify({ token: storedToken, contactId: storedContactId, name: storedName }),
      );
    },
    [token, contactId, name] as const,
  );
