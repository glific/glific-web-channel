import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AttachMenu } from './AttachMenu';

const renderMenu = (disabled: Parameters<typeof AttachMenu>[0]['disabled'] = []) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const toggle = document.createElement('button');
  document.body.appendChild(toggle);
  render(<AttachMenu onPick={onPick} onClose={onClose} toggleRef={{ current: toggle }} disabled={disabled} />);
  return { onPick, onClose, toggle };
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

  it('closes on Escape, asking for focus back on its button', () => {
    const { onClose } = renderMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledWith(true);
  });

  // Otherwise pressing + to close the menu would close it and then toggle it straight back open.
  it('leaves a press on its own toggle button to the button', () => {
    const { onClose, toggle } = renderMenu();

    fireEvent.mouseDown(toggle);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a press outside it, but not on one inside it', () => {
    const { onClose } = renderMenu();

    fireEvent.mouseDown(screen.getByTestId('attach-gallery'));
    fireEvent.touchStart(screen.getByTestId('attach-gallery'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    // The press has its own target, such as the message field, so focus is left alone.
    expect(onClose).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.touchStart(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('disables an option that is busy, such as a location share in flight', () => {
    renderMenu(['location']);

    expect(screen.getByTestId('attach-location')).toBeDisabled();
    expect(screen.getByTestId('attach-camera')).toBeEnabled();
  });
});
