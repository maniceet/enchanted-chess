/** Balance harness. Sits every seat on the road opposite one fixed reference player and plays
 *  them out, so a rules change can be measured rather than argued about.
 *
 *  The reference "hero" is deliberately boring: a mid-depth search with a plain loadout. He is
 *  not meant to be good, he is meant to be *the same* before and after a change, so the numbers
 *  move only when the game does.
 *
 *    npx tsx scripts/balance.ts                  # every seat, 4 games each, as shipped
 *    npx tsx scripts/balance.ts kyrax ardax -n 6
 *    npx tsx scripts/balance.ts -n 6 -k 20000    # equal node caps: fast and load-independent
 *    npx tsx scripts/balance.ts -n 6 --nodes     # shipped caps, no clock: the ladder as built
 *    npx tsx scripts/balance.ts -k 20000 --hero queen   # the 8-mana Taunt-queen build
 *
 *  Reports, per seat: win/draw/loss from the hero's side, median and worst think time for the
 *  seat (so "the inn must answer at once" is a number), and how the games ended.
 */
import { applyAction } from '../src/engine/apply';
import {
  CAMPAIGN,
  FULL_ROAD,
  HOUSE,
  armorArmy,
  chooseAction,
  innkeeperLoadout,
  raiseArchbishops,
  raiseDragons,
  searchOptionsFor,
  type House,
} from '../src/engine/ai';
import { initialState } from '../src/engine/board';
import { applyLoadout, emptyLoadout } from '../src/engine/loadout';
import { TranspositionTable } from '../src/engine/search';
import { isError, type Action, type GameState } from '../src/engine/types';

/** Deterministic, so two runs of the same build agree and a diff in the numbers is a diff in
 *  the rules. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The builds the hero can bring, and their mana.
 *
 *  The harness used to know exactly one four-point loadout, which is a build no campaign player
 *  will ever actually hold: on the road you start at three mana and climb to ten. Measuring the
 *  ladder against a build nobody plays answers a question nobody asked, so the reference player
 *  can now be pointed at the real ends of the range.
 *
 *  `queen` is the one the spec flags as the balance risk — Taunt on the queen is four points on
 *  its own, and at eight mana you can afford it *and* an armoured knight and two armoured pawns. */
const HERO_BUILDS = {
  plain: {
    mana: 4,
    loadout: {
      ...emptyLoadout(),
      power: 'teleport' as const,
      powers: ['teleport', 'relocate', 'decree'] as const,
      enchantments: { b1: 'taunt' as const, e2: 'taunt' as const, d2: 'taunt' as const },
    },
  },
  bare: {
    mana: 2,
    loadout: { ...emptyLoadout(), power: 'teleport' as const, enchantments: {} },
  },
  /* What a traveller now walks out of the inn holding: three mana, and Taunt, which the
   * Innkeeper hands over when he falls. This is the build the middle of the road is actually
   * fought with, so it is the one to ask about when the complaint is that the middle starves. */
  starter: {
    mana: 3,
    loadout: {
      ...emptyLoadout(),
      power: 'teleport' as const,
      powers: ['teleport', 'relocate', 'decree'] as const,
      enchantments: { b1: 'taunt' as const, e2: 'taunt' as const },
    },
  },
  queen: {
    mana: 8,
    loadout: {
      ...emptyLoadout(),
      power: 'teleport' as const,
      powers: ['teleport', 'relocate', 'decree'] as const,
      enchantments: {
        d1: 'taunt' as const,
        b1: 'taunt' as const,
        e2: 'taunt' as const,
        d2: 'taunt' as const,
      },
    },
  },
  /* The far end of a finished run: the ceiling mana, the boons the road hands out, and the
   * budget spent on the pieces that carry them. This is the build the question "can the top of
   * the ladder still beat a player who has everything?" is actually about — measuring Kyrax and
   * Wittex against a four-point traveller answers a different, easier question. */
  maxed: {
    mana: 10,
    dragons: 2,
    archbishops: 2,
    loadout: {
      ...emptyLoadout(),
      power: 'teleport' as const,
      powers: ['teleport', 'relocate', 'decree'] as const,
      enchantments: {
        d1: 'taunt' as const,
        b1: 'taunt' as const,
        g1: 'taunt' as const,
        e2: 'taunt' as const,
        d2: 'taunt' as const,
      },
    },
  },
} as const;

type HeroBuild = keyof typeof HERO_BUILDS;

const HERO = { depth: 5, sample: 24, budgetMs: 1200 };

/** What the hero's 1200 ms buys on a quiet 2024 laptop, frozen as a number so `--nodes` can
 *  hold him still while the seats vary. Chosen to sit between the teaching seats and the Wit:
 *  he is meant to be beaten by the top of the ladder and to beat the bottom of it. */
const HERO_NODES = 60_000;

interface Game {
  outcome: 'win' | 'draw' | 'loss';
  reason: string;
  plies: number;
  houseThinks: number[];
  /** Ply on which the seat spent its King power, or null if it never did. A once-per-game
   *  resource burned on move three for a tempo is a resource wasted, and it is the sort of
   *  thing that makes an opponent look foolish without ever showing up in the win rate. */
  powerPly: number | null;
}

function build(who: House, seed: number, hero: HeroBuild): GameState {
  const profile = HOUSE[who];
  const base = initialState({});
  const black = innkeeperLoadout(base, 'b', {
    power: profile.power,
    // The seat's own mana, matching the game. Before this the harness measured every seat at
    // the duelling budget, which is not the opponent anybody actually faces.
    budget: profile.mana,
    rng: seeded(seed),
  });
  const { loadout, mana } = HERO_BUILDS[hero];
  // The seat always spends the duelling four; only the traveller's purse varies.
  const ready = applyLoadout(applyLoadout(base, 'w', loadout, mana), 'b', black, profile.mana);
  // The traveller's own boons, when the build carries them. Raised before the seat's so the
  // two sides are built by the same code path and a bug in it cannot favour one of them.
  const spec = HERO_BUILDS[hero] as { dragons?: number; archbishops?: number };
  const heroMounted = spec.dragons ? raiseDragons(ready, 'w', { count: spec.dragons }) : ready;
  const heroOrdained = spec.archbishops
    ? raiseArchbishops(heroMounted, 'w', { count: spec.archbishops })
    : heroMounted;
  const mounted = profile.dragons ? raiseDragons(heroOrdained, 'b', profile.dragons) : heroOrdained;
  const ordained = profile.archbishops
    ? raiseArchbishops(mounted, 'b', profile.archbishops)
    : mounted;
  const armored = profile.armored ? armorArmy(ordained, 'b', profile.armored) : ordained;
  // The two teaching seats bring no King's word, exactly as they do in the game.
  return profile.power === null
    ? { ...armored, powers: { ...armored.powers, b: { ...armored.powers.b, used: true } } }
    : armored;
}

interface Caps {
  /** Same cap for every seat and the hero. */
  override?: number;
  /** Keep each seat's shipped cap, but drop the wall clock. */
  shippedNodes?: boolean;
  /** The Deadly Duel: every seat searches as the one above it does.
   *
   *  Only meaningful alongside `--nodes`, since `-k` forces one cap on everybody and would
   *  erase the whole effect. Shipped on reasoning about the node table; this is the flag that
   *  makes it a measurement instead. */
  deadly?: boolean;
  /** A/B: restore uniform sampling, so the narrow seats can drop a free capture again. Only
   *  the sampling seats (drunkard aside, the ones below the Wit) can move on this at all. */
  uniform?: boolean;
  /** A/B: how much better a King power must look than the best ordinary move before a seat
   *  spends it. Shipped is 60. The question this exists to answer is why two seats never call
   *  one at all. */
  powerMargin?: number;
}

function playOne(
  who: House,
  seed: number,
  maxPlies: number,
  caps: Caps = {},
  hero: HeroBuild = 'plain',
): Game {
  const profile = HOUSE[who];
  const rng = seeded(seed);
  const houseTable = new TranspositionTable();
  const heroTable = new TranspositionTable();
  let state = build(who, seed, hero);
  const houseThinks: number[] = [];
  let powerPly: number | null = null;
  const untimed = caps.override !== undefined || caps.shippedNodes === true;

  for (let ply = 0; ply < maxPlies && state.status.kind === 'ongoing'; ply++) {
    const isHouse = state.turn === 'b';
    const started = performance.now();
    const choice = isHouse
      ? chooseAction(state, {
          ...searchOptionsFor(profile, caps.deadly),
          budgetMs: untimed ? undefined : profile.budgetMs,
          maxNodes: caps.override ?? searchOptionsFor(profile, caps.deadly).maxNodes,
          ...(caps.uniform ? { keepTactics: false } : {}),
          ...(caps.powerMargin !== undefined ? { powerMargin: caps.powerMargin } : {}),
          rng,
          table: houseTable,
        })
      : chooseAction(state, {
          ...HERO,
          budgetMs: untimed ? undefined : HERO.budgetMs,
          // The hero has no shipped cap of his own, so --nodes gives him the reference one.
          // Without it he would be the only unbounded searcher in the run.
          maxNodes: caps.override ?? (caps.shippedNodes ? HERO_NODES : undefined),
          rng,
          table: heroTable,
        });
    const elapsed = performance.now() - started;
    if (isHouse) houseThinks.push(elapsed);

    if (!choice) break;
    if (isHouse && choice.action.type === 'power' && powerPly === null) powerPly = state.ply;
    const next = applyAction(state, choice.action as Action);
    if (isError(next)) throw new Error(`${who} produced an illegal action: ${next.error}`);
    state = next;
  }

  const status = state.status;
  const outcome =
    status.kind === 'checkmate' || status.kind === 'resigned'
      ? status.winner === 'w'
        ? 'win'
        : 'loss'
      : 'draw';
  const reason = status.kind === 'ongoing' ? 'unfinished' : status.kind;
  return { outcome, reason, plies: state.ply, houseThinks, powerPly };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function main(): void {
  const args = process.argv.slice(2);
  const nIndex = args.findIndex((a) => a === '-n');
  const games = nIndex >= 0 ? Number(args[nIndex + 1]) : 4;
  const kIndex = args.findIndex((a) => a === '-k');
  // With -k every seat and the hero get the same node cap instead of their own budgets: a fast,
  // load-independent comparative run. Without it the seats play exactly as they ship.
  const nodeOverride = kIndex >= 0 ? Number(args[kIndex + 1]) : undefined;
  // Each seat keeps its *own* shipped node cap, but the millisecond budget is dropped.
  //
  // This is the honest way to ask "is the ladder monotone as shipped". A plain run is not:
  // `budgetMs` is a responsiveness guard, not a strength setting, so whichever of the two caps
  // bites first wins — and under any load at all that is the clock. A busy machine therefore
  // reports a *weaker* Dragonlord than a quiet one, which makes the ladder look like it moved
  // when only the laptop did. Anything that must be comparable across runs belongs here.
  const shippedNodes = args.includes('--nodes');
  const deadly = args.includes('--deadly');
  const uniform = args.includes('--uniform');
  const pmIndex = args.findIndex((a) => a === '--power-margin');
  const powerMargin = pmIndex >= 0 ? Number(args[pmIndex + 1]) : undefined;
  const hIndex = args.findIndex((a) => a === '--hero');
  const named2 = hIndex >= 0 ? args[hIndex + 1] : 'plain';
  const heroBuild: HeroBuild = named2 in HERO_BUILDS ? (named2 as HeroBuild) : 'plain';
  // Named against the *full* road, so `wittex` can be asked for by name. He stays out of the
  // default sweep: he is not part of the ladder as advertised, and a run of "every seat" should
  // mean the seven a player can see.
  const named = args.filter((a) => (FULL_ROAD as string[]).includes(a)) as House[];
  const seats = named.length ? named : CAMPAIGN;
  const maxPlies = 260;

  console.log(
    `hero: ${heroBuild} (${HERO_BUILDS[heroBuild].mana} mana), depth ${HERO.depth}, sample ${HERO.sample}, ` +
      (nodeOverride
        ? `${nodeOverride} nodes (override, all seats)`
        : shippedNodes
          ? `${HERO_NODES} nodes · seats on their own caps, no clock${deadly ? ' · DEADLY DUEL' : ''}`
          : `${HERO.budgetMs}ms`) +
      (uniform ? ' · UNIFORM SAMPLING (captures droppable)' : '') +
      (powerMargin !== undefined ? ` · power margin ${powerMargin}` : '') +
      '\n',
  );
  console.log(
    ['seat', 'W-D-L', 'plies', 'think p50', 'worst', 'power@ply', 'endings'].join('\t'),
  );

  for (const who of seats) {
    const played: Game[] = [];
    for (let i = 0; i < games; i++) {
      played.push(
        playOne(
          who,
          1000 + i * 7919,
          maxPlies,
          { override: nodeOverride, shippedNodes, deadly, uniform, powerMargin },
          heroBuild,
        ),
      );
    }

    const thinks = played.flatMap((g) => g.houseThinks);
    const tally = { win: 0, draw: 0, loss: 0 };
    for (const g of played) tally[g.outcome]++;
    const endings = new Map<string, number>();
    for (const g of played) endings.set(g.reason, (endings.get(g.reason) ?? 0) + 1);

    console.log(
      [
        who,
        `${tally.win}-${tally.draw}-${tally.loss}`,
        // The number that actually matters on the road. Chess scores a draw as a half, but a
        // walk is one unbroken thing: a drawn game ends the attempt exactly as a loss does, so
        // from the traveller's chair a seat either lets you past or it does not. Reading the
        // ladder by chess score made the Armored Knight look *easier* than the Wit when in
        // campaign terms the two stop a player equally often.
        `${Math.round((100 * tally.win) / played.length)}%`.padStart(6),
        Math.round(played.reduce((a, g) => a + g.plies, 0) / played.length),
        `${Math.round(percentile(thinks, 0.5))}ms`,
        `${Math.round(Math.max(...thinks))}ms`,
        (() => {
          const spent = played.map((g) => g.powerPly).filter((p): p is number => p !== null);
          if (!spent.length) return 'never';
          return `${Math.round(percentile(spent, 0.5))} (${spent.length}/${played.length})`;
        })(),
        [...endings].map(([k, v]) => `${k}×${v}`).join(' '),
      ].join('\t'),
    );
  }
}

main();
