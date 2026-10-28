import { describe, expect, it } from 'vitest';

import { ON_ACTION, contrastRatio, readableShade } from './colour';

// Light, mid and dark colours an org might pick, including the yellow and mint #6028 names.
const COLOURS = ['#ffff00', '#98ff98', '#ffb900', '#eab308', '#119656', '#ff6900', '#4c3bcf', '#5b21b6', '#000000'];

describe('readableShade', () => {
  it('clears WCAG AA for button text on it and for it as text on the white page, whatever the colour', () => {
    COLOURS.forEach((colour) => {
      const shade = readableShade(colour);
      expect(contrastRatio(shade, ON_ACTION)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(shade, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('leaves a colour that is already dark enough exactly as the org chose it', () => {
    expect(readableShade('#4c3bcf')).toBe('#4c3bcf');
    expect(readableShade('#5B21B6')).toBe('#5b21b6');
  });

  // Darkening in HSL holds the hue, so the org's colour is still recognisably theirs.
  it('darkens a light colour while keeping it the same colour, not grey', () => {
    const shade = readableShade('#ffb900');
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(shade.slice(at, at + 2), 16));

    expect(shade).not.toBe('#ffb900');
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('darkens no further than it has to', () => {
    const shade = readableShade('#119656');

    expect(contrastRatio(shade, ON_ACTION)).toBeLessThan(5.5);
  });
});
