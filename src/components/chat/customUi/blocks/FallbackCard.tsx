import { useState } from 'react';

import { BlockText } from '@/components/chat/customUi/primitives';
import { clampSummary, parseFallbackValues } from '@/components/chat/customUi/values';
import type { CustomUiRendererProps } from '@/components/chat/customUi/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// The generic card shown for a component with no registered or built-in renderer (an org
// namespace like `tap/*`, or a `glific/*` block this widget build doesn't know yet). The
// contact can still answer: the block's `fallback` text is the prompt and a lenient text input
// is the control. See `values.ts` for the lenient JSON-or-text parse.
export const FallbackCard = ({ content, disabled, onSubmit }: CustomUiRendererProps) => {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  const submit = () => {
    if (disabled || !trimmed) return;
    onSubmit({
      values: parseFallbackValues(trimmed),
      summary: clampSummary(trimmed, content.component),
    });
  };

  return (
    <div data-testid="customUiFallback" className="flex flex-col gap-2">
      <div className="text-xs text-muted-foreground">Interactive · {content.component}</div>
      <BlockText>{content.fallback}</BlockText>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={text}
          disabled={disabled}
          placeholder="Your answer"
          aria-label="Your answer"
          data-testid="fallbackInput"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button size="sm" disabled={disabled || !trimmed} data-testid="fallbackSubmit" onClick={submit}>
          Send
        </Button>
      </div>
    </div>
  );
};

export default FallbackCard;
