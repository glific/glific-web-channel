import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AttachMenu } from './AttachMenu';

const renderMenu = (disabled: Parameters<typeof AttachMenu>[0]['disabled'] = []) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<AttachMenu onPick={onPick} onClose={onClose} disabled={disabled} />);
  return { onPick, onClose };
};

describe('<AttachMenu />', () => {
  it('offers Camera, Gallery, Document and Location, in that order', () => {
    renderMenu();

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Camera',
      'Gallery',
      'Document',
      'Location',
    ]);
  });

  it('reports the option picked', () => {
    const { onPick } = renderMenu();

    fireEvent.click(screen.getByTestId('attach-document'));

    expect(onPick).toHaveBeenCalledWith('document');
  });

  it('moves focus into the menu, so it can be used from the keyboard', () => {
    renderMenu();

    expect(screen.getByTestId('attach-camera')).toHaveFocus();
  });

  it('closes on Escape', () => {
    const { onClose } = renderMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on a tap on the dimmed chat behind it, but not on a tap inside the sheet', () => {
    const { onClose } = renderMenu();

    fireEvent.click(screen.getByTestId('attachMenu'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('attachBackdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Each option is recognised by its own colour, as in WhatsApp, whatever the org's brand colour.
  it('gives every option its own fixed colour', () => {
    renderMenu();

    const colours = screen
      .getAllByRole('menuitem')
      .map((item) => (item.firstElementChild as HTMLElement).style.backgroundColor);

    expect(new Set(colours).size).toBe(4);
    colours.forEach((colour) => expect(colour).not.toBe(''));
  });

  it('disables an option that is busy, such as a location share in flight', () => {
    renderMenu(['location']);

    expect(screen.getByTestId('attach-location')).toBeDisabled();
    expect(screen.getByTestId('attach-camera')).toBeEnabled();
  });
});
