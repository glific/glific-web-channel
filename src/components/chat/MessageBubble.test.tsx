import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

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

  it('renders a document as a download link labelled by its caption', () => {
    const document = message({ type: 'document', body: 'report.pdf', media: { url: 'https://cdn.test/report.pdf' } });

    render(<MessageBubble message={document} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://cdn.test/report.pdf');
    expect(screen.getByRole('link')).toHaveTextContent('report.pdf');
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

  describe('interactive messages', () => {
    const quickReply = {
      type: 'quick_reply',
      content: { type: 'text', header: 'Pick one', text: 'Which course?' },
      options: [{ title: 'Science' }, { title: 'Coding' }],
    };

    const list = {
      type: 'list',
      title: 'Courses',
      body: 'Choose a subject',
      items: [
        { title: 'Sciences', options: [{ title: 'Physics', description: 'Mechanics and more' }] },
        { title: 'Arts', options: [{ title: 'Painting' }] },
      ],
    };

    it('renders a quick reply as its text plus one button per option', () => {
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Which course?', interactive_content: quickReply })}
          onSelectOption={vi.fn()}
        />
      );

      expect(screen.getByTestId('interactiveContent')).toHaveTextContent('Which course?');
      expect(screen.getAllByTestId('interactiveOption').map((b) => b.textContent)).toEqual([
        'Science',
        'Coding',
      ]);
    });

    // A list nests its options inside sections; the widget has no room for WhatsApp's two-step
    // "open the list, then choose", so they are flattened into the same buttons.
    it('flattens a list\'s sections into options', () => {
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Choose a subject', interactive_content: list })}
          onSelectOption={vi.fn()}
        />
      );

      const options = screen.getAllByTestId('interactiveOption');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Physics');
      expect(options[0]).toHaveTextContent('Mechanics and more');
      expect(options[1]).toHaveTextContent('Painting');
    });

    it('answers with the option title when one is tapped', () => {
      const onSelectOption = vi.fn();
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Which course?', interactive_content: quickReply })}
          onSelectOption={onSelectOption}
        />
      );

      fireEvent.click(screen.getAllByTestId('interactiveOption')[1]);

      expect(onSelectOption).toHaveBeenCalledWith('Coding');
    });

    // The contact's own choice comes back as a plain text message; rendering buttons on it would
    // invite them to answer their own answer.
    it('does not offer options on the contact\'s own message', () => {
      render(
        <MessageBubble
          message={message({ flow: 'inbound', body: 'Coding', interactive_content: quickReply })}
          onSelectOption={vi.fn()}
        />
      );

      expect(screen.queryByTestId('interactiveOption')).not.toBeInTheDocument();
      expect(screen.getByTestId('content')).toHaveTextContent('Coding');
    });
  });
});
