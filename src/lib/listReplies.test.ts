import { describe, expect, it } from 'vitest';

import type { WebChannelMessage } from '@/services/webChannelSocket';
import { withChosenDescriptions } from './listReplies';

const list: WebChannelMessage = {
  id: 1,
  body: 'Pick a subject',
  flow: 'outbound',
  inserted_at: '2026-11-16T09:50:00Z',
  interactive_content: {
    type: 'list',
    items: [
      {
        title: 'Subjects',
        options: [
          { title: 'Math', description: 'Algebra and geometry' },
          { title: 'Art' },
        ],
      },
    ],
  },
};

const reply = (body: string, extra: Partial<WebChannelMessage> = {}): WebChannelMessage => ({
  id: `r-${body}`,
  body,
  type: 'text',
  flow: 'inbound',
  inserted_at: '2026-11-16T09:51:00Z',
  ...extra,
});

const descriptionOf = (messages: WebChannelMessage[]) =>
  withChosenDescriptions(messages).at(-1)?.interactive_content?.description;

describe('withChosenDescriptions', () => {
  it('gives a reply the description of the list option it chose', () => {
    expect(descriptionOf([list, reply('Math')])).toBe('Algebra and geometry');
  });

  it('works for a reply re-fetched from history, which the server stores as a bare title', () => {
    expect(descriptionOf([list, reply('Math', { id: 7, interactive_content: {} })])).toBe('Algebra and geometry');
  });

  it('finds the list past messages the flow sent after it', () => {
    const note = { ...reply('Take your time'), flow: 'outbound' as const };
    expect(descriptionOf([list, note, reply('Math')])).toBe('Algebra and geometry');
  });

  it('leaves alone an option without a description, and text that matches no option', () => {
    expect(descriptionOf([list, reply('Art')])).toBeUndefined();
    expect(descriptionOf([list, reply('Something else')])).toBeUndefined();
  });

  it('only matches against the latest interactive message', () => {
    const buttons: WebChannelMessage = {
      ...list,
      id: 2,
      interactive_content: { type: 'quick_reply', options: [{ title: 'Yes' }, { title: 'No' }] },
    };
    expect(descriptionOf([list, buttons, reply('Math')])).toBeUndefined();
  });

  it('ignores media the contact sends', () => {
    expect(descriptionOf([list, reply('Math', { type: 'image' })])).toBeUndefined();
  });
});
