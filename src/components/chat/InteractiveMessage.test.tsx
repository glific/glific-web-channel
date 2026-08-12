import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InteractiveMessage } from './InteractiveMessage';
import { register, unregister, type CustomUiRendererProps } from './customUi/registry';
import { clampSummary, parseFallbackValues, SUMMARY_MAX } from './customUi/values';
import type { CustomUiContent } from '@/services/webChannelSocket';

const envelope = (overrides: Partial<CustomUiContent>): CustomUiContent => ({
  type: 'custom_ui',
  version: '1',
  component: 'glific/image_panel',
  fallback: 'Pick a course',
  props: {},
  ...overrides,
});

const renderBlock = (content: CustomUiContent, onCustomUiResponse = vi.fn()) => {
  render(<InteractiveMessage content={content} messageId={4211} onCustomUiResponse={onCustomUiResponse} />);
  return onCustomUiResponse;
};

const imagePanel = envelope({
  component: 'glific/image_panel',
  props: {
    id: 'course',
    body: 'Pick a course',
    options: [
      { id: 'c1', image: 'https://cdn/english.png', label: 'Spoken English' },
      { id: 'c2', image: 'https://cdn/digital.png', label: 'Digital skills' },
    ],
  },
});

describe('custom_ui / glific/image_panel', () => {
  it('renders one tappable option per props.options entry', () => {
    renderBlock(imagePanel);

    expect(screen.getByTestId('customUiImagePanel')).toBeInTheDocument();
    expect(screen.getAllByTestId('imagePanelOption')).toHaveLength(2);
    // the option label is the button's accessible name
    expect(screen.getByRole('button', { name: 'Digital skills' })).toBeInTheDocument();
    expect(screen.getByText('Pick a course')).toBeInTheDocument();
  });

  it('emits values keyed by props.id and the option label as the summary', async () => {
    const onRespond = renderBlock(imagePanel);

    await userEvent.click(screen.getByRole('button', { name: 'Digital skills' }));

    expect(onRespond).toHaveBeenCalledWith({
      message_id: 4211,
      component: 'glific/image_panel',
      values: { course: 'c2' },
      summary: 'Digital skills',
    });
  });

  it('echoes context when the envelope carries one', async () => {
    const onRespond = renderBlock(envelope({ ...imagePanel, context: { node: 'n1' } }));

    await userEvent.click(screen.getByRole('button', { name: 'Spoken English' }));

    expect(onRespond).toHaveBeenCalledWith(expect.objectContaining({ context: { node: 'n1' } }));
  });

  it('disables every option after the first tap and shows the summary', async () => {
    const onRespond = renderBlock(imagePanel);

    await userEvent.click(screen.getByRole('button', { name: 'Spoken English' }));
    // a second tap must not advance the flow twice
    await userEvent.click(screen.getByRole('button', { name: 'Digital skills' }));

    expect(onRespond).toHaveBeenCalledTimes(1);
    screen.getAllByTestId('imagePanelOption').forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByTestId('customUiAnswerSummary')).toHaveTextContent('Spoken English');
  });
});

describe('custom_ui / glific/carousel', () => {
  const carousel = envelope({
    component: 'glific/carousel',
    props: {
      id: 'product',
      body: 'Browse our courses',
      cards: [
        { id: 'p1', image: 'https://cdn/a.png', title: 'Course A', description: 'Six weeks, evenings' },
        { id: 'p2', image: 'https://cdn/b.png', title: 'Course B' },
      ],
    },
  });

  it('renders one card per props.cards entry', () => {
    renderBlock(carousel);

    expect(screen.getAllByTestId('carouselCard')).toHaveLength(2);
    expect(screen.getByText('Six weeks, evenings')).toBeInTheDocument();
  });

  it('emits the selected card id under props.id with the card title as the summary', async () => {
    const onRespond = renderBlock(carousel);

    await userEvent.click(screen.getByRole('button', { name: 'Select Course B' }));

    expect(onRespond).toHaveBeenCalledWith({
      message_id: 4211,
      component: 'glific/carousel',
      values: { product: 'p2' },
      summary: 'Course B',
    });
  });
});

describe('custom_ui / glific/form', () => {
  const form = envelope({
    component: 'glific/form',
    props: {
      id: 'signup',
      body: 'Tell us about yourself',
      fields: [
        { id: 'name', label: 'Your name', placeholder: 'Asha', required: true },
        { id: 'city', label: 'Your city' },
      ],
      submit_label: 'Send it',
    },
  });

  it('renders a labelled text field per field plus the submit button', () => {
    renderBlock(form);

    expect(screen.getAllByTestId('formField')).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeInTheDocument();
    expect(screen.getByTestId('formSubmit')).toHaveTextContent('Send it');
  });

  it('keeps submit disabled until every required field is filled', async () => {
    renderBlock(form);

    expect(screen.getByTestId('formSubmit')).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Asha');
    expect(screen.getByTestId('formSubmit')).toBeEnabled();
  });

  it('emits every field id (empty when untouched) and a label: value summary of the filled ones', async () => {
    const onRespond = renderBlock(form);

    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Asha');
    await userEvent.click(screen.getByTestId('formSubmit'));

    expect(onRespond).toHaveBeenCalledWith({
      message_id: 4211,
      component: 'glific/form',
      values: { name: 'Asha', city: '' },
      summary: 'Your name: Asha',
    });
  });

  it('joins several filled fields with ", "', async () => {
    const onRespond = renderBlock(form);

    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Asha');
    await userEvent.type(screen.getByRole('textbox', { name: 'Your city' }), 'Pune');
    await userEvent.click(screen.getByTestId('formSubmit'));

    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Your name: Asha, Your city: Pune' })
    );
  });
});

describe('custom_ui fallback card', () => {
  const unknown = envelope({
    component: 'tap/attendance',
    fallback: 'Were you present today?',
    props: { anything: true },
  });

  it('shows the component name, the fallback text and a lenient input', () => {
    renderBlock(unknown);

    expect(screen.getByTestId('customUiFallback')).toBeInTheDocument();
    expect(screen.getByText('Interactive · tap/attendance')).toBeInTheDocument();
    expect(screen.getByText('Were you present today?')).toBeInTheDocument();
    expect(screen.getByTestId('fallbackInput')).toBeInTheDocument();
  });

  it('sends plain text as { input: text }', async () => {
    const onRespond = renderBlock(unknown);

    await userEvent.type(screen.getByTestId('fallbackInput'), 'yes');
    await userEvent.click(screen.getByTestId('fallbackSubmit'));

    expect(onRespond).toHaveBeenCalledWith({
      message_id: 4211,
      component: 'tap/attendance',
      values: { input: 'yes' },
      summary: 'yes',
    });
  });

  it('sends a typed JSON object verbatim as values', async () => {
    const onRespond = renderBlock(unknown);

    await userEvent.type(screen.getByTestId('fallbackInput'), '{{"present":true}');
    await userEvent.click(screen.getByTestId('fallbackSubmit'));

    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({ values: { present: true }, summary: '{"present":true}' })
    );
  });

  it('treats non-object JSON as plain text', () => {
    expect(parseFallbackValues('5')).toEqual({ input: '5' });
    expect(parseFallbackValues('[1,2]')).toEqual({ input: '[1,2]' });
    expect(parseFallbackValues('null')).toEqual({ input: 'null' });
    expect(parseFallbackValues('{"a":1}')).toEqual({ a: 1 });
  });
});

describe('custom_ui answered state', () => {
  it('renders disabled with the server answer_summary when answered is true', () => {
    const onRespond = renderBlock(
      envelope({ ...imagePanel, answered: true, answer_summary: 'Digital skills' })
    );

    screen.getAllByTestId('imagePanelOption').forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByTestId('customUiAnswerSummary')).toHaveTextContent('Digital skills');
    expect(screen.getByTestId('customUiBlock')).toHaveAttribute('data-answered', 'true');
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('re-enables the block when the response push is rejected', async () => {
    const onRespond = vi.fn(() => Promise.reject(new Error('already_answered')));
    render(<InteractiveMessage content={imagePanel} messageId={4211} onCustomUiResponse={onRespond} />);

    await userEvent.click(screen.getByRole('button', { name: 'Digital skills' }));

    // the server refused, so the truth is still "unanswered" — let the contact try again
    await waitFor(() => expect(screen.getByRole('button', { name: 'Digital skills' })).toBeEnabled());
    expect(screen.queryByTestId('customUiAnswerSummary')).not.toBeInTheDocument();

    // ...and a retry really does push again (the single-submit guard was released too)
    await userEvent.click(screen.getByRole('button', { name: 'Digital skills' }));
    expect(onRespond).toHaveBeenCalledTimes(2);
  });

  it('renders only the fallback text when the bubble has no numeric server id', () => {
    const onRespond = vi.fn();
    render(
      <InteractiveMessage content={imagePanel} messageId="local-123" onCustomUiResponse={onRespond} />
    );

    // §4's message_id must be the numeric server id, so there is nothing safe to answer with
    expect(screen.queryByTestId('customUiBlock')).not.toBeInTheDocument();
    expect(screen.getByText('Pick a course')).toBeInTheDocument();
  });

  it('stays enabled when the server says it has not been answered', () => {
    renderBlock(envelope({ ...imagePanel, answered: false, answer_summary: null }));

    expect(screen.getByRole('button', { name: 'Digital skills' })).toBeEnabled();
    expect(screen.queryByTestId('customUiAnswerSummary')).not.toBeInTheDocument();
  });
});

describe('clampSummary (contract §7)', () => {
  it('substitutes the fallback for a blank summary', () => {
    expect(clampSummary('   ', 'Answered')).toBe('Answered');
  });

  it('clamps to 500 chars', () => {
    expect(clampSummary('a'.repeat(600), 'x')).toHaveLength(SUMMARY_MAX);
  });

  it('never splits a UTF-16 surrogate pair', () => {
    // an emoji straddling the boundary: 499 ASCII chars then a 2-code-unit emoji
    const summary = `${'a'.repeat(SUMMARY_MAX - 1)}😀${'b'.repeat(50)}`;
    const clamped = clampSummary(summary, 'x');

    expect(clamped).toHaveLength(SUMMARY_MAX - 1);
    expect(clamped.endsWith('a')).toBe(true);
    // a lone surrogate is not encodable as UTF-8 and would go on the wire as U+FFFD
    const roundTripped = new TextDecoder().decode(new TextEncoder().encode(clamped));
    expect(roundTripped).toBe(clamped);
    expect(roundTripped).not.toContain('�');
  });

  it('keeps a whole emoji that fits', () => {
    const summary = `${'a'.repeat(SUMMARY_MAX - 2)}😀${'b'.repeat(50)}`;
    expect(clampSummary(summary, 'x')).toHaveLength(SUMMARY_MAX);
    expect(clampSummary(summary, 'x').endsWith('😀')).toBe(true);
  });
});

describe('custom_ui renderer registry', () => {
  afterEach(() => unregister('tap/attendance'));

  it('pushes only once when a renderer submits twice in the same tick', async () => {
    // `answered` is derived from state, so both calls see the old value — only a synchronous
    // guard stops the second push (whose rejection would roll back the accepted first answer).
    const Double = ({ onSubmit }: CustomUiRendererProps) => (
      <button
        type="button"
        data-testid="tapAttendance"
        onClick={() => {
          onSubmit({ values: { present: true }, summary: 'Present' });
          onSubmit({ values: { present: false }, summary: 'Absent' });
        }}
      >
        Present
      </button>
    );
    register('tap/attendance', Double);

    const onRespond = renderBlock(envelope({ component: 'tap/attendance' }));
    await userEvent.click(screen.getByTestId('tapAttendance'));

    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith(expect.objectContaining({ summary: 'Present' }));
  });

  it('prefers a registered renderer over the generic fallback card', async () => {
    const Custom = ({ onSubmit }: CustomUiRendererProps) => (
      <button type="button" data-testid="tapAttendance" onClick={() => onSubmit({ values: { present: true }, summary: 'Present' })}>
        Present
      </button>
    );
    register('tap/attendance', Custom);

    const onRespond = renderBlock(envelope({ component: 'tap/attendance' }));

    expect(screen.queryByTestId('customUiFallback')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('tapAttendance'));

    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'tap/attendance', values: { present: true }, summary: 'Present' })
    );
  });
});
