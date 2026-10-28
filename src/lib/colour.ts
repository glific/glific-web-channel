// The light neutral the widget's palette is built from, and the text colour on every button.
export const ON_ACTION = '#fafafa';

// WCAG AA for normal-size text.
const AA = 4.5;

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);

const relativeLuminance = (hex: string) =>
  channels(hex)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((total, value, index) => total + [0.2126, 0.7152, 0.0722][index] * value, 0);

export const contrastRatio = (first: string, second: string) => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

const toHsl = (hex: string) => {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { hue: 0, saturation: 0, lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  return { hue, saturation, lightness };
};

const fromHsl = ({ hue, saturation, lightness }: { hue: number; saturation: number; lightness: number }) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return `#${[r, g, b]
    .map((value) =>
      Math.round((value + m) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
};

/**
 * The org's colour, darkened only as far as it takes for ON_ACTION text on it — and it as text on
 * the white page — to clear WCAG AA. Buttons and links use this; only the header uses the raw
 * colour, because there the server's computed foreground keeps any colour readable.
 *
 * Darkened in HSL with hue and saturation held, so a yellow becomes an ochre rather than a grey.
 */
export const readableShade = (hex: string) => {
  const hsl = toHsl(hex);
  let shade = hex.toLowerCase();

  while (contrastRatio(shade, ON_ACTION) < AA && hsl.lightness > 0) {
    hsl.lightness = Math.max(0, hsl.lightness - 0.01);
    shade = fromHsl(hsl);
  }

  return shade;
};
