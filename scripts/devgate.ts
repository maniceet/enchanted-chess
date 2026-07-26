/* Fails if a dev-only shortcut has leaked into the production bundle.
 *
 * `run.ts` can start a run at the eighth table so the Dragonlord's brother can be looked at
 * without walking the road five times. That is a playtest convenience and it is gated on
 * `import.meta.env.DEV` — but "gated" turned out to mean two different things, and only one of
 * them is worth anything.
 *
 * The first version shipped the seeded state inside the production bundle. It never fired,
 * because the runtime value was false — but a switch that hands the player a finished campaign
 * was sitting in the released app, which is closer than it should ever be. Unreachable is not
 * the same as absent.
 *
 * Making the state a function fixed it: with the branches folded away it becomes unreferenced
 * and tree-shaking removes it, where a module-level object survived. Note that the obvious
 * culprit — optional chaining defeating Vite's text substitution — was *not* it; reverting only
 * that does not reproduce the leak. Which is the point of this file. The failure was invisible
 * in the source, my explanation of it was wrong, and neither of those facts stopped the data
 * shipping. So this looks at the bundle instead of at the reasoning.
 *
 *   npm run check:devgate
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/assets';

/** Values that appear only in the dev shortcut. Deliberately specific: `clears:5` is a number a
 *  real save could hold, but it cannot appear as a *literal* in the shipped code unless the
 *  seeded state came with it. */
const FORBIDDEN = ['clears:5', 'walkPurse:120', 'sorcererSeen:!0,divineCall:!0'];

let files: string[];
try {
  files = readdirSync(DIST).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`no ${DIST} — run \`npm run build\` first.`);
  process.exit(1);
}

const found: string[] = [];
for (const file of files) {
  const source = readFileSync(join(DIST, file), 'utf8');
  for (const needle of FORBIDDEN) {
    if (source.includes(needle)) found.push(`${file}: ${needle}`);
  }
}

if (found.length) {
  console.error('Dev-only run state leaked into the production bundle:\n');
  for (const hit of found) console.error(`  ${hit}`);
  console.error('\nSee the note above `atWittex` in src/ui/run.ts.');
  process.exit(1);
}

console.log(`No dev-only run state in ${files.length} bundled scripts.`);
