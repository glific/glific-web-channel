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

  // Bubbles stay white or grey whatever the org's colour, so a light brand colour can never make
  // a message hard to read. The bubble is the content's parent; its classes carry the colour.
  it.each([
    ['inbound', 'the contact sent', 'bg-muted'],
    ['outbound', 'the organisation sent', 'bg-card'],
  ])('paints a message %s (%s) %s, never the brand colour', (flow, _who, fill) => {
    render(<MessageBubble message={message({ body: 'hello', type: 'TEXT', flow })} />);

    const bubble = screen.getByTestId('content').parentElement as HTMLElement;
    expect(bubble).toHaveClass(fill);
    expect(bubble.className).not.toMatch(/\b(bg-primary|bg-brand)\b/);
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

    // As on WhatsApp: the bubble shows one button, and the options open in a sheet from it.
    it('shows a list as its text and one button, with the options in a sheet', () => {
      render(
        <MessageBubble
          message={message({
            flow: 'outbound',
            body: 'Choose a subject',
            interactive_content: { ...list, globalButtons: [{ title: 'See courses' }] },
          })}
          onSelectOption={vi.fn()}
        />
      );

      expect(screen.getByTestId('interactiveContent')).toHaveTextContent('Choose a subject');
      expect(screen.queryByTestId('listOption')).not.toBeInTheDocument();
      expect(screen.getByTestId('listButton')).toHaveTextContent('See courses');

      fireEvent.click(screen.getByTestId('listButton'));

      expect(screen.getAllByTestId('listSection').map((s) => s.textContent)).toEqual(['Sciences', 'Arts']);
      const options = screen.getAllByTestId('listOption');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Physics');
      expect(options[0]).toHaveTextContent('Mechanics and more');
      expect(options[1]).toHaveTextContent('Painting');
    });

    it('labels the list button "Select" when the list names none', () => {
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Choose a subject', interactive_content: list })}
          onSelectOption={vi.fn()}
        />
      );

      expect(screen.getByTestId('listButton')).toHaveTextContent('Select');
    });

    // WhatsApp's shape puts a location request's text in an object; rendering that object as text
    // used to throw and blank the whole chat.
    const locationRequest = {
      type: 'location_request_message',
      body: { type: 'text', text: 'Please share your location' },
      action: { name: 'send_location' },
    };

    it('shows a location request as its text and a Send location button', () => {
      const onShareLocation = vi.fn();
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Please share your location', interactive_content: locationRequest })}
          onShareLocation={onShareLocation}
        />
      );

      expect(screen.getByTestId('interactiveContent')).toHaveTextContent('Please share your location');
      fireEvent.click(screen.getByTestId('sendLocationButton'));
      expect(onShareLocation).toHaveBeenCalledTimes(1);
    });

    it('disables Send location where the browser cannot share one', () => {
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Please share your location', interactive_content: locationRequest })}
        />
      );

      expect(screen.getByTestId('sendLocationButton')).toBeDisabled();
    });

    it('falls back to the message body when an interactive message carries no text', () => {
      render(
        <MessageBubble
          message={message({
            flow: 'outbound',
            body: 'Fallback text',
            interactive_content: { type: 'location_request_message', body: {} },
          })}
        />
      );

      expect(screen.getByTestId('interactiveContent')).toHaveTextContent('Fallback text');
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

      expect(onSelectOption).toHaveBeenCalledWith({ title: 'Coding' });
    });

    it('sends nothing until an option is chosen, then hands back the whole option', () => {
      const onSelectOption = vi.fn();
      render(
        <MessageBubble
          message={message({ flow: 'outbound', body: 'Choose a subject', interactive_content: list })}
          onSelectOption={onSelectOption}
        />
      );

      fireEvent.click(screen.getByTestId('listButton'));
      expect(screen.getByTestId('listSend')).toBeDisabled();

      fireEvent.click(screen.getAllByTestId('listOption')[0]);
      fireEvent.click(screen.getByTestId('listSend'));

      expect(onSelectOption).toHaveBeenCalledWith({ title: 'Physics', description: 'Mechanics and more' });
      expect(screen.queryByTestId('listSheet')).not.toBeInTheDocument();
    });

    it('shows the description under the title on the contact\'s list reply', () => {
      render(
        <MessageBubble
          message={message({
            flow: 'inbound',
            body: 'Physics',
            interactive_content: { title: 'Physics', description: 'Mechanics and more' },
          })}
        />
      );

      expect(screen.getByTestId('chosenOption')).toHaveTextContent('Physics');
      expect(screen.getByTestId('chosenOption')).toHaveTextContent('Mechanics and more');
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
