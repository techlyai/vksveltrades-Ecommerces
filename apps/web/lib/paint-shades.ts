import shades from './paint-shade-data.json';
import type { PaintShade } from './types';

// The supplied Birla Opus card, checked against the manufacturer's public catalogue.
// RGB values are screen previews, not a promise of the final painted finish.
export const paintShades: PaintShade[] = shades.map((shade) => ({ ...shade,
  id: 'opus-' + shade.code.toLowerCase().replace(/[^a-z0-9]/g, ''), brand: 'Birla Opus', enabled: true,
}));
export type { PaintShade } from './types';
export const shadeFamilies = [...new Set(paintShades.map((shade) => shade.family))];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export function findPaintShade(code: string, card: PaintShade[] = paintShades) {
  const key = normalize(code);
  return key ? card.find((shade) => shade.enabled && normalize(shade.code) === key) : undefined;
}

export function filterPaintShades(query: string, family = 'all', card: PaintShade[] = paintShades) {
  const key = normalize(query);
  return card.filter((shade) => shade.enabled && (family === 'all' || shade.family === family)
    && (!key || normalize(shade.name).includes(key) || normalize(shade.code).includes(key) || normalize(shade.brand).includes(key)));
}

export function paintShadeRequest(value: string, card: PaintShade[] = paintShades) {
  const shade = findPaintShade(value, card);
  return shade ? `${shade.brand} / ${shade.code} / ${shade.name}` : value.trim();
}
