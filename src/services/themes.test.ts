import { describe, it, expect } from 'vitest';

import { DEFAULT_THEME, THEMES, paletteFor } from './themes';

const parseOklch = (value: string) => {
  const [lightness, chroma, hue] = value.slice('oklch('.length, -1).split(' ').map(Number);
  return { lightness, chroma, hue };
};

// OKLCH -> linear sRGB, per the OKLab specification.
const toLinearSrgb = (value: string): [number, number, number] => {
  const { lightness, chroma, hue } = parseOklch(value);
  const radians = (hue * Math.PI) / 180;
  const greenRed = chroma * Math.cos(radians);
  const blueYellow = chroma * Math.sin(radians);

  const long = (lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow) ** 3;
  const medium = (lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow) ** 3;
  const short = (lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow) ** 3;

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
};

const relativeLuminance = (value: string): number => {
  const [r, g, b] = toLinearSrgb(value);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a: string, b: string): number => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

describe('theme palettes', () => {
  it.each(Object.entries(THEMES))('%s clears WCAG AA for button text', (_name, palette) => {
    // The whole reason the foreground ships with the theme instead of being configurable:
    // no organisation can choose a pairing that makes its own button text illegible.
    expect(contrastRatio(palette.primary, palette.primaryForeground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(THEMES))('%s emits colour syntax the browser accepts', (_name, palette) => {
    expect(palette.primary).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
    expect(palette.primaryForeground).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  });

  it('offers visibly distinct accents, not shadcn\'s near-identical neutrals', () => {
    // shadcn's own base scales all sit at chroma < 0.02, which is imperceptible. Zinc is kept
    // deliberately as the neutral option; everything else must actually read as a colour.
    const coloured = Object.entries(THEMES).filter(([name]) => name !== 'zinc');

    for (const [, palette] of coloured) {
      expect(parseOklch(palette.primary).chroma).toBeGreaterThan(0.05);
    }

    const hues = coloured.map(([, palette]) => parseOklch(palette.primary).hue);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('covers both a light and a dark accent', () => {
    const foregrounds = new Set(Object.values(THEMES).map((palette) => palette.primaryForeground));
    // Light accents take dark text and dark accents take light text; both cases must exist or
    // the contrast handling is never actually exercised.
    expect(foregrounds.size).toBe(2);
  });
});

describe('paletteFor', () => {
  it('resolves every offered name', () => {
    for (const name of Object.keys(THEMES)) {
      expect(paletteFor(name)).toBe(THEMES[name as keyof typeof THEMES]);
    }
  });

  it('falls back for a name the backend offers but this build does not know', () => {
    // The two lists live in different repos, so drift degrades rather than breaking.
    for (const name of ['chartreuse', '', null, undefined]) {
      expect(paletteFor(name)).toBe(THEMES[DEFAULT_THEME]);
    }
  });
});
