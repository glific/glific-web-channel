import { BlockOption, BlockShell } from '@/components/chat/blocks/primitives';
import { clampSummary } from '@/components/chat/blocks/values';
import type { BlocksRendererProps } from '@/components/chat/blocks/registry';

// `glific/image-panel` (contract §6): a grid of tappable images with labels, single-select.
//   props: { id, body?, options: [{ id, image, image_alt?, label }] }
//   values:  { "<props.id>": "<selected option id>" }
//   summary: the selected option's label
export interface ImagePanelOption {
  id: string;
  image?: string;
  image_alt?: string;
  label: string;
}

export interface ImagePanelProps {
  id?: string;
  body?: string;
  options?: ImagePanelOption[];
}

export const ImagePanel = ({ content, disabled, onSubmit }: BlocksRendererProps) => {
  const props = (content.props ?? {}) as ImagePanelProps;
  const key = props.id || 'selection';
  const options = Array.isArray(props.options) ? props.options : [];

  const select = (option: ImagePanelOption) => {
    if (disabled) return;
    onSubmit({
      values: { [key]: option.id },
      summary: clampSummary(option.label ?? '', option.id),
    });
  };

  return (
    <BlockShell testId="blocksImagePanel" body={props.body}>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option, i) => (
          <BlockOption
            key={option.id ?? `option-${i}`}
            label={option.label}
            image={option.image}
            imageAlt={option.image_alt}
            disabled={disabled}
            testId="imagePanelOption"
            onSelect={() => select(option)}
          />
        ))}
      </div>
    </BlockShell>
  );
};

export default ImagePanel;
