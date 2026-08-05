import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { MessageBubble } from './MessageBubble';
import type { WebChannelMessage } from '@/services/webChannelSocket';

const base = {
  id: 1,
  flow: 'inbound' as const,
  inserted_at: '2026-01-01T00:00:00Z',
};

const build = (overrides: Partial<WebChannelMessage>): WebChannelMessage => ({
  ...base,
  body: '',
  ...overrides,
});

describe('MessageBubble media rendering', () => {
  it('renders an image with its caption', () => {
    render(<MessageBubble message={build({ type: 'image', body: 'a cat', media: { url: 'https://cdn/cat.jpg' } })} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn/cat.jpg');
    expect(screen.getByText('a cat')).toBeInTheDocument();
  });

  it('renders an audio player', () => {
    const { container } = render(<MessageBubble message={build({ type: 'audio', media: { url: 'https://cdn/a.mp3' } })} />);
    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('src', 'https://cdn/a.mp3');
  });

  it('renders a video player', () => {
    const { container } = render(<MessageBubble message={build({ type: 'video', media: { url: 'https://cdn/v.mp4' } })} />);
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://cdn/v.mp4');
  });

  it('renders a document as a download link labelled by its caption', () => {
    render(<MessageBubble message={build({ type: 'document', body: 'report.pdf', media: { url: 'https://cdn/r.pdf' } })} />);
    const link = screen.getByRole('link', { name: 'report.pdf' });
    expect(link).toHaveAttribute('href', 'https://cdn/r.pdf');
  });

  it('renders a location as a maps link', () => {
    const url = 'https://www.google.com/maps?q=12.9,77.5';
    render(<MessageBubble message={build({ type: 'location', body: url })} />);
    const link = screen.getByTestId('locationContent');
    expect(link).toHaveAttribute('href', url);
  });

  it('falls back to plain text for a text message', () => {
    render(<MessageBubble message={build({ type: 'text', body: 'just text' })} />);
    expect(screen.getByText('just text')).toBeInTheDocument();
    expect(screen.queryByTestId('mediaContent')).not.toBeInTheDocument();
  });
});
