import { useId, useState } from 'react';

import { BlockInput, BlockShell } from '@/components/chat/blocks/primitives';
import { clampSummary } from '@/components/chat/blocks/values';
import type { BlocksRendererProps } from '@/components/chat/blocks/registry';
import { Button } from '@/components/ui/button';

// `glific/form` (contract §6): inline labelled text fields + submit button (v0 input is text only).
//   props: { id?, body?, fields: [{ id, label, placeholder?, required? }], submit_label? }
//   values:  { "<field id>": "<string value>" } — EVERY field, empty string if untouched.
//            Note: unlike image_panel/carousel, values are NOT nested under props.id; the
//            fields carry their own ids (which is why props.id is optional for a form).
//   summary: "Your name: Asha" pairs joined with ", " — keyed by field LABEL, not id.
//            Untouched fields are skipped in the summary (it is display text) while `values`
//            still carries them.
export interface FormField {
  id: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export interface FormBlockProps {
  id?: string;
  body?: string;
  fields?: FormField[];
  submit_label?: string;
}

export const FormBlock = ({ content, disabled, onSubmit }: BlocksRendererProps) => {
  const props = (content.props ?? {}) as FormBlockProps;
  const fields = Array.isArray(props.fields) ? props.fields : [];
  const [values, setValues] = useState<Record<string, string>>({});
  // several form blocks can share a thread — keep the label/input id pairs unique per instance
  const uid = useId();

  const missingRequired = fields.some((field) => field.required && !(values[field.id] ?? '').trim());

  const submit = () => {
    if (disabled || missingRequired) return;

    const answer: Record<string, string> = {};
    const pairs: string[] = [];

    fields.forEach((field) => {
      const value = (values[field.id] ?? '').trim();
      answer[field.id] = value;
      if (value) pairs.push(`${field.label || field.id}: ${value}`);
    });

    onSubmit({
      values: answer,
      summary: clampSummary(pairs.join(', '), props.submit_label || 'Submitted'),
    });
  };

  return (
    <BlockShell testId="blocksForm" body={props.body}>
      <div className="flex flex-col gap-2">
        {fields.map((field, i) => (
          <BlockInput
            key={field.id ?? `field-${i}`}
            id={`${uid}-${field.id}`}
            label={field.label}
            placeholder={field.placeholder}
            required={field.required}
            disabled={disabled}
            testId="formField"
            value={values[field.id] ?? ''}
            onChange={(value) => setValues((prev) => ({ ...prev, [field.id]: value }))}
          />
        ))}
        <Button
          size="sm"
          disabled={disabled || missingRequired}
          className="w-full"
          data-testid="formSubmit"
          onClick={submit}
        >
          {props.submit_label || 'Submit'}
        </Button>
      </div>
    </BlockShell>
  );
};

export default FormBlock;
