import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { EditName } from './EditName';

describe('EditName', () => {
  it('shows "You" as the display fallback when the name is empty', () => {
    render(<EditName name="" onSave={vi.fn()} />);
    expect(screen.getByTestId('contactName')).toHaveTextContent('You');
  });

  it('shows the contact name when present', () => {
    render(<EditName name="Priya" onSave={vi.fn()} />);
    expect(screen.getByTestId('contactName')).toHaveTextContent('Priya');
  });

  it('saves a changed name once on the explicit save action', () => {
    const onSave = vi.fn();
    render(<EditName name="Priya" onSave={onSave} />);

    fireEvent.click(screen.getByTestId('editNameButton'));
    fireEvent.change(screen.getByTestId('nameInput'), { target: { value: 'Priya Kumar' } });
    fireEvent.click(screen.getByTestId('saveNameButton'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Priya Kumar');
  });

  it('does not persist the "You" placeholder — an empty edit never calls onSave', () => {
    const onSave = vi.fn();
    render(<EditName name="" onSave={onSave} />);

    fireEvent.click(screen.getByTestId('editNameButton'));
    // the field starts empty (placeholder "You" is display-only) and the user saves without typing
    fireEvent.click(screen.getByTestId('saveNameButton'));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave when the name is unchanged', () => {
    const onSave = vi.fn();
    render(<EditName name="Priya" onSave={onSave} />);

    fireEvent.click(screen.getByTestId('editNameButton'));
    fireEvent.click(screen.getByTestId('saveNameButton'));

    expect(onSave).not.toHaveBeenCalled();
  });
});
