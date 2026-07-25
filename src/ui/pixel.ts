/** Tiny pixel-art plumbing, used for the character portraits. Sprites are authored as
 *  character grids and rasterised to a data URI at runtime, one canvas per unique sprite,
 *  cached forever. No image files ship, and everything scales with `image-rendering: pixelated`. */

export type Palette = Record<string, string>;

const cache = new Map<string, string>();

export function spriteUrl(rows: string[], palette: Palette, key: string): string {
  const cached = cache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';

  const height = rows.length;
  const width = rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });

  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
