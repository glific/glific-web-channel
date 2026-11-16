import { describe, expect, it, vi } from 'vitest';

import { whenShown } from './whenShown';

const fakeDocument = (prerendering: boolean) => {
  const target = new EventTarget();
  return Object.assign(target, { prerendering }) as unknown as Document;
};

describe('whenShown', () => {
  it('starts at once on a page that is not being prerendered', () => {
    const start = vi.fn();
    whenShown(start, fakeDocument(false));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('waits for a prerendered page to be shown, then starts once', () => {
    const start = vi.fn();
    const doc = fakeDocument(true);

    whenShown(start, doc);
    expect(start).not.toHaveBeenCalled();

    doc.dispatchEvent(new Event('prerenderingchange'));
    doc.dispatchEvent(new Event('prerenderingchange'));
    expect(start).toHaveBeenCalledTimes(1);
  });
});
