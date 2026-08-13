import { Carousel } from '@/components/chat/blocks/Carousel';
import { FormBlock } from '@/components/chat/blocks/FormBlock';
import { ImagePanel } from '@/components/chat/blocks/ImagePanel';
import { registerBuiltIn } from '@/components/chat/blocks/registry';

// The permanent `glific/*` catalog (contract §6). Importing this module seeds the built-in
// table; BlocksMessage imports it for its side effect.
registerBuiltIn('glific/image-panel', ImagePanel);
registerBuiltIn('glific/carousel', Carousel);
registerBuiltIn('glific/form', FormBlock);

export { Carousel, FormBlock, ImagePanel };
export { FallbackCard } from '@/components/chat/blocks/FallbackCard';
