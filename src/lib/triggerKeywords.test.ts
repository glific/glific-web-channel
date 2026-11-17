import { beforeEach, describe, expect, it } from 'vitest';

import {
  captureTriggerKeywords,
  MAX_TEXT_LENGTH,
  takeTriggerKeywords,
} from './triggerKeywords';

const visit = (url: string) => {
  window.history.replaceState(null, '', url);
  captureTriggerKeywords();
};

describe('trigger keywords from a link', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('keeps ?text= for the chat, and takes it off the address bar', () => {
    visit('/?text=Hello%20there');

    expect(window.location.search).toBe('');
    expect(takeTriggerKeywords()).toEqual({ text: 'Hello there' });
  });

  it('keeps ?start= as a lowercased keyword', () => {
    visit('/chat?start=%20Adopt%20');

    expect(takeTriggerKeywords()).toEqual({ start: 'adopt' });
  });

  // Every redirect drops the query, so anything else in it would be lost; only ours are removed.
  it('leaves the rest of the address alone', () => {
    visit('/login?utm_source=campaign&text=Hi#top');

    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('?utm_source=campaign');
    expect(window.location.hash).toBe('#top');
  });

  it('applies once: reading the link removes it', () => {
    visit('/?text=Hi');

    expect(takeTriggerKeywords()).toEqual({ text: 'Hi' });
    expect(takeTriggerKeywords()).toBeNull();
  });

  it('does nothing for an address without a link, or with empty values', () => {
    visit('/chat?utm_source=campaign');
    expect(takeTriggerKeywords()).toBeNull();

    visit('/?text=%20&start=');
    expect(takeTriggerKeywords()).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('caps the text at what the server accepts', () => {
    visit(`/?text=${'a'.repeat(MAX_TEXT_LENGTH + 10)}`);

    expect(takeTriggerKeywords()?.text).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('ignores a ?start= too long to be a keyword', () => {
    visit(`/?start=${'a'.repeat(101)}`);

    expect(takeTriggerKeywords()).toBeNull();
  });
});
