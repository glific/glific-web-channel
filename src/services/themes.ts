/**
 * The palettes an organisation can choose between.
 *
 * shadcn itself publishes only neutral base scales — every one of its `--primary` values sits
 * near black at a chroma below 0.02 — so a picker built from them would give every NGO the same
 * button. These follow shadcn's token conventions but take their colours from Tailwind v4's
 * oklch palette, which is the same source shadcn's own scales come from.
 *
 * Each theme carries its own foreground rather than deriving one. Every pair below clears WCAG
 * AA (4.5:1) for normal text, asserted in themes.test.ts — so an organisation cannot pick a
 * combination that makes its button text illegible.
 *
 * The names here must stay in step with @themes in Glific's lib/glific/web_channel/theme.ex,
 * which is what the Settings dropdown offers. An unknown name falls back to DEFAULT_THEME.
 */
export interface ThemePalette {
  /** Tailwind v4 shade this is taken from, for anyone reconciling it later. */
  readonly shade: string;
  readonly primary: string;
  readonly primaryForeground: string;
}

// The two neutrals from the :root palette in index.css.
const NEAR_BLACK = 'oklch(0.145 0 0)';
const NEAR_WHITE = 'oklch(0.985 0 0)';

export const THEMES = {
  violet: { shade: 'violet-600', primary: 'oklch(0.541 0.281 293.009)', primaryForeground: NEAR_WHITE },
  blue: { shade: 'blue-600', primary: 'oklch(0.546 0.245 262.881)', primaryForeground: NEAR_WHITE },
  green: { shade: 'green-700', primary: 'oklch(0.527 0.154 150.069)', primaryForeground: NEAR_WHITE },
  teal: { shade: 'teal-700', primary: 'oklch(0.511 0.096 186.391)', primaryForeground: NEAR_WHITE },
  rose: { shade: 'rose-600', primary: 'oklch(0.586 0.253 17.585)', primaryForeground: NEAR_WHITE },
  orange: { shade: 'orange-500', primary: 'oklch(0.705 0.213 47.604)', primaryForeground: NEAR_BLACK },
  amber: { shade: 'amber-400', primary: 'oklch(0.828 0.189 84.429)', primaryForeground: NEAR_BLACK },
  zinc: { shade: 'zinc-900', primary: 'oklch(0.21 0.006 285.885)', primaryForeground: NEAR_WHITE },
} as const satisfies Record<string, ThemePalette>;

export type ThemeName = keyof typeof THEMES;

export const DEFAULT_THEME: ThemeName = 'zinc';

export const paletteFor = (name: string | null | undefined): ThemePalette =>
  THEMES[name as ThemeName] ?? THEMES[DEFAULT_THEME];
