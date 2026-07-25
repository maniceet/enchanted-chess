/** Head-to-head A/B for a search change.
 *
 *  A mate suite tells you whether the engine can see a mate it was always going to see. It
 *  does not tell you whether a change makes the engine *win more*, which is the only question
 *  that matters for a search tweak. So: two configurations of the same engine, identical node
 *  budgets, playing each other from a spread of openings with colours alternated, and a score
 *  at the end.
 *
 *  Node budgets rather than time budgets, so the result is the same on a busy laptop.
 *
 *    npx tsx scripts/ab.ts                 # 24 games, 20k nodes each
 *    npx tsx scripts/ab.ts -n 40 -k 40000
 *    npx tsx scripts/ab.ts -n 60 -t 300    # milliseconds per move instead of nodes
 *
 *  Use `-k` (nodes) for anything that changes *what* the search looks at: the result is then
 *  the same on a busy laptop. Use `-t` (time) for anything that changes what a node *costs* —
 *  pruning, move ordering, evaluation weight — because a node budget is blind to exactly that
 *  trade, and time is what the seats are actually given.
 *
 *  ON READING THE VERDICT. This engine draws about 47% of its games against itself at 20k
 *  nodes — measured, and the same with Taunt-heavy loadouts as with none, so it is a property
 *  of two equal searches and not of the enchantments. Half the sample therefore carries no
 *  signal, which is why almost everything lands "inside the noise" at n = 40 or 60. Budget
 *  accordingly: 100+ games for a small effect, and use `--seed` to get a genuinely independent
 *  second sample rather than re-running the same games.
 */
import { applyAction } from '../src/engine/apply';
import { chooseAction, type InnkeeperOptions } from '../src/engine/ai';
import { initialState } from '../src/engine/board';
import { applyLoadout, emptyLoadout } from '../src/engine/loadout';
import { TranspositionTable } from '../src/engine/search';
import { isError, type Action, type Color, type Enchantment, type GameState } from '../src/engine/types';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The two sides of the experiment. Everything except the flag under test is identical.
 *
 *  Two experiments have been run through this harness and both were rejected; the reasoning
 *  for each lives beside the option in `search.ts`.
 *
 *    powerPly: 1        20   / 60   33.3% ± 12.9   width costs depth
 *    gradedBreaks       22.5 / 60   37.5% ± 12.9   a shield-break is a capture in two parts */
const A = { name: 'shield-breaks graded by what they expose', gradedBreaks: true } as const;
const B = { name: 'flat shield-break ordering (shipped)', gradedBreaks: false } as const;

/** A spread of enchanted loadouts, so the sample is not one position played forty times.
 *
 *  Taunt-heavy on purpose while shield-break ordering is the thing under test: an experiment
 *  about how shield-breaks are sorted needs positions where shield-breaks actually exist. */
const TAUNT_BUILDS: Record<string, Enchantment>[] = [
  { d1: 'taunt', e2: 'taunt' },
  { b1: 'taunt', e2: 'taunt', d2: 'taunt' },
  { d1: 'taunt', a2: 'taunt', h2: 'taunt' },
  { c1: 'taunt', f2: 'taunt', b2: 'taunt' },
  { b1: 'taunt', c1: 'taunt' },
  { d1: 'taunt', c2: 'taunt', f2: 'taunt' },
];

/** The same spread with the armour taken off, for measuring what Taunt does to a game rather
 *  than to a search. Same piece counts, same squares, different enchantment. */
const BARE_BUILDS: Record<string, Enchantment>[] = [
  {},
  { e2: 'martyr', d2: 'martyr' },
  { a2: 'martyr', h2: 'martyr' },
  { f2: 'outpost', b2: 'martyr' },
  {},
  { c2: 'martyr', f2: 'outpost' },
];

/** `--builds bare` swaps the loadouts without touching anything else, so running the harness
 *  twice with both configurations identical measures the *rules*, not a code change. */
const BUILDS: Record<string, Enchantment>[] =
  process.argv.includes('bare') ? BARE_BUILDS : TAUNT_BUILDS;

/** The builds are written from White's side, so Black's copy is reflected across the middle:
 *  same file, rank r becomes 9 - r. */
function mirror(book: Record<string, Enchantment>): Record<string, Enchantment> {
  const out: Record<string, Enchantment> = {};
  for (const [square, ench] of Object.entries(book)) {
    out[`${square[0]}${9 - Number(square[1])}`] = ench;
  }
  return out;
}

/** Both sides hold Revive, with points left over to pay for it. Kept from the previous
 *  experiment: a power that can actually be afforded makes for livelier games than Teleport,
 *  which mostly declines to be used. */
const AB_BUDGET = 7;

function build(index: number): GameState {
  const base = initialState({});
  const white = {
    ...emptyLoadout('revive'),
    enchantments: BUILDS[index % BUILDS.length],
  };
  const black = {
    ...emptyLoadout('revive'),
    enchantments: mirror(BUILDS[(index + 3) % BUILDS.length]),
  };
  return applyLoadout(
    applyLoadout(base, 'w', white, AB_BUDGET),
    'b',
    black,
    AB_BUDGET,
  );
}

interface Result {
  winner: Color | 'draw';
  plies: number;
  reason: string;
}

function play(
  cfgWhite: typeof A | typeof B,
  seed: number,
  index: number,
  nodes: number,
  budgetMs?: number,
): Result {
  const rng = seeded(seed);
  const tables = { w: new TranspositionTable(), b: new TranspositionTable() };
  let state = build(index);

  for (let ply = 0; ply < 300 && state.status.kind === 'ongoing'; ply++) {
    const cfg = state.turn === 'w' ? cfgWhite : cfgWhite === A ? B : A;
    const options: InnkeeperOptions = {
      depth: 12,
      sample: 40,
      ...(budgetMs === undefined ? { maxNodes: nodes } : { budgetMs }),
      rng,
      table: tables[state.turn],
      gradedBreaks: cfg.gradedBreaks,
    };
    const choice = chooseAction(state, options);
    if (!choice) break;
    const next = applyAction(state, choice.action as Action);
    if (isError(next)) throw new Error(`illegal action: ${next.error}`);
    state = next;
  }

  const status = state.status;
  const winner =
    status.kind === 'checkmate' || status.kind === 'resigned' ? status.winner : ('draw' as const);
  return { winner, plies: state.ply, reason: status.kind };
}

function main(): void {
  const args = process.argv.slice(2);
  const at = (flag: string, fallback: number) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const games = at('-n', 24);
  const nodes = at('-k', 20_000);
  // Everything about game `i` — its seed and its loadout — used to derive from `i` alone, which
  // made the harness silently non-independent across runs: a 40-game run was byte-for-byte the
  // first 40 games of a 60-game run, and pooling the two would have counted the same games
  // twice and manufactured a significance that was not there. `--seed` shifts the whole series
  // so a second sample is genuinely a second sample.
  const seedOffset = at('--seed', 0);
  const perMove = args.includes('-t') ? at('-t', 300) : undefined;

  let aScore = 0;
  let bScore = 0;
  let draws = 0;
  let plies = 0;
  // How games end is as informative as who wins: a wall of unfinished games means the sample
  // has no resolution and the verdict below is worth little whatever it says.
  const endings = new Map<string, number>();
  const started = Date.now();

  for (let i = 0; i < games; i++) {
    // Alternate which configuration holds White, so first-move advantage cancels out.
    const aIsWhite = i % 2 === 0;
    const g = i + seedOffset;
    const result = play(aIsWhite ? A : B, 7919 + g * 104_729, g, nodes, perMove);
    plies += result.plies;
    endings.set(result.reason, (endings.get(result.reason) ?? 0) + 1);
    if (result.winner === 'draw') {
      draws++;
      aScore += 0.5;
      bScore += 0.5;
    } else {
      const aWon = (result.winner === 'w') === aIsWhite;
      if (aWon) aScore++;
      else bScore++;
    }
    process.stdout.write(
      `game ${String(i + 1).padStart(3)}  ${A.name} as ${aIsWhite ? 'white' : 'black'}` +
        `  ->  ${result.winner} (${result.reason}, ${result.plies} plies)   ` +
        `running ${aScore} - ${bScore}\n`,
    );
  }

  const pct = (aScore / games) * 100;
  console.log(
    perMove === undefined
      ? `budget: ${nodes} nodes per move (load-independent)${seedOffset ? `, seed offset ${seedOffset}` : ''}`
      : `budget: ${perMove} ms per move (load-sensitive — do not run anything else)`,
  );
  // Two standard errors on a games-scored-out-of-N sample, which is the honest bar for
  // calling a search change an improvement rather than noise.
  const stderr = Math.sqrt(0.25 / games) * 100;
  console.log(
    `\n${A.name} scored ${aScore} / ${games} (${pct.toFixed(1)}% ± ${(2 * stderr).toFixed(1)}), ` +
      `${draws} draws, ${Math.round(plies / games)} plies avg, ${Math.round((Date.now() - started) / 1000)}s`,
  );
  console.log('endings: ' + [...endings].map(([k, v]) => `${k}×${v}`).join('  '));
  console.log(
    pct - 2 * stderr > 50
      ? 'Verdict: measurably better.'
      : pct + 2 * stderr < 50
        ? 'Verdict: measurably WORSE — revert it.'
        : 'Verdict: inside the noise at this sample size. Not proven either way.',
  );
}

main();
