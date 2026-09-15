import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the last digit lands, so a contact never has to reach for the button. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}

// One box per digit. Kept as `length` separate inputs rather than a styled single field because
// one-time-code autofill only offers the code to a focused input, and because a wrong digit is
// correctable in place rather than by retyping the rest.
export const OtpInput = ({ value, onChange, onComplete, length = 6, disabled, invalid }: OtpInputProps) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (index: number) => inputs.current[Math.min(Math.max(index, 0), length - 1)]?.focus();

  const commit = (next: string) => {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const setDigit = (index: number, digit: string) => {
    const digits = value.split('');
    while (digits.length < index) digits.push(' ');
    digits[index] = digit || ' ';
    commit(digits.join('').replace(/\s+$/, ''));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;

    // A keyboard that autofills the whole code types it into whichever box has focus.
    if (digits.length > 1) {
      commit(digits.slice(0, length));
      focus(digits.length);
      return;
    }

    setDigit(index, digits);
    focus(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      // Backspace on an empty box deletes the digit before it, which is what a contact means by
      // it — otherwise the first press only moves the caret and appears to do nothing.
      const target = value[index]?.trim() ? index : index - 1;
      if (target < 0) return;
      setDigit(target, '');
      focus(target);
      return;
    }

    if (event.key === 'ArrowLeft') focus(index - 1);
    if (event.key === 'ArrowRight') focus(index + 1);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    event.preventDefault();
    commit(digits);
    focus(digits.length);
  };

  return (
    <div className="flex justify-between gap-2" data-testid="otpInput">
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            inputs.current[index] = node;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          data-testid={`otpDigit-${index}`}
          value={value[index]?.trim() ?? ''}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            'h-13 w-full rounded-xl border bg-background text-center text-xl font-semibold tabular-nums',
            'outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50',
            invalid ? 'border-destructive' : 'border-border'
          )}
        />
      ))}
    </div>
  );
};
