/* Regenerates the app's mark: a chess knight with an E standing in front of it.
 *
 * It took three wrong answers to get here, and they are worth recording because each was wrong
 * for a different reason.
 *
 *   1. A rook at a fifth of the canvas. An adaptive icon is a 108dp square that a launcher may
 *      mask to 72dp and scale again for parallax, so art drawn timidly arrives smaller still.
 *   2. A correctly sized rook. Legible, and it said nothing — not that this is chess to anyone
 *      not already looking, not the name, and certainly not that it is a fantasy roguelike.
 *   3. An E monogram with the board's own knight tucked into it. The board's knight is drawn
 *      for a 45px square; enlarged and filled flat it reads as a seahorse. A piece that works
 *      on a board does not automatically work as a mark.
 *
 * So the knight here is drawn for this job. The two features that make a knight read instantly
 * are the pointed ears and the angular muzzle — a rounded head is a horse at best — with mane
 * notches cut in the background colour down the back of the neck. The outline is original;
 * nothing is traced from an existing piece set, so no licence rides on the app's own mark.
 *
 * The letter is Trattatello, the one fantasy face on macOS whose E is not uncial. Luminari and
 * Herculanum both cut an E that reads as a C, which is exactly the failure it looks like.
 *
 *   npx tsx scripts/icons.ts
 *
 * Rendering is headless Chrome: the one SVG rasteriser present without extra installs, and the
 * same engine that draws the game. Because the letter comes from a system font, the PNGs are
 * committed rather than regenerated in CI — this script needs a Mac with Trattatello to run.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const GOLD = '#e9bd5f';
const BRONZE = '#a87c37';
const BRONZE_INK = '#5e421b';
const BROWN = '#241206';
const FANTASY = 'Trattatello, Papyrus, fantasy, serif';

/* The knight, facing left in a 100x100 box, standing on a plinth. */
const OUTLINE = `M17 47 C15 43 17 39 21 36 C27 31 33 25 38 18 L44 10 L47 21 L53 12 L57 22 L62 15
  C70 24 76 35 78 47 C80 58 79 66 77 73 L31 73 C30 64 33 57 39 51 C41 49 43 46 44 43 L30 51
  C24 54 19 52 17 47 Z`;
const PLINTH = 'M25 73 H83 A5 5 0 0 1 88 78 V90 H20 V78 A5 5 0 0 1 25 73 Z';
const NOTCHES = ['M62 20 l9 5 l-6 5 z', 'M68 32 l9 5 l-6 5 z', 'M72 45 l8 5 l-6 5 z'];
const NOSTRIL = 'M24 43 q3.5 -1.5 6 0.5';

/** The ink's real extent inside the 100 box, which is what has to survive the mask. */
const MARK_ART = { x: 17, y: 10, w: 71, h: 80 };

function markPaths(): string {
  return `
    <path d="${OUTLINE}" fill="${BRONZE}"/>
    <path d="${PLINTH}" fill="${BRONZE}"/>
    ${NOTCHES.map((d) => `<path d="${d}" fill="${BRONZE_INK}"/>`).join('\n    ')}
    <circle cx="40" cy="32" r="3.6" fill="${BRONZE_INK}"/>
    <path d="${NOSTRIL}" stroke="${BRONZE_INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <text x="52" y="55" font-family="${FANTASY}" font-size="56" fill="${GOLD}"
      text-anchor="middle" dominant-baseline="central"
      stroke="${BROWN}" stroke-width="4" paint-order="stroke">E</text>`;
}

/** Android's adaptive-icon densities: the layer is always 108dp, so px = 108 * scale. */
const MIPMAP: Array<[string, number]> = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

/** How much of the adaptive layer's 108dp the mark's *diagonal* may span.
 *
 *  Fitting the height to the safe zone is the obvious move and it is wrong: the guarantee is a
 *  66dp **circle**, so what must fit inside it is the art's diagonal, not its height. An earlier
 *  mark was sized by height, measured 63 x 56dp — an 84dp diagonal — and a Pixel launcher duly
 *  sliced its base off the bottom. Observed on a device, then corrected. 0.66 sits a shade
 *  outside the 66dp guarantee and comfortably inside the 72dp a mask actually shows. */
const DIAGONAL_FILL = 0.66;

/** The mark alone on transparency, for the adaptive foreground layer. */
function foregroundSvg(px: number): string {
  const box = 100;
  const art = MARK_ART;
  const scale = (box * DIAGONAL_FILL) / Math.hypot(art.w, art.h);
  const tx = px / 2 - ((art.x + art.w / 2) * scale * px) / box;
  const ty = px / 2 - ((art.y + art.h / 2) * scale * px) / box;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <g transform="translate(${tx} ${ty}) scale(${(scale * px) / box})">
    ${markPaths()}
  </g>
</svg>`;
}

/** The square Play icon and the legacy launcher icons: the same mark on the tavern brown. */
function storeSvg(px: number): string {
  const inner = foregroundSvg(px).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
  <rect width="${px}" height="${px}" fill="${BROWN}"/>
  ${inner}
</svg>`;
}

/** The 1024x500 banner above the listing.
 *
 *  Play crops and overlays this unpredictably — on some surfaces the middle is covered by the
 *  install button and the edges are trimmed — so nothing important goes outside the middle and
 *  no text has to be read for the picture to work. */
function featureSvg(): string {
  const w = 1024;
  const h = 500;
  const mark = foregroundSvg(h).replace(/^<svg[^>]*>|<\/svg>$/g, '');
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
  <g transform="translate(58 0) scale(0.86)" opacity="0.97">${mark}</g>
  <g font-family="Palatino, 'Palatino Linotype', Georgia, serif" text-anchor="middle">
    <text x="676" y="232" font-size="72" fill="${GOLD}">Enchanted Chess</text>
    <text x="676" y="296" font-size="29" font-style="italic" fill="#c8ab86">Magic here has rules, a price,</text>
    <text x="676" y="338" font-size="29" font-style="italic" fill="#c8ab86">and no secrets.</text>
  </g>
</svg>`;
}

function render(svg: string, px: number, out: string, work: string, height = px): void {
  const html = join(work, 'i.html');
  // Chrome's screenshot keeps alpha with this flag, which is what the foreground layer needs;
  // the store icon paints its own opaque rect over it.
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
    // Pre-Android-8 launchers have no background layer of their own, so these carry the brown.
    render(storeSvg(px), px, join(dir, 'ic_launcher.png'), work);
    render(storeSvg(px), px, join(dir, 'ic_launcher_round.png'), work);
    console.log(`mipmap-${density}  ${px}px`);
  }
  render(storeSvg(512), 512, 'play/icon-512.png', work);
  console.log('play/icon-512.png  512px');
  render(featureSvg(), 1024, 'play/feature-graphic.png', work, 500);
  console.log('play/feature-graphic.png  1024x500');

  // The web manifest icons, so a browser tab and an installed PWA carry the same mark.
  render(storeSvg(512), 512, 'public/icons/icon-512.png', work);
  render(storeSvg(512), 512, 'public/icons/icon-512-maskable.png', work);
  render(storeSvg(192), 192, 'public/icons/icon-192.png', work);
  console.log('public/icons  192 + 512 + maskable');
} finally {
  rmSync(work, { recursive: true, force: true });
}
