import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import type { WebChannelMessage } from '@/services/webChannelSocket';
import { MessageBubble } from './MessageBubble';

const message = (overrides: Partial<WebChannelMessage>): WebChannelMessage => ({
  id: 1,
  body: '',
  flow: 'inbound',
  inserted_at: '2026-01-01T10:30:00Z',
  ...overrides,
});

describe('<MessageBubble />', () => {
  it('renders a text message as its body', () => {
    render(<MessageBubble message={message({ body: 'hello', type: 'TEXT' })} />);

    expect(screen.getByTestId('content')).toHaveTextContent('hello');
  });

  it.each([
    ['image', 'img'],
    ['video', 'video'],
    ['audio', 'audio'],
  ])('renders a %s message as a playable element', (type, tag) => {
    const { container } = render(
      <MessageBubble message={message({ type, media: { url: 'https://cdn.test/file' } })} />
    );

    expect(container.querySelector(tag)).toHaveAttribute('src', 'https://cdn.test/file');
  });

  it('renders a document as a file chip: an icon, its caption, and a download link', () => {
    const document = message({ type: 'document', body: 'report.pdf', media: { url: 'https://cdn.test/report.pdf' } });

    render(<MessageBubble message={document} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://cdn.test/report.pdf');
    expect(screen.getByRole('link')).toHaveTextContent('report.pdf');
    expect(screen.getByRole('link').querySelector('svg')).toBeInTheDocument();
  });

  it('shows the caption alongside the media', () => {
    render(<MessageBubble message={message({ type: 'image', body: 'my cat', media: { url: 'https://cdn.test/cat.png' } })} />);

    expect(screen.getByTestId('mediaContent')).toHaveTextContent('my cat');
  });

  // A media message whose url never arrived would otherwise render an empty bubble.
  it('falls back to the body when a media message carries no url', () => {
    render(<MessageBubble message={message({ type: 'image', body: 'an image' })} />);

    expect(screen.queryByTestId('mediaContent')).not.toBeInTheDocument();
    expect(screen.getByTestId('content')).toHaveTextContent('an image');
  });

  it('renders a location as a link to the map', () => {
    const maps = 'https://www.google.com/maps?q=12.9,77.5';

    render(<MessageBubble message={message({ type: 'location', body: maps })} />);

    expect(screen.getByTestId('locationContent')).toHaveAttribute('href', maps);
  });
});
