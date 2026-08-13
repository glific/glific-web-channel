import type { ReactElement } from 'react';

import type { BlocksContent } from '@/services/webChannelSocket';

// What a block hands back when the user answers it (contract §4: `values` + `summary`).
export interface BlocksAnswer {
  values: Record<string, unknown>;
  summary: string;
}

export interface BlocksRendererProps {
  content: BlocksContent;
  // the message's derived body (§9) — the replacement for v0's `fallback` envelope field.
  // Built-in blocks prompt from `props.body`; this is for renderers that have nothing else.
  body?: string;
  // true once the block has been answered (locally or per the server's `answered` flag)
  disabled: boolean;
  onSubmit: (answer: BlocksAnswer) => void;
}

export type BlocksRenderer = (props: BlocksRendererProps) => ReactElement | null;

// Runtime-registered renderers, keyed by the full namespaced component name
// ("tap/attendance"). Kept separate from the built-in table so a `register()` call can
// override a `glific/*` built-in — a single seeded Map would make that impossible.
const registered = new Map<string, BlocksRenderer>();

/**
 * Register a renderer for a component name. This is the extension point for org namespaces:
 *
 *   register('tap/attendance', AttendanceBlock);
 *
 * Resolution order is registered -> built-in `glific/*` -> generic fallback card.
 */
export const register = (component: string, renderer: BlocksRenderer): void => {
  registered.set(component, renderer);
};

export const unregister = (component: string): void => {
  registered.delete(component);
};

// Built-ins are injected by the module that owns them (blocks/index.ts) to keep this file
// free of component imports — otherwise registry <-> block imports would cycle.
const builtIns = new Map<string, BlocksRenderer>();

export const registerBuiltIn = (component: string, renderer: BlocksRenderer): void => {
  builtIns.set(component, renderer);
};

// Resolve a renderer, or null when neither a registered nor a built-in one exists — the
// caller then renders the generic fallback card.
export const resolveRenderer = (component: string): BlocksRenderer | null =>
  registered.get(component) ?? builtIns.get(component) ?? null;
