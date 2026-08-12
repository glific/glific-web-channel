import { Carousel } from '@/components/chat/customUi/blocks/Carousel';
import { FormBlock } from '@/components/chat/customUi/blocks/FormBlock';
import { ImagePanel } from '@/components/chat/customUi/blocks/ImagePanel';
import { registerBuiltIn } from '@/components/chat/customUi/registry';

// The permanent `glific/*` catalog (contract §6). Importing this module seeds the built-in
// table; CustomUiBlock imports it for its side effect.
registerBuiltIn('glific/image_panel', ImagePanel);
registerBuiltIn('glific/carousel', Carousel);
registerBuiltIn('glific/form', FormBlock);

export { Carousel, FormBlock, ImagePanel };
export { FallbackCard } from '@/components/chat/customUi/blocks/FallbackCard';
