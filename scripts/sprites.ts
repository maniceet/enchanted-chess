/* Sprite lint and preview.
 *
 * Portraits are hand-authored character grids, which means a single mistyped row silently
 * shears a face in half — the rasteriser reads `rows[0].length` as the width and pads the
 * rest with transparency, so a short row loses pixels rather than throwing. This checks the
 * three things that go wrong by hand: ragged rows, glyphs with no colour behind them, and
 * colours defined but never used.
 *
 *   npx tsx scripts/sprites.ts            lint every portrait
 *   npx tsx scripts/sprites.ts kyrax      lint one, and print it
 */

import * as art from '../src/ui/portraits';
import type { Palette } from '../src/ui/pixel';

type Sheet = { name: string; rows: string[]; palette: Palette };

/** Pairs `FOO` with `FOO_PALETTE`, which is the whole convention of the module. */
function sheets(): Sheet[] {
  const table = art as unknown as Record<string, unknown>;
  const out: Sheet[] = [];
  for (const [name, value] of Object.entries(table)) {
    if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
    const palette = table[`${name}_PALETTE`] as Palette | undefined;
    if (!palette) {
      console.error(`  ✗ ${name}: no ${name}_PALETTE`);
      continue;
    }
    out.push({ name, rows: value as string[], palette });
  }
  return out;
}

/** True colour blocks, so a portrait can be judged in the terminal instead of by rebuilding
 *  the app to look at a 28px rail icon. */
function preview(sheet: Sheet): string {
  return sheet.rows
    .map((row) =>
      [...row]
        .map((ch) => {
          const hex = sheet.palette[ch];
          if (!hex) return '  ';
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
        })
        .join(''),
    )
    .join('\n');
}

const only = process.argv[2]?.toUpperCase();
let bad = 0;

for (const sheet of sheets()) {
  if (only && sheet.name !== only) continue;
  const width = sheet.rows[0].length;
  const problems: string[] = [];

  sheet.rows.forEach((row, y) => {
    if (row.length !== width) problems.push(`row ${y} is ${row.length} wide, expected ${width}`);
  });
  if (sheet.rows.length !== width) {
    problems.push(`${sheet.rows.length} rows for a ${width}-wide grid: portraits are square`);
  }

  const used = new Set<string>();
  for (const row of sheet.rows) for (const ch of row) if (ch !== '.') used.add(ch);
  for (const ch of used) {
    if (!sheet.palette[ch]) problems.push(`glyph "${ch}" has no colour`);
  }
  for (const ch of Object.keys(sheet.palette)) {
    if (!used.has(ch)) problems.push(`colour "${ch}" is never drawn`);
  }

  if (problems.length) {
    bad += 1;
    console.error(`✗ ${sheet.name}`);
    for (const p of problems) console.error(`    ${p}`);
  } else {
    console.log(`✓ ${sheet.name}  ${width}×${sheet.rows.length}, ${used.size} colours`);
  }

  if (only) console.log(preview(sheet));
}

if (bad) process.exit(1);
