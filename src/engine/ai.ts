import {
  FILES,
  PIECE_VALUE,
  blastZone,
  findKing,
  inOwnHalf,
  opposite,
  relativeRank,
  sq,
  squareName,
} from './board';
import {
  BUDGET,
  carrierError,
  costOf,
  emptyLoadout,
  type Loadout,
} from './loadout';
import { isAttacked, isShielded, legalMoves, shieldBreakActions } from './movegen';
import { powerActions } from './powers';
import { Searcher, TranspositionTable } from './search';
import {
  type Action,
  type Color,
  type Enchantment,
  type GameState,
  type Piece,
  type PieceType,
  type PowerName,
} from './types';

/** The Innkeeper: a small, honest opponent for when no other traveller is at the table.
 *
 *  It counts material and nothing else, treats mate as infinite, and searches a shallow
 *  negamax tree. At every node it looks at only a random sample of the available moves
 *  (`depth * 3` by default), which keeps the search cheap, keeps its games varied, and keeps
 *  it beatable. Pure TS: no DOM, no timers, deterministic when handed a seeded `rng`.
 */

export { MATE_SCORE, TranspositionTable } from './search';

/** Three regulars drink here, and they play nothing alike. */
export type House =
  | 'drunkard'
  | 'innkeeper'
  | 'rolain'
  | 'wit'
  | 'armored'
  | 'ardax'
  | 'kyrax'
  /** The truth at the end of it. Not on the road until the Dragonlord has fallen five times. */
  | 'wittex';

export interface HouseProfile {
  label: string;
  blurb: string;
  /** Ceiling on iterative deepening, not a promise. `maxNodes` almost always bites first: on a
   *  2024 laptop Kyrax's 450k nodes reach depth 7 of his nominal 12, and Ardax reaches 6 of 9.
   *  Raising this number alone changes nothing — raise `maxNodes` to make a seat stronger. */
  depth: number;
  sample: number;
  /** Whether this seat understands the magic it is carrying. Defaults to whether it is wide;
   *  set explicitly only where the encounter needs a shallow seat that is not blind. */
  magic?: boolean;
  /** The drunkard does not search at all. He simply reaches for a piece. */
  random?: boolean;
  /** Wall-clock ceiling for the search. The teaching seats get none: they answer at once.
   *
   *  This is a **responsiveness** guard, not a strength setting. Left on its own it would make
   *  a seat as strong as the machine it runs on: the same 3500 ms buys the Dragonlord several
   *  times as many nodes on a desktop as on a phone, so two players would face two different
   *  opponents under one name. `maxNodes` is what actually defines the seat; `budgetMs` only
   *  promises that a slow device still answers in reasonable time. */
  budgetMs?: number;
  /** How much of the tree this seat is allowed to see. Load-independent, so the seat plays the
   *  same everywhere. Whichever of this and `budgetMs` bites first ends the search. */
  maxNodes?: number;
  /** Beat before the reply lands, so a move can be seen arriving. */
  pauseMs: number;
  /** How often this one opens its mouth on a notable move. */
  banter: number;
  /** Dragon riders field dragons in place of knights, and may shield them. Bosses are exempt
   *  from the four point budget on purpose: better pieces are the whole threat. */
  dragons?: { count: number; taunt: boolean };
  /** Archbishops in place of bishops. Wittex is the only seat that fields them: the piece is
   *  a rare boon on the road, and meeting two of them at the last table is the point. */
  archbishops?: { count: number; taunt: boolean };
  /** Armour: the pieces in scope carry Taunt, so anything defended costs a whole turn to
   *  strip. Omitted means no armour at all. */
  armored?: ArmorScope;
  /** Some of them always call the same thing. Ardax raises the dead, and always will. */
  power?: PowerName;
  /** The dragon line. Marked so the road can frame them differently. */
  boss?: boolean;
}

export const HOUSE: Record<House, HouseProfile> = {
  // The first two seats exist to teach the rules, so they answer at once.
  drunkard: {
    label: 'The Drunken Knight',
    blurb: 'Was somebody once. Cannot see the board now, and plays whatever his hand lands on.',
    depth: 1,
    sample: 1,
    random: true,
    pauseMs: 220,
    banter: 0.5,
  },
  // Solid but shallow: he punishes hanging pieces and little else.
  innkeeper: {
    label: 'The Innkeeper',
    blurb: 'Thirty years behind this table. Takes what you leave lying about, and says nothing at all.',
    depth: 3,
    sample: 10,
    budgetMs: 250,
    maxNodes: 8_000,
    pauseMs: 260,
    banter: 0,
  },
  // The princess brings a dragon so you learn what one does before it matters.
  rolain: {
    label: 'Princess Rolain',
    // "No tricks" was true when the seats had fixed loadouts. They draw a fresh book every
    // attempt now, so the promise the card can still keep is the narrow one: her *dragon* is
    // bare. Claiming more than that gets contradicted on the reveal screen two clicks later.
    blurb: 'Rides one bare dragon — her father keeps the magic for himself — so that you learn its shape before he shows you his.',
    // She is here to teach the dragon, not to be a wall. Shallow, and narrow enough to miss
    // things, so the lesson lands without the fight becoming one.
    depth: 3,
    sample: 10,
    budgetMs: 350,
    maxNodes: 10_000,
    pauseMs: 260,
    banter: 0.6,
    dragons: { count: 1, taunt: false },
  },
  wit: {
    label: 'The Wit',
    blurb: 'A wise man on the road who talks more than he walks. Will not let you pass untested.',
    depth: 6,
    sample: 40,
    budgetMs: 400,
    maxNodes: 24_000,
    pauseMs: 260,
    banter: 0.7,
  },
  // The gate. He sits at seat 5, after the Wit, and has to be harder than the Wit or the road
  // dips in the middle — you beat a real opponent at four and then walk through five.
  //
  // He used to be the inn's shallow search wearing a full suit of Taunt, on the theory that the
  // plate was the difficulty. It is not: a shield costs an attacker one tempo per piece, which
  // does not come close to offsetting a search deficit, and he measured 6-0-0 against the
  // reference hero in full armour. So the difficulty is where difficulty actually lives — nodes
  // — and the plate is now flavour and friction rather than a load-bearing wall. It sits
  // between the Wit's 220k and Ardax's 320k, keeping the ladder monotone.
  armored: {
    label: 'The Armored Knight',
    blurb:
      'Guards the castle gate in full plate, and every pawn he owns wears the same. Plate is for standing in: it holds on his four ranks and nowhere else.',
    depth: 8,
    sample: 40,
    // Redundant with `sample: 40` today, and kept anyway: it pins the guarantee that this seat
    // understands the magic it is wearing, so tuning his sample down later cannot quietly make
    // him blind to his own armour again. `seats.test.ts` enforces it.
    magic: true,
    budgetMs: 600,
    maxNodes: 55_000,
    pauseMs: 260,
    banter: 0.5,
    armored: 'pawns',
  },
  // The necromancer: whatever you take, he calls back.
  ardax: {
    label: 'Prince Ardax',
    blurb: 'The Dragonlord’s son. Rides a shielded dragon, and practices necromancy: what falls does not stay down.',
    depth: 9,
    sample: 40,
    budgetMs: 800,
    maxNodes: 90_000,
    pauseMs: 280,
    banter: 0.8,
    power: 'revive',
    boss: true,
    dragons: { count: 1, taunt: true },
  },
  // The truth. The Wit has been at the far end of this road the whole time, wearing a smaller
  // name and letting a prisoner take the blame for him.
  //
  // He must be harder than the Dragonlord, and he is, by a different route: no dragons at all,
  // because the threat is not cavalry. Destined Death is repeatable, so every turn he spends on
  // it removes a piece three turns later whatever anyone does about it — the strongest thing in
  // the game, on top of the deepest search in the game.
  wittex: {
    label: 'Dark Lord Wittex',
    blurb:
      'The wise man on the road, under the name he uses in Shivlar. He never needed dragons. He marks a piece and it dies, and he can do it again next turn.',
    depth: 10,
    sample: 64,
    budgetMs: 1200,
    maxNodes: 125_000,
    pauseMs: 320,
    banter: 0.9,
    power: 'doom',
    boss: true,
    // He does not need cavalry to be frightening, and he brings it anyway. Two dragons and two
    // Archbishops is the whole bestiary at one table: the pieces the road handed out one rare
    // drop at a time, all of them at once, on the other side.
    dragons: { count: 2, taunt: true },
    archbishops: { count: 2, taunt: true },
  },
  // The end of the road. Two shielded dragons and a search that reads to the bottom.
  kyrax: {
    label: 'Dragonlord Kyrax',
    blurb: 'Both his dragons are shielded, and he has read this board before you sat down.',
    depth: 9,
    sample: 60,
    budgetMs: 1000,
    maxNodes: 115_000,
    pauseMs: 300,
    banter: 0.85,
    boss: true,
    dragons: { count: 2, taunt: true },
  },
};

/** What a seat holds back when its power is Revive: enough to call a knight or a bishop out of
 *  the graveyard, which is the version of the power worth building a character around. */
export const REVIVE_RESERVE = 3;

/** The campaign, in the order the house will let you play it. */
export const CAMPAIGN: House[] = [
  'drunkard',
  'innkeeper',
  'rolain',
  'wit',
  'armored',
  'ardax',
  'kyrax',
];

/** What the road is for a traveller who has learned what it is really about.
 *
 *  Kept out of `CAMPAIGN` on purpose. That list is the road as the world advertises it, and it
 *  is what `best`, the ledger and every "seat n of 7" counter are measured against. Wittex is
 *  not a seat you work towards; he is a thing you find out. */
export const WITTEX_CLEARS_REQUIRED = 5;

export const FULL_ROAD: House[] = [...CAMPAIGN, 'wittex'];

/** What a seat's profile means to the search. Every caller goes through here, so a field added
 *  to `HouseProfile` reaches the engine instead of being quietly dropped by whichever call site
 *  forgot to copy it — which is exactly how the Armored Knight came to be searching without
 *  `magic`. */
export function searchOptionsFor(profile: HouseProfile, deadly = false): InnkeeperOptions {
  const base: InnkeeperOptions = {
    depth: profile.depth,
    sample: profile.sample,
    magic: profile.magic,
    random: profile.random,
    // The node cap is what makes a seat the same opponent on a phone and a desktop; the
    // millisecond budget only keeps a slow device answering promptly.
    maxNodes: profile.maxNodes,
    budgetMs: profile.budgetMs,
  };
  if (!deadly) return base;

  const up = sharpened(profile);
  return {
    ...base,
    // Depth as well as nodes. Raising the cap alone is inert for the shallow seats — Rolain
    // finishes her nominal depth 3 long before ten thousand nodes, let alone two hundred
    // thousand — so "one notch" has to move the ceiling too. Measured: without this her result
    // moved only because `magic` and `sample` did, and the node bump did nothing whatever.
    depth: Math.max(profile.depth, up.depth),
    // And the drunk actually has to look at the board. `chooseAction` tests `random` before it
    // reads any other option, so every sharpening below was silently discarded for him: he
    // measured 6-0-0 under the Deadly Duel exactly as he does without it.
    random: false,
    magic: true,
    sample: Math.max(profile.sample, 24),
    maxNodes: up.maxNodes,
    budgetMs: up.budgetMs,
  };
}

/** A seat playing one notch above itself, for the Deadly Duel.
 *
 *  "One notch" means the next seat's search, which is a promise the ladder can actually keep:
 *  the Drunken Knight stops reaching for pieces and plays like the keeper, and the Dragonlord
 *  plays as Wittex does. The last seat has nothing above it, so it gets half again.
 *
 *  Node counts, not depth — `depth` is a ceiling the node cap reaches first, so raising it on
 *  its own would change nothing at all. */
function sharpened(profile: HouseProfile): { depth: number; maxNodes?: number; budgetMs?: number } {
  const index = FULL_ROAD.findIndex((who) => HOUSE[who] === profile);
  const above = index >= 0 && index + 1 < FULL_ROAD.length ? HOUSE[FULL_ROAD[index + 1]] : null;
  const nodes = above?.maxNodes ?? Math.round((profile.maxNodes ?? 8_000) * 1.5);
  return {
    depth: Math.max(above?.depth ?? profile.depth + 2, profile.depth),
    maxNodes: Math.max(nodes, profile.maxNodes ?? 0),
    budgetMs: Math.max(above?.budgetMs ?? 0, profile.budgetMs ?? 0) || undefined,
  };
}

/** Straps armour onto an army: every piece in scope that carries nothing else gains Taunt.
 *  Defended pieces then cost an attacker a full turn to strip, which is what makes an armoured
 *  opponent a wall rather than a threat.
 *
 *  `'pawns'` is the scope the Armored Knight ships with. A full suit is not a harder *search* —
 *  measured against the reference hero the seat lost either way — but it is a much heavier
 *  board to sit opposite as a person, because every defended man he owns is a turn spent before
 *  the position even moves. Armour on the pawns keeps the lesson (a wall you have to open) and
 *  drops the grind (opening it sixteen times). The King is never in scope: he bows to no
 *  enchantment. */
export type ArmorScope = 'all' | 'pawns';

export function armorArmy(state: GameState, color: Color, scope: ArmorScope = 'all'): GameState {
  const board = state.board.map((piece) =>
    piece &&
    piece.color === color &&
    piece.type !== 'k' &&
    !piece.ench &&
    (scope === 'all' || piece.type === 'p')
      ? { ...piece, ench: 'taunt' as const, shieldBroken: false }
      : piece,
  );
  return { ...state, board };
}

/** Turns a rider's knights into dragons, optionally shielded. Applied after the loadout, so
 *  whatever enchantments were chosen still land on the squares they were chosen for. */
export function raiseDragons(
  state: GameState,
  color: Color,
  options: { count?: number; taunt?: boolean } = {},
): GameState {
  const count = options.count ?? 2;
  let raised = 0;
  const board = state.board.map((piece) => {
    if (!piece || piece.color !== color || piece.type !== 'n' || raised >= count) return piece;
    raised++;
    return {
      ...piece,
      type: 'd' as const,
      ench: options.taunt ? ('taunt' as const) : piece.ench,
      shieldBroken: false,
    };
  });
  return { ...state, board };
}

/** Bishops become Archbishops. Same shape as `raiseDragons`: the piece keeps its square and
 *  its enchantment, and gains the word. */
export function raiseArchbishops(
  state: GameState,
  color: Color,
  options: { count?: number; taunt?: boolean } = {},
): GameState {
  const count = options.count ?? 2;
  let raised = 0;
  const board = state.board.map((piece) => {
    if (!piece || piece.color !== color || piece.type !== 'b' || raised >= count) return piece;
    raised++;
    return {
      ...piece,
      type: 'a' as const,
      ench: options.taunt ? ('taunt' as const) : piece.ench,
      shieldBroken: false,
    };
  });
  return { ...state, board };
}

/** Venom: named pawns of yours carry Poison.
 *
 *  Takes *files* rather than squares, and that is the whole point of the signature. The road
 *  picks which pawn is poisoned once, when the gift is taken, and it stays that pawn for the
 *  rest of the walk — a poison on b2 is a different game from one on e2, and re-rolling it
 *  every board would turn a decision you have to build around into weather. Files rather than
 *  squares because the Second Chair trial has the traveller playing Black, where the pawn rank
 *  is seven and not two.
 *
 *  Only bare pawns are taken: overwriting an enchantment the player spent mana on would be
 *  giving with one hand and taking with the other. */
export function venomPawn(state: GameState, color: Color, files: readonly string[]): GameState {
  const rank = color === 'w' ? 1 : 6;
  const board = state.board.slice() as (Piece | null)[];
  for (const file of files) {
    const index = FILES.indexOf(file);
    if (index < 0) continue;
    const square = sq(index, rank);
    const piece = board[square];
    if (piece && piece.color === color && piece.type === 'p' && !piece.ench) {
      board[square] = { ...piece, ench: 'poison' };
    }
  }
  return { ...state, board };
}

/** Fortification: a rook of yours carries Taunt.
 *
 *  A rook is the carrier Taunt is worst value on at four points of mana — three times the base
 *  cost — so as a gift it is worth exactly what a player would never buy, which is the point of
 *  a gift. It also puts a shield on the back rank, where a rook starts, which is the half of the
 *  board Taunt actually works in. */
export function fortifyRooks(
  state: GameState,
  color: Color,
  options: { count?: number } = {},
): GameState {
  let done = 0;
  const count = options.count ?? 1;
  const board = state.board.map((piece) => {
    if (!piece || piece.color !== color || piece.type !== 'r' || piece.ench || done >= count) {
      return piece;
    }
    done++;
    return { ...piece, ench: 'taunt' as const, shieldBroken: false };
  });
  return { ...state, board };
}

export interface InnkeeperOptions {
  /** Reuse a table across turns so the house keeps what it learned last move. */
  table?: TranspositionTable;
  depth?: number;
  /** How many moves to consider at each node. Defaults to `depth * 3`. */
  sample?: number;
  /** Whether this seat understands enchantments, king safety and passers, or sees only wood
   *  and squares. Defaults to whether the seat is wide, which is right for the ladder as it
   *  stands: the shallow seats at the bottom are learning the same game the player is.
   *
   *  It is separable from `sample` because *how much a seat looks at* and *what a seat
   *  understands* are different axes, and one encounter needs them apart. The Armored Knight
   *  is deliberately shallow, but his whole encounter is that every piece he owns wears
   *  Taunt — and `positional` cannot see a shield, so he had no reason to keep a piece home
   *  where the plate works or defended so that the plate exists at all. He wore it into the
   *  hero's half and traded it off, and the encounter measured 6-0-0 against him. */
  magic?: boolean;
  /** Load-independent ceiling on searched nodes. Prefer this to `budgetMs` anywhere the same
   *  move must come back every time, tests above all. */
  maxNodes?: number;
  /** Off only for A/B measurement; see scripts/ab.ts. */
  checkExtension?: boolean;
  /** A/B only: false restores the old flat passed-pawn bonus. */
  passedPawns?: boolean;
  /** A/B only: false restores quiescence without static exchange evaluation. */
  seePruning?: boolean;
  /** A/B only: how deep King powers are still generated. 0 is root-only, as shipped. */
  powerPly?: number;
  /** A/B only: order shield-breaks by the piece they expose instead of as one block. */
  gradedBreaks?: boolean;
  /** Narrow seats keep every capture in their sample and roll the dice on quiet moves only.
   *  Defaults on; false restores uniform sampling. */
  keepTactics?: boolean;
  /** How much better a King power must look than the best ordinary move before a seat spends
   *  it. Defaults to 60. A once-per-game resource is worth a real bar.
   *
   *  MEASURED, INCONCLUSIVE. 60 against 30, eight games each on the five seats that ever call
   *  one, 20k nodes, `scripts/balance.ts --power-margin 30`:
   *
   *      seat       margin 60            margin 30
   *      innkeeper  100%  3/8 @ply 41    100%  5/8 @ply 41
   *      rolain     100%  3/8 @ply 49    100%  4/8 @ply 59
   *      wit         38%  5/8 @ply 85     50%  5/8 @ply 83
   *      armored     13%  3/8 @ply 69     13%  3/8 @ply 65
   *      kyrax        0%  1/8 @ply 39      0%  1/8 @ply 27
   *
   *  Powers fire a little more often at 30, and not noticeably earlier — the ply column is the
   *  one that would show waste, and it does not move. Win rates are identical everywhere except
   *  the Wit, and that is a single game at n=8, well inside the noise. So there is no evidence
   *  for 30 over 60, and none against; 60 stays because it is what shipped, not because it won.
   *  Raising n is the only thing that would settle it, and nothing about the ladder is currently
   *  waiting on the answer.
   *
   *  Worth knowing before repeating this: an earlier n=4 run showed Rolain and Kyrax calling a
   *  power *never*, which read like the margin shutting them out entirely. At n=8 they call one
   *  3/8 and 1/8. That "never" was sample size, not behaviour. */
  powerMargin?: number;
  /** Skip the search entirely and reach for a piece at random. */
  random?: boolean;
  /** Capture-only search at the leaves. Defaults on for the wide seats. */
  quiescence?: boolean;
  /** Wall-clock budget for iterative deepening. Omit for an unbounded, deterministic search. */
  budgetMs?: number;
  now?: () => number;
  rng?: () => number;
}

/** Material balance from `color`'s point of view, in pawns. Kept for the tests and for the
 *  weaker seats, which are supposed to see nothing else. */
export function material(state: GameState, color: Color): number {
  let score = 0;
  for (const piece of state.board) {
    if (!piece || piece.type === 'k') continue;
    score += piece.color === color ? PIECE_VALUE[piece.type] : -PIECE_VALUE[piece.type];
  }
  return score;
}

/* ---------------------------------------------------------------------------
   Evaluation, in centipawns. Material, placement, and what the enchantments are
   actually worth, which is the part a stock chess engine would get wrong here.
--------------------------------------------------------------------------- */

const SCORE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, d: 720, a: 430, k: 0 };

/** Piece-square tables, written from White's side and mirrored for Black. */
const PST: Record<PieceType, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10,-20,-20, 10, 10,  5,
     5, -5,-10,  0,  0,-10, -5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5,  5, 10, 25, 25, 10,  5,  5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  5, 10, 10,  5,  0,  0,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     5, 10, 10, 10, 10, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -10,  5,  5,  5,  5,  5,  0,-10,
     0,  0,  5,  5,  5,  5,  0, -5,
    -5,  0,  5,  5,  5,  5,  0, -5,
   -10,  0,  5,  5,  5,  5,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  d: [
   -30,-20,-10,-10,-10,-10,-20,-30,
   -20,  0, 10, 10, 10, 10,  0,-20,
   -10, 10, 20, 20, 20, 20, 10,-10,
   -10, 10, 20, 25, 25, 20, 10,-10,
   -10, 10, 20, 25, 25, 20, 10,-10,
   -10, 10, 20, 20, 20, 20, 10,-10,
   -20,  0, 10, 10, 10, 10,  0,-20,
   -30,-20,-10,-10,-10,-10,-20,-30,
  ],
  a: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  k: [
    20, 30, 10,  0,  0, 10, 30, 20,
    20, 20,  0,  0,  0,  0, 20, 20,
   -10,-20,-20,-20,-20,-20,-20,-10,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
  ],
};

/** What a passed pawn is worth, by how many ranks it has crossed (index = rank from its own
 *  side, 1-8). Nothing on the home ranks, then a curve that gets steep near the end, because
 *  the last two squares are the ones the defender has to give up material to stop. */
const PASSED_PAWN = [0, 0, 8, 18, 34, 62, 108, 170, 170];

/** What an enchantment is worth on this piece, in centipawns. The costs come straight from
 *  what each one actually does on the board rather than from its budget price. */
function enchantmentValue(state: GameState, square: number, piece: Piece): number {
  switch (piece.ench) {
    case 'taunt':
      // Only worth something while it is actually shielded, and only until it is spent.
      // In the enemy half it cannot shield at all, so it is worth little more than the
      // promise of coming home.
      if (piece.shieldBroken) return 0;
      if (isShielded(state.board, square)) return 90;
      return inOwnHalf(piece.color, square) ? 25 : 8;
    case 'poison':
      // Anything that takes it dies, so the enemy must spend a pawn or leave it alone.
      return 140;
    case 'immolation': {
      // Worth what is standing in front of it, and nothing at all when that is empty air. A
      // flat bonus would have the search hoard an unarmed bomb; counting the ground makes it
      // push the thing to where the fire would land on something, which is how it is meant to
      // be played. Own men in the blast count against it, because they burn too.
      let worth = 30;
      for (const burning of blastZone(piece.color, square)) {
        const victim = state.board[burning];
        if (!victim || victim.type === 'k') continue;
        worth += victim.color === piece.color ? -SCORE[victim.type] / 4 : SCORE[victim.type] / 3;
      }
      return Math.round(worth);
    }
    case 'martyr':
      return 45;
    case 'outpost':
      return 40;
    case 'swift':
      return 35;
    case 'herald': {
      // A herald pawn is a queen two ranks early; the closer it gets the more it is worth.
      const rank = relativeRank(piece.color, square);
      return 60 + Math.max(0, rank - 2) * 55;
    }
    default:
      return 0;
  }
}

/** What a piece under Destined Death has already lost.
 *
 *  Without this the search cannot see the power at all. The mark pays off six plies out, which
 *  in a real middlegame is past the horizon, so Wittex was spending whole turns on a sentence
 *  he could not price and the reference hero was defending men who were already dead. Measured:
 *  at equal node caps he came out *easier* than the Dragonlord, whose threat is plain material.
 *
 *  A marked piece is not worthless — it moves and takes for the turns it has left — so the
 *  discount scales with how near the hour is. Three turns out it keeps about half its worth;
 *  one turn out, almost none. */
function doomDiscount(state: GameState, piece: Piece): number {
  const mark = state.doomed.find((d) => d.pieceId === piece.id);
  if (!mark) return 0;
  const remaining = Math.max(0, mark.diesAtPly - state.ply);
  const keeps = Math.min(1, remaining / 12);
  return Math.round(SCORE[piece.type] * (1 - keeps));
}

/** Static evaluation from `color`'s point of view, in centipawns. */
export function evaluate(state: GameState, color: Color, rankedPassers = true): number {
  let score = 0;
  const bishops = { w: 0, b: 0 };
  const pawnFiles: Record<Color, number[]> = { w: new Array(8).fill(0), b: new Array(8).fill(0) };
  const kings: Record<Color, number> = { w: -1, b: -1 };
  // Every pawn square, plus the frontier of each side's pawns per file. `blackFurthest` is the
  // highest rank a black pawn stands on in that file and `whiteFurthest` the lowest a white one
  // does, which is exactly what "is anything ahead of this pawn" needs.
  const pawns: number[] = [];
  const blackFurthest = new Int8Array(8).fill(-1);
  const whiteFurthest = new Int8Array(8).fill(8);

  for (let square = 0; square < 64; square++) {
    const piece = state.board[square];
    if (!piece) continue;
    const mirrored = piece.color === 'w' ? square : 63 - square;
    let value = SCORE[piece.type] + PST[piece.type][mirrored];
    value += enchantmentValue(state, square, piece);
    value -= doomDiscount(state, piece);
    // A chained piece does nothing this turn, so discount it slightly.
    if (state.frozen.some((f) => f.pieceId === piece.id)) value -= 35;

    if (piece.type === 'b') bishops[piece.color]++;
    if (piece.type === 'p') {
      const file = square & 7;
      const rank = square >> 3;
      pawnFiles[piece.color][file]++;
      pawns.push(square);
      if (piece.color === 'b') {
        if (rank > blackFurthest[file]) blackFurthest[file] = rank;
      } else if (rank < whiteFurthest[file]) {
        whiteFurthest[file] = rank;
      }
    }
    if (piece.type === 'k') kings[piece.color] = square;

    score += piece.color === color ? value : -value;
  }

  // The bishop pair is worth keeping together.
  if (bishops.w >= 2) score += color === 'w' ? 35 : -35;
  if (bishops.b >= 2) score += color === 'b' ? 35 : -35;

  // Doubled pawns.
  for (const side of ['w', 'b'] as Color[]) {
    const sign = side === color ? 1 : -1;
    for (let file = 0; file < 8; file++) {
      const own = pawnFiles[side][file];
      if (own > 1) score -= sign * 18 * (own - 1);
    }
  }

  // Passed pawns, scored by how far they have come.
  //
  // The point of the rank scaling: a passer is not a flat bonus, it is a promise that gets
  // more expensive to break the closer it gets. A flat term tells the engine a passed pawn is
  // nice to own and gives it no reason whatever to *push* one, which is how a winning endgame
  // becomes a shuffle and then a draw.
  for (const square of pawns) {
    const piece = state.board[square]!;
    const file = square & 7;
    const rank = square >> 3;
    let clear = true;
    for (let df = -1; df <= 1 && clear; df++) {
      const f = file + df;
      if (f < 0 || f > 7) continue;
      // Anything of theirs still standing in front of it, on this file or a neighbour, means
      // it can be blocked or captured on the way.
      clear = piece.color === 'w' ? blackFurthest[f] <= rank : whiteFurthest[f] >= rank;
    }
    if (!clear) continue;
    const advanced = relativeRank(piece.color, square);
    const worth = rankedPassers ? PASSED_PAWN[advanced] : 22;
    score += (piece.color === color ? 1 : -1) * worth;
  }

  // Shelter for the king. Mobility is deliberately left out: measuring it means generating
  // every legal move twice at every leaf, which costs more depth than the term is worth.
  score += kingSafety(state, color) - kingSafety(state, opposite(color));

  // An unspent King power is a card still in hand.
  if (!state.powers[color].used) score += 30;
  if (!state.powers[opposite(color)].used) score -= 30;
  return score;
}

/** What the teaching seats see: wood plus where it stands, and nothing else.
 *
 *  Pure material is a bad way to be weak. A material-only search has no reason to keep a king
 *  at home, develop a piece, or stop shuffling a knight between two squares, so it does not
 *  look like a modest player — it looks like a broken one, and a player reads that as a bug
 *  rather than as an easy opponent. Adding the piece-square tables costs one table lookup per
 *  piece and buys ordinary-looking chess.
 *
 *  Deliberately excluded: enchantment values, king safety, passed pawns. The seats at the
 *  bottom of the road are learning the same game the player is, and it suits them not to
 *  understand the magic yet. */
function positional(state: GameState, color: Color): number {
  let score = 0;
  const kingSquares: Record<Color, number> = { w: -1, b: -1 };
  const heavies: Record<Color, number> = { w: 0, b: 0 };
  for (let square = 0; square < 64; square++) {
    const piece = state.board[square];
    if (!piece) continue;
    const mirrored = piece.color === 'w' ? square : 63 - square;
    // The king gets its own treatment, below. The stock table is a *castled* king's table —
    // b1 and g1 score 30, e1 scores 0 — and a depth-three search happily walks the king there
    // by hand one square at a time, which is not what that table means.
    const table = piece.type === 'k' ? 0 : PST[piece.type][mirrored];
    const value = SCORE[piece.type] + table;
    score += piece.color === color ? value : -value;
    if (piece.type === 'k') kingSquares[piece.color] = square;
    if (piece.type !== 'p' && piece.type !== 'k') heavies[piece.color]++;
  }

  // Keep the king home while there is still an army on the board.
  //
  // Without this the seat does not walk its king anywhere in particular — it wanders, because
  // at depth three with a material-and-squares evaluation almost every quiet move ties, and a
  // tie is broken by whatever the sample happened to look at. Kd1, Ke1, Kd2, Kd3 is not a plan,
  // it is a coin landing four times. One real preference is enough to stop it, and "the king
  // stays on the back rank until the pieces come off" is the correct one to give a beginner.
  for (const side of ['w', 'b'] as Color[]) {
    const square = kingSquares[side];
    if (square < 0 || heavies[side] < 3) continue;
    const advanced = relativeRank(side, square) - 1;
    if (advanced > 0) score += (side === color ? -1 : 1) * advanced * 30;
  }
  return score;
}

/** How exposed a king is: enemy pieces bearing on the squares around it cost real points. */
function kingSafety(state: GameState, color: Color): number {
  const king = findKing(state, color);
  if (king < 0) return 0;
  const enemy = opposite(color);
  const file = king & 7;
  const rank = king >> 3;
  let exposure = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const f = file + df;
      const r = rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      if (isAttacked(state.board, r * 8 + f, enemy)) exposure += 12;
    }
  }
  return -exposure;
}

/** How wide a seat looks and what it understands, with every default already applied.
 *
 *  One source of truth on purpose. Two things need this answer — the search, and the shared
 *  transposition table, which must not let a seat read back a score some *other* evaluation
 *  wrote — and a copy of the defaults in the second place is a bug waiting for someone to
 *  change `sample`'s fallback and not know the table cared. */
export function seatRegime(options: InnkeeperOptions): {
  depth: number;
  sample: number;
  wide: boolean;
  magic: boolean;
} {
  const depth = options.depth ?? 3;
  const sample = options.sample ?? depth * 3;
  const wide = sample >= 12;
  return { depth, sample, wide, magic: options.magic ?? wide };
}

/** Picks the house's action, or null when the game is already over.
 *
 *  Everything about *how* it looks lives in `search.ts`. This function decides what a position
 *  is worth and how wide a seat is allowed to look, which is the only difference between the
 *  teaching seats and the ones meant to beat you. */
export function chooseAction(
  state: GameState,
  options: InnkeeperOptions = {},
): InnkeeperChoice | null {
  if (state.status.kind !== 'ongoing') return null;
  const rng = options.rng ?? Math.random;

  if (options.random) {
    const available: Action[] = [
      ...legalMoves(state, state.turn),
      ...shieldBreakActions(state, state.turn),
    ];
    // He has a King power too, and no idea when to use it. A couple of activations go into
    // the hat with everything else, so now and then he spends it on nothing at all.
    const powers = powerActions(state, state.turn);
    for (let i = 0; i < 2 && powers.length; i++) {
      available.push(powers[Math.floor(rng() * powers.length)]);
    }
    if (!available.length) return null;
    return { action: available[Math.floor(rng() * available.length)], score: 0, depth: 0 };
  }

  const { depth, sample, wide, magic } = seatRegime(options);

  const searcher = new Searcher({
    depth,
    // A wide seat looks at everything; a narrow one keeps its random blind spots.
    sample: wide ? undefined : sample,
    budgetMs: options.budgetMs,
    maxNodes: options.maxNodes,
    checkExtension: options.checkExtension,
    seePruning: options.seePruning,
    powerPly: options.powerPly,
    gradedBreaks: options.gradedBreaks,
    keepTactics: options.keepTactics ?? true,
    now: options.now,
    rng,
    // Weak seats see wood and squares, and nothing else: no enchantments, no king safety.
    // That is what keeps them careless without making them look broken. A seat can opt back
    // in without getting any deeper — see `magic`.
    evaluate: (position) =>
      magic
        ? evaluate(position, position.turn, options.passedPawns ?? true)
        : positional(position, position.turn),
    table: options.table,
    powerMargin: options.powerMargin ?? 60,
  });

  const found = searcher.run(state);
  return found ? { action: found.action, score: found.score, depth: found.depth } : null;
}

export interface InnkeeperChoice {
  action: Action;
  score: number;
  depth: number;
}

/** What a seat may roll for itself. Deliberately *not* every enchantment: Immolation is a
 *  relic the player takes off the Wit or off Ardax, and a thing you earned should not turn up
 *  on a drunk in the first chair. */
const HOUSE_SPELLBOOK: Enchantment[] = ['taunt', 'martyr', 'outpost', 'swift', 'herald', 'poison'];

/** A loadout for the house. Built procedurally rather than from fixed squares, so it works on
 *  a Chess960 back rank too. It spends what it can and keeps whatever is left as reserve. */
export function innkeeperLoadout(
  state: GameState,
  color: Color,
  options: { rng?: () => number; timed?: boolean; power?: PowerName } = {},
): Loadout {
  // Revive is paid for out of what you did **not** spend, so a seat that is supposed to raise
  // the dead has to hold points back before it starts shopping — not discover afterwards that
  // it cannot afford its own power. Three points buys a knight or a bishop back; a pawn for one
  // is not worth a whole turn and not worth a boss's reputation.
  const holdBack = options.power === 'revive' ? REVIVE_RESERVE : 0;
  const purse = BUDGET - holdBack;
  const rng = options.rng ?? Math.random;
  const pick = <T,>(items: T[]): T => items[Math.floor(rng() * items.length)];

  const powers: PowerName[] = options.timed
    ? ['teleport', 'relocate', 'decree', 'revive', 'chrono']
    : ['teleport', 'relocate', 'decree', 'revive'];

  const mine = state.board
    .map((piece, square) => ({ piece, square }))
    .filter((s) => s.piece && s.piece.color === color && s.piece.type !== 'k');

  const enchantments: Record<string, Enchantment> = {};
  let spent = 0;

  // Eight attempts is plenty to fill the purse without ever overspending.
  for (let attempt = 0; attempt < 8 && spent < purse; attempt++) {
    const spot = pick(mine);
    const name = squareName(spot.square);
    if (enchantments[name]) continue;
    const ench = pick(HOUSE_SPELLBOOK);
    if (carrierError(ench, spot.piece!.type)) continue;
    const cost = costOf(ench, spot.piece!.type);
    if (spent + cost > purse) continue;
    enchantments[name] = ench;
    spent += cost;
  }

  const power = options.power ?? pick(powers);
  // A randomly drawn Revive still has to be affordable; only a *forced* one gets points held
  // back for it. Falling back keeps a random seat from carrying a power it can never call.
  const usable = power === 'revive' && BUDGET - spent < 1 ? 'teleport' : power;
  return { ...emptyLoadout(usable), enchantments };
}
