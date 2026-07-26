/* Knock a chroma-key background out of a portrait, and size it like the rest of the set.
 *
 * The seat portraits are transparent PNGs at 433px. Art arrives from image generators on a flat
 * green key at whatever size the generator felt like, and dropping one in unprocessed ships a
 * bright green square into the game — which is exactly what `wittex.png` was on arrival.
 *
 *   npx tsx scripts/chroma.ts public/portraits/wittex.png
 *
 * Done in a canvas through headless Chrome, for the same reason the icons are: it is the one
 * image pipeline on this machine that needs no extra install, and `sips` cannot key a colour.
 *
 * The key is matched in HSV rather than by RGB distance. A flat #00FF00 looks easy until the
 * edges of the subject pick up a green fringe from the generator's own antialiasing — those
 * pixels are still strongly *hued* green while being nowhere near the pure colour, so a
 * distance threshold either keeps a halo or eats the subject. Hue plus saturation catches the
 * fringe and leaves skin and cloth alone.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** What the rest of `public/portraits` is stored at. */
const SIZE = 433;

const input = process.argv[2];
if (!input || !existsSync(input)) {
  console.error('usage: npx tsx scripts/chroma.ts <portrait.png>');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'ec-chroma-'));
const page = join(work, 'key.html');
const out = join(work, 'out.png');

writeFileSync(
  page,
  `<style>html,body{margin:0;background:transparent}canvas{display:block}</style>
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script>
const img = new Image();
img.onload = () => {
  const c = document.getElementById('c');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, ${SIZE}, ${SIZE});
  const d = g.getImageData(0, 0, ${SIZE}, ${SIZE});
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, gr = p[i + 1] / 255, b = p[i + 2] / 255;
    const max = Math.max(r, gr, b), min = Math.min(r, gr, b);
    const delta = max - min;
    if (delta === 0) continue;
    // Hue in degrees, and saturation as the usual max-relative measure.
    let h = 0;
    if (max === r) h = 60 * (((gr - b) / delta) % 6);
    else if (max === gr) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - gr) / delta + 4);
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : delta / max;
    // Green sits at 120°. A wide-ish window with a saturation floor: the key is vivid, and
    // nothing in these portraits — skin, cloth, steel — is both green-hued and this saturated.
    if (h > 85 && h < 165 && s > 0.35) {
      p[i + 3] = 0;
    } else if (h > 85 && h < 165 && s > 0.18) {
      // The fringe: keep the pixel but pull its green down towards the other two channels, so
      // the outline does not glow against a dark background.
      const flat = (p[i] + p[i + 2]) / 2;
      if (p[i + 1] > flat) p[i + 1] = flat;
    }
  }
  g.putImageData(d, 0, 0);
  document.title = 'done';
};
img.src = 'file://${resolve(input)}';
</script>`,
);

execFileSync(
  CHROME,
  [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--default-background-color=00000000',
    '--virtual-time-budget=4000',
    `--screenshot=${out}`,
    `--window-size=${SIZE},${SIZE}`,
    `file://${page}`,
  ],
  { stdio: 'ignore' },
);

const bytes = readFileSync(out);
if (bytes.length < 2000) throw new Error(`${basename(input)}: keyed image came out empty`);
renameSync(out, input);
rmSync(work, { recursive: true, force: true });
console.log(`${basename(input)} → ${SIZE}px, keyed, ${(bytes.length / 1024).toFixed(0)} KB`);
