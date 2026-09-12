import type { Page } from '@playwright/test';

/**
 * The upload handshake, stood in for.
 *
 * Attachments never pass through Glific: the widget asks for a five-minute signed URL and then
 * PUTs the bytes straight to Google. Two hops, two places to fail, and the widget is meant to
 * treat them differently — so they are stubbed separately here.
 */
export const UPLOAD_URL_ROUTE = '**/api/v1/web_channel/upload-url';
export const STORAGE_ROUTE = 'https://storage.googleapis.com/**';

export const HOSTED_URL = 'https://storage.googleapis.com/ngo-bucket/uploads/abc123.png';
const SIGNED_PUT_URL = 'https://storage.googleapis.com/ngo-bucket/uploads/abc123.png?X-Goog-Signature=stub';

/** Count the calls, so a retry can be shown not to re-upload bytes it already stored. */
export interface CallCount {
  count: number;
}

export const stubUploadUrl = (page: Page, contentType = 'image/png'): CallCount => {
  const calls: CallCount = { count: 0 };

  page.route(UPLOAD_URL_ROUTE, (route) => {
    calls.count += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { upload_url: SIGNED_PUT_URL, url: HOSTED_URL, content_type: contentType, expires_in: 300 },
      }),
    });
  });

  return calls;
};

/**
 * The server refusing to sign.
 *
 * `code` is what the widget keys its copy on — deliberately, so the server's prose never becomes
 * the interface — so a test asserting user-facing text has to go through a real code.
 */
export const stubUploadUrlError = (page: Page, code: string, status = 422) =>
  page.route(UPLOAD_URL_ROUTE, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error: { status, code, message: `stubbed ${code}` } }),
    }),
  );

const CORS_HEADERS = { 'access-control-allow-origin': '*' };

// A 1x1 gif, so the <img> the widget renders after a successful upload resolves rather than
// showing a broken icon in the trace.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * Counts uploads only.
 *
 * The hosted url and the signed url share an origin, so once the bubble renders the browser
 * fetches the image back through this same route. Counting every request would make one upload
 * look like two — and the retry tests exist precisely to measure that number.
 */
export const stubStoragePut = (page: Page): CallCount => {
  const calls: CallCount = { count: 0 };

  page.route(STORAGE_ROUTE, (route) => {
    if (route.request().method() !== 'PUT') {
      return route.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL, headers: CORS_HEADERS });
    }

    calls.count += 1;
    return route.fulfill({ status: 200, body: '', headers: CORS_HEADERS });
  });

  return calls;
};

/** Google refusing the bytes. Carries no Glific error envelope, which is the point. */
export const stubStoragePutFailure = (page: Page) =>
  page.route(STORAGE_ROUTE, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 403, body: '<?xml version="1.0"?><Error/>', headers: CORS_HEADERS })
      : route.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL, headers: CORS_HEADERS }),
  );

/** A small real PNG, so the browser reports a genuine type and size. */
export const PNG_FIXTURE = {
  name: 'photo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

export const PDF_FIXTURE = {
  name: 'report.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'),
};
