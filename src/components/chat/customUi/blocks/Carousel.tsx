import { BlockImage, BlockShell } from '@/components/chat/customUi/primitives';
import { clampSummary } from '@/components/chat/customUi/values';
import type { CustomUiRendererProps } from '@/components/chat/customUi/registry';
import { Button } from '@/components/ui/button';

// `glific/carousel` (contract §6): horizontally swipeable cards, each with a select action.
//   props: { id, body?, cards: [{ id, image, title, description }] }
//   values:  { "<props.id>": "<selected card id>" }
//   summary: the selected card's title
export interface CarouselCard {
  id: string;
  image?: string;
  title: string;
  description?: string;
}

export interface CarouselProps {
  id?: string;
  body?: string;
  cards?: CarouselCard[];
}

export const Carousel = ({ content, disabled, onSubmit }: CustomUiRendererProps) => {
  const props = (content.props ?? {}) as CarouselProps;
  const key = props.id || 'selection';
  const cards = Array.isArray(props.cards) ? props.cards : [];

  const select = (card: CarouselCard) => {
    if (disabled) return;
    onSubmit({
      values: { [key]: card.id },
      summary: clampSummary(card.title ?? '', card.id),
    });
  };

  return (
    <BlockShell testId="customUiCarousel" body={props.body ?? content.fallback}>
      {/* Native horizontal scroll with snap points — swipeable on touch, scrollable on desktop. */}
      <div
        className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
        data-testid="carouselTrack"
      >
        {cards.map((card, i) => (
          <div
            key={card.id ?? `card-${i}`}
            className="flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border"
            data-testid="carouselCard"
          >
            <BlockImage url={card.image} className="aspect-video" />
            <div className="flex flex-1 flex-col gap-1 p-2">
              <span className="text-sm font-medium">{card.title}</span>
              {card.description && (
                <span className="text-xs text-muted-foreground">{card.description}</span>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                className="mt-auto w-full"
                data-testid="carouselSelect"
                aria-label={`Select ${card.title}`}
                onClick={() => select(card)}
              >
                Select
              </Button>
            </div>
          </div>
        ))}
      </div>
    </BlockShell>
  );
};

export default Carousel;
