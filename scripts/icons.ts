/* Regenerates the Android launcher icon from the game's own rook.
 *
 * Why this exists: the launcher icon shipped as a rook occupying about a fifth of the canvas,
 * floating in a field of brown. An adaptive icon is a 108dp square of which the launcher may
 * mask away everything outside the middle 72dp and *may* scale it further for parallax, so art
 * drawn small on that canvas comes out very small indeed on a phone. Google's guidance is that
 * the subject should live inside the 66dp safe zone and broadly fill it — so that is what this
 * targets, rather than the timid fraction the icon had.
 *
 * The rook is not redrawn here. It is the same Staunton path the board renders (Pieces.tsx,
 * `SHAPES.r`, a 45x45 box), so the icon and the pieces can never drift apart.
 *
 *   npx tsx scripts/icons.ts
 *
 * Rendering is done by headless Chrome because it is the one SVG rasteriser present on a Mac
 * without extra installs, and because it is the same engine that draws the piece in the game.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** The rook exactly as the board draws it, in its 45x45 box. */
const ROOK = [
  'M12 11.4h4.1v3.2h4.4v-3.2h4.9v3.2h4.4v-3.2H34v8.8H12z',
  'M13.4 20.2h18.2v2.6H13.4z',
  'M15 22.8h15v11.2H15z',
  'M11.6 34h21.8c1.6 0 2.6 1 2.6 2.4v2.8H9v-2.8c0-1.4 1-2.4 2.6-2.4z',
];
/* The board piece also carries two carved lines across the tower. They are deliberately not
 * copied: at 48dp they stop reading as carving and start reading as bands wrapped round the
 * rook. The brief asks for silhouette-level legibility, and the launcher is the smallest the
 * mark is ever seen. */

const GOLD = '#e9bd5f';
const BROWN = '#241206';

/** Android's adaptive-icon densities: the layer is always 108dp, so px = 108 * scale. */
const MIPMAP: Array<[string, number]> = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

/** Fraction of the 108dp layer the rook's height spans.
 *
 *  Fitting the height to the safe zone is the obvious move and it is wrong: the guarantee is a
 *  66dp *circle*, so what has to fit inside it is the art's diagonal, not its height. At 0.58
 *  the rook measured 63dp tall and 56dp across — a diagonal of 84dp — and a Pixel launcher duly
 *  sliced the base off the bottom of the mask. Observed, then corrected. The rook's box is
 *  27 x 27.8 units, diagonal 38.8, so a height fraction of 0.46 puts the diagonal at 64dp and
 *  the whole piece inside the circle with room to spare. */
const FILL = 0.46;

/** An SVG of the rook alone on transparency, sized to `px`, for the adaptive foreground. */
function foregroundSvg(px: number): string {
  // Centre the ink, not the box: the paths span x 9..36 and y 11.4..39.2 of the 45 box, which
  // is neither centred nor square, so centring the box would sit the rook low and off-middle.
  const box = 45;
  const art = { x: 9, y: 11.4, w: 27, h: 27.8 };
  const scale = (box * FILL) / art.h;
  const tx = px / 2 - ((art.x + art.w / 2) * scale * px) / box;
  const ty = px / 2 - ((art.y + art.h / 2) * scale * px) / box;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <g transform="translate(${tx} ${ty}) scale(${(scale * px) / box})">
    ${ROOK.map((d) => `<path d="${d}" fill="${GOLD}"/>`).join('\n    ')}
  </g>
</svg>`;
}

/** The square Play Store icon: same rook, on the tavern brown, no mask to survive. */
function storeSvg(px: number): string {
  const inner = foregroundSvg(px).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <rect width="${px}" height="${px}" fill="${BROWN}"/>
  ${inner}
</svg>`;
}

/** The 1024x500 banner the Play listing puts above everything else.
 *
 *  Play crops and overlays this unpredictably — on some surfaces the middle is covered by the
 *  install button and the edges are trimmed — so the rule is: nothing important outside the
 *  middle, and no text that has to be read to understand the picture. The title carries it,
 *  the rook anchors it, the tagline is a bonus if it survives. */
function featureSvg(): string {
  const w = 1024;
  const h = 500;
  const rook = foregroundSvg(h).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  // Same vertical grain the game's own background uses, so the banner and the first screenshot
  // look like the same object.
  const grain = Array.from({ length: 64 }, (_, i) => {
    const x = (i * w) / 64;
    return `<rect x="${x.toFixed(1)}" y="0" width="${(w / 128).toFixed(1)}" height="${h}" fill="#000" opacity="0.16"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="glow" cx="34%" cy="50%" r="62%">
      <stop offset="0%" stop-color="#4a2a10"/>
      <stop offset="100%" stop-color="#140c06"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${grain}
  <g transform="translate(58 0) scale(0.82)" opacity="0.96">${rook}</g>
  <g font-family="Palatino, 'Palatino Linotype', Georgia, serif" text-anchor="middle">
    <text x="676" y="232" font-size="72" fill="${GOLD}">Enchanted Chess</text>
    <text x="676" y="296" font-size="29" font-style="italic" fill="#c8ab86">Magic here has rules, a price,</text>
    <text x="676" y="338" font-size="29" font-style="italic" fill="#c8ab86">and no secrets.</text>
  </g>
</svg>`;
}

function render(svg: string, px: number, out: string, work: string, height = px): void {
  const html = join(work, 'i.html');
  // `background: transparent` plus Chrome's default-transparent screenshot keeps the alpha the
  // foreground layer needs; the store icon paints its own opaque rect over it.
  writeFileSync(html, `<style>html,body{margin:0;background:transparent}</style>${svg}`);
  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--screenshot=${out}`,
      `--window-size=${px},${height}`,
      `file://${html}`,
    ],
    { stdio: 'ignore' },
  );
  const bytes = readFileSync(out);
  if (bytes.length < 200) throw new Error(`${out} came out empty (${bytes.length} bytes)`);
}

const work = mkdtempSync(join(tmpdir(), 'ec-icons-'));
try {
  for (const [density, px] of MIPMAP) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    render(foregroundSvg(px), px, join(dir, 'ic_launcher_foreground.png'), work);
    // The legacy square and round icons are what pre-Android-8 launchers use; give them the
    // brown behind the rook since they have no background layer of their own.
    render(storeSvg(px), px, join(dir, 'ic_launcher.png'), work);
    render(storeSvg(px), px, join(dir, 'ic_launcher_round.png'), work);
    console.log(`mipmap-${density}  ${px}px`);
  }
  // 512x512 is what the Play Console asks for, and it is not allowed to be transparent.
  render(storeSvg(512), 512, 'play/icon-512.png', work);
  console.log('play/icon-512.png  512px');

  render(featureSvg(), 1024, 'play/feature-graphic.png', work, 500);
  console.log('play/feature-graphic.png  1024x500');
} finally {
  rmSync(work, { recursive: true, force: true });
}
