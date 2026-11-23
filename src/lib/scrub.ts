import type { Breadcrumb, Event } from '@sentry/react';

// Error reports from the widget are scrubbed before they leave the browser, for the same reason
// analytics is narrow (glific/glific#6195): the people using it are an NGO's beneficiaries. Nothing
// here can recognise free-form message text by its shape, so the rules remove the places it could
// be carried — request bodies, console arguments, link parameters — and mask the identifiers that
// do have a shape: phone numbers, one-time codes and tokens.

const FILTERED = '[Filtered]';

// `text`/`start` carry what a link's contact is about to say; `token` is on the socket's long-poll
// fallback URL; the rest are named for what they hold.
const SENSITIVE_PARAMS = /((?:^|[?&#])(?:text|start|token|phone|otp)=)[^&#\s"']*/gi;

const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;

// Eight or more digits, optionally led by + and split by spaces, dots, dashes or brackets: wide
// enough for any country's mobile number, at the cost of masking the odd date or long id.
const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/g;
const MIN_PHONE_DIGITS = 8;

// Glific's OTPs are six digits.
const OTP = /\b\d{6}\b/g;

// Keys whose values are message content or credentials whatever they look like.
const SENSITIVE_KEYS = new Set([
  'body',
  'text',
  'caption',
  'phone',
  'otp',
  'token',
  'authorization',
  'cookie',
  'arguments',
  'input',
  'request_body',
  'response_body',
]);

const MAX_DEPTH = 6;

export const scrubText = (value: string): string =>
  value
    .replace(SENSITIVE_PARAMS, `$1${FILTERED}`)
    .replace(JWT, '[jwt]')
    .replace(PHONE_LIKE, (match) => (match.replace(/\D/g, '').length >= MIN_PHONE_DIGITS ? '[phone]' : match))
    .replace(OTP, '[code]');

export const scrubValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return FILTERED;

  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? FILTERED : scrubValue(item, depth + 1),
    ])
  );
};

export const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  const scrubbed: Breadcrumb = { ...breadcrumb };

  if (scrubbed.message) scrubbed.message = scrubText(scrubbed.message);

  if (scrubbed.data) {
    // Console arguments and request/response payloads are dropped rather than masked: they are
    // where message text would travel, and nothing can tell it apart from anything else.
    const { arguments: _args, body: _body, request_body: _req, response_body: _res, input: _input, ...rest } =
      scrubbed.data;
    scrubbed.data = scrubValue(rest) as Breadcrumb['data'];
  }

  return scrubbed;
};

/** Mask an outgoing Sentry event (error or transaction) in place of its originals. */
export const scrubEvent = <T extends Event>(event: T): T => {
  const scrubbed: T = { ...event };

  if (scrubbed.message) scrubbed.message = scrubText(scrubbed.message);

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((exception) => ({
        ...exception,
        value: exception.value && scrubText(exception.value),
      })),
    };
  }

  if (scrubbed.request) {
    const { cookies: _cookies, data: _data, query_string: query, ...request } = scrubbed.request;
    // Only a string query is kept: the object and tuple forms would hide a parameter's name from
    // the pattern that filters it.
    scrubbed.request = scrubValue(typeof query === 'string' ? { ...request, query_string: query } : request) as T['request'];
  }

  if (scrubbed.breadcrumbs) scrubbed.breadcrumbs = scrubbed.breadcrumbs.map(scrubBreadcrumb);
  if (scrubbed.extra) scrubbed.extra = scrubValue(scrubbed.extra) as T['extra'];
  if (scrubbed.contexts) scrubbed.contexts = scrubValue(scrubbed.contexts) as T['contexts'];
  if (scrubbed.tags) scrubbed.tags = scrubValue(scrubbed.tags) as T['tags'];
  if (scrubbed.transaction) scrubbed.transaction = scrubText(scrubbed.transaction);

  if (scrubbed.spans) {
    scrubbed.spans = scrubbed.spans.map((span) => ({
      ...span,
      description: span.description && scrubText(span.description),
      data: scrubValue(span.data) as typeof span.data,
    }));
  }

  // The contact id is the only thing a report may say about who hit it.
  scrubbed.user = scrubbed.user?.id !== undefined ? { id: scrubbed.user.id } : undefined;

  return scrubbed;
};
