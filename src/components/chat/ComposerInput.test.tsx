import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComposerInput } from './ComposerInput';

const withPointer = (coarse: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));

const renderInput = () => {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  render(<ComposerInput value="hello" placeholder="Type a message" onChange={onChange} onSubmit={onSubmit} />);
  return { onSubmit, onChange, field: screen.getByTestId('composerInput') };
};

describe('<ComposerInput />', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a multi-line field that starts one line tall', () => {
    const { field } = renderInput();

    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('rows', '1');
  });

  it('sends on Enter with a keyboard', () => {
    withPointer(false);
    const { field, onSubmit } = renderInput();

    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('leaves Shift+Enter to break the line', () => {
    withPointer(false);
    const { field, onSubmit } = renderInput();

    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('leaves Enter to break the line on a phone, where the send button sends', () => {
    withPointer(true);
    const { field, onSubmit } = renderInput();

    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reports what is typed', () => {
    const { field, onChange } = renderInput();

    fireEvent.change(field, { target: { value: 'hello there' } });

    expect(onChange).toHaveBeenCalledWith('hello there');
  });
});
