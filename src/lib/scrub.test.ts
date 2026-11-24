import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

import { scrubBreadcrumb, scrubEvent, scrubText } from '@/lib/scrub';

const PHONE = '919999999999';
const OTP = '123456';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3NyJ9.c2lnbmF0dXJl';

describe('scrubText', () => {
  it('masks phone numbers, bare and formatted', () => {
    expect(scrubText(`no session for ${PHONE}`)).toBe('no session for [phone]');
    expect(scrubText('call +91 99999-99999 now')).toBe('call [phone] now');
  });

  it('leaves short numbers such as status codes and ids alone', () => {
    expect(scrubText('Request failed with status code 401 for contact 77')).toBe(
      'Request failed with status code 401 for contact 77'
    );
  });

  it('masks a six-digit one-time code', () => {
    expect(scrubText(`otp ${OTP} rejected`)).toBe('otp [code] rejected');
  });

  it('masks tokens', () => {
    expect(scrubText(`Bearer ${JWT}`)).toBe('Bearer [jwt]');
  });

  it('filters link and credential parameters out of URLs', () => {
    expect(scrubText('https://web.example.org/chat?text=I%20need%20help&start=hello&lang=hi')).toBe(
      'https://web.example.org/chat?text=[Filtered]&start=[Filtered]&lang=hi'
    );
    expect(scrubText('wss://api.example.org/web_socket/longpoll?vsn=2.0.0&token=abc.def')).toBe(
      'wss://api.example.org/web_socket/longpoll?vsn=2.0.0&token=[Filtered]'
    );
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console arguments and message, which can carry message text', () => {
    const crumb = scrubBreadcrumb({
      category: 'console',
      message: 'Error: hello I need help with my loan',
      data: { arguments: ['Error: hello I need help with my loan'], logger: 'console' },
    });

    expect(crumb.message).toBe('[Filtered]');
    expect(crumb.data).toEqual({ logger: 'console' });
  });

  it('drops the attribute values of a clicked element, such as an image caption', () => {
    const crumb = scrubBreadcrumb({
      category: 'ui.click',
      message: 'div.bubble > img.max-h-64[alt="my son has fever"][title="my son has fever"]',
    });

    expect(crumb.message).toBe('div.bubble > img.max-h-64[alt="[Filtered]"][title="[Filtered]"]');
  });

  it('still masks identifiers in other breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'navigation', message: `to ${PHONE}` }).message).toBe('to [phone]');
  });

  it('keeps an xhr/fetch breadcrumb to its method, status and scrubbed url, never its body', () => {
    const crumb = scrubBreadcrumb({
      category: 'fetch',
      data: {
        method: 'POST',
        url: 'https://api.example.org/api/v1/web_channel/verify-otp?phone=919999999999',
        status_code: 401,
        body: JSON.stringify({ phone: PHONE, otp: OTP }),
        request_body: 'hello',
        response_body: 'world',
      },
    });

    expect(crumb.data).toEqual({
      method: 'POST',
      url: 'https://api.example.org/api/v1/web_channel/verify-otp?phone=[Filtered]',
      status_code: 401,
    });
  });

  it('scrubs a navigation away from a trigger link', () => {
    const crumb = scrubBreadcrumb({ category: 'navigation', data: { from: '/?text=hi%20there', to: '/chat' } });

    expect(crumb.data).toEqual({ from: '/?text=[Filtered]', to: '/chat' });
  });
});

describe('scrubEvent', () => {
  const event = (overrides: Partial<ErrorEvent>): ErrorEvent => ({ type: undefined, ...overrides });

  it('scrubs the exception and message', () => {
    const scrubbed = scrubEvent(
      event({
        message: `verify failed for ${PHONE}`,
        exception: { values: [{ type: 'Error', value: `bad code ${OTP} with ${JWT}` }] },
      })
    );

    expect(scrubbed.message).toBe('verify failed for [phone]');
    expect(scrubbed.exception?.values?.[0].value).toBe('bad code [code] with [jwt]');
  });

  it('removes message text from extra data by key, whatever it looks like', () => {
    const scrubbed = scrubEvent(
      event({ extra: { message: { body: 'my private message', caption: 'a photo of me', type: 'text' } } })
    );

    expect(scrubbed.extra).toEqual({ message: { body: '[Filtered]', caption: '[Filtered]', type: 'text' } });
  });

  it('scrubs the page URL and referrer, and drops cookies and request data', () => {
    const scrubbed = scrubEvent(
      event({
        request: {
          url: 'https://web.example.org/?start=register',
          query_string: 'start=register',
          headers: { Referer: 'https://web.example.org/?text=hello', 'User-Agent': 'test' },
          cookies: { session: 'x' },
          data: 'my private message',
        },
      })
    );

    expect(scrubbed.request).toEqual({
      url: 'https://web.example.org/?start=[Filtered]',
      query_string: 'start=[Filtered]',
      headers: { Referer: 'https://web.example.org/?text=[Filtered]', 'User-Agent': 'test' },
    });
  });

  it('keeps only the contact id on the user', () => {
    const scrubbed = scrubEvent(
      event({ user: { id: '77', username: 'Alice', email: 'alice@example.org', ip_address: '10.0.0.1' } })
    );

    expect(scrubbed.user).toEqual({ id: '77' });
  });

  it('scrubs span descriptions on transactions', () => {
    const scrubbed = scrubEvent({
      type: 'transaction',
      spans: [
        {
          span_id: '1',
          trace_id: '2',
          start_timestamp: 0,
          description: 'GET https://api.example.org/web_socket/longpoll?token=abc',
          data: { 'http.url': 'https://api.example.org/web_socket/longpoll?token=abc' },
        },
      ],
    });

    expect(scrubbed.spans?.[0].description).toBe('GET https://api.example.org/web_socket/longpoll?token=[Filtered]');
    expect(scrubbed.spans?.[0].data).toEqual({
      'http.url': 'https://api.example.org/web_socket/longpoll?token=[Filtered]',
    });
  });
});
