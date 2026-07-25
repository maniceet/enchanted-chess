/** Nodes per second, by position shape.
 *
 *  A seat is defined by `maxNodes`, which is only an honest definition if a node costs roughly
 *  the same everywhere. It did not: one Ardax move in a `--nodes` balance run took 204 seconds
 *  against a two second median, which is about 1,600 nodes/sec where the same search normally
 *  manages six figures. This measures the shapes suspected of being expensive so the claim can
 *  be checked rather than argued about.
 *
 *    npx tsx scripts/nps.ts
 */
import { initialState, parseSquare } from '../src/engine/board';
import { armorArmy, chooseAction } from '../src/engine/ai';
import { applyLoadout, emptyLoadout } from '../src/engine/loadout';
import { TranspositionTable } from '../src/engine/search';
import type { GameState, PowerName } from '../src/engine/types';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A plain start, with whatever twist the case needs. */
function build(opts: {
  armor?: boolean;
  power?: PowerName;
  graveyard?: GameState['graveyard'];
  logLength?: number;
}): GameState {
  const base = initialState({});
  const white = applyLoadout(base, 'w', { ...emptyLoadout(), power: opts.power ?? 'teleport' });
  const both = applyLoadout(white, 'b', {
    ...emptyLoadout(),
    power: 'teleport',
    enchantments: { d7: 'taunt', e7: 'taunt' },
  });
  let state = opts.armor ? armorArmy(both, 'b', 'all') : both;
  if (opts.graveyard) state = { ...state, graveyard: opts.graveyard };
  if (opts.power === 'revive') {
    state = { ...state, powers: { ...state.powers, w: { ...state.powers.w, reserve: 3 } } };
  }
  // A long game carries a long action log and a fat repetition table. Both are copied by
  // `settle`, so their size is exactly the thing under suspicion.
  if (opts.logLength) {
    const log = Array.from({ length: opts.logLength }, () => ({
      type: 'move' as const,
      from: parseSquare('e2'),
      to: parseSquare('e4'),
    }));
    const repetition: Record<string, number> = {};
    for (let i = 0; i < opts.logLength; i++) repetition[`filler-${i}`] = 1;
    state = { ...state, log, repetition };
  }
  return state;
}

function measure(name: string, state: GameState, nodes: number): void {
  const started = performance.now();
  const choice = chooseAction(state, {
    depth: 9,
    sample: 40,
    maxNodes: nodes,
    rng: seeded(7),
    table: new TranspositionTable(),
  });
  const ms = performance.now() - started;
  const nps = Math.round(nodes / (ms / 1000));
  console.log(
    `${name.padEnd(42)} ${String(Math.round(ms)).padStart(7)}ms  ${String(nps).padStart(9)} nodes/s  depth ${choice?.depth ?? 0}`,
  );
}

/** A position where the *cheap* path is barely used.
 *
 *  `Searcher.advance` sends moves through `makeMove` and everything else through `applyAction`,
 *  which re-validates legality the search already established, copies the growing action log and
 *  runs a full `settle`. That measured as noise when I first looked — but I looked at a starting
 *  position, where almost every child is an ordinary move. Wittex now calls Destined Death on
 *  ply 1 of every game and the Armored Knight fields eight shielded pawns, so the expensive path
 *  ought to be a large share of the tree for exactly the seats that need to be fast.
 *
 *  MEASURED, AND IT IS NOT. These cases run at or above the speed of a plain board. The reason
 *  is `Searcher.actionsAt(state, withPowers)`: powers are generated at the *root only*, so the
 *  expensive `applyAction` path is walked once per depth iteration rather than once per node.
 *  Shield-breaks do reach interior nodes and still cost nothing measurable, because a side only
 *  generates them for enemy shields it is actually attacking.
 *
 *  So the asymmetry in `advance` is real in the code and immaterial in play. Left alone
 *  deliberately: it is not worth the risk of touching legality-checked paths to speed up
 *  something that is not slow. This note exists so it does not get chased a third time. */
function doomHeavy(): GameState {
  const base = initialState({ powers: { w: 'doom', b: 'teleport' } });
  return applyLoadout(applyLoadout(base, 'w', emptyLoadout('doom')), 'b', {
    ...emptyLoadout(),
    power: 'teleport',
    enchantments: { d7: 'taunt', e7: 'taunt', c7: 'taunt', f7: 'taunt' },
  });
}

const NODES = 60_000;

console.log(`\n${NODES} nodes per case, depth 9 / sample 40\n`);
measure('plain board', build({}), NODES);
measure('every black piece taunted', build({ armor: true }), NODES);
measure('white holds Revive with a graveyard', build({ power: 'revive', graveyard: { w: ['n', 'p'], b: [] } }), NODES);
measure('200-ply log and repetition table', build({ logLength: 200 }), NODES);
measure('all three at once', build({ armor: true, power: 'revive', graveyard: { w: ['n', 'p'], b: [] }, logLength: 200 }), NODES);
measure('Destined Death, four shielded pawns', doomHeavy(), NODES);
measure('the same, 200 plies in', { ...doomHeavy(), ...(() => { const s = build({ logLength: 200 }); return { log: s.log, repetition: s.repetition }; })() }, NODES);
console.log('');
