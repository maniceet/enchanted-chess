import { applyAction, makeMove } from './apply';
import { opposite } from './board';
import { attackersOf, inCheck, legalMoves, shieldBreakActions, type Board } from './movegen';
import { powerActions } from './powers';
import {
  isError,
  type Action,
  type Color,
  type GameState,
  type MoveAction,
  type Piece,
  type PieceType,
} from './types';

/** The search. The machinery here is the standard set every strong engine is built from,
 *  fitted to this game's rules rather than to plain chess: a transposition table keyed on a
 *  position hash that includes enchantments, killer and history move ordering, null-move
 *  pruning, aspiration windows, and a capture-only search at the leaves.
 *
 *  It is deliberately separate from `evaluate`, which lives in `ai.ts`: this file decides what
 *  to look at, that one decides what a position is worth. */

export const MATE_SCORE = 1_000_000;
const INFINITY = 9_999_999;

/* ---------------------------------------------------------------------------
   Zobrist hashing. The key covers everything that changes what is legal or what
   a position is worth: placement, enchantment, whether a shield is spent, who
   is frozen, castling, en passant, and each side's unused power.
--------------------------------------------------------------------------- */

function makeRandoms(count: number, seed = 0x9e3779b9): number[] {
  const out = new Array<number>(count);
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    out[i] = s;
  }
  return out;
}

const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'd', 'k'];
const ENCH_INDEX: Record<string, number> = {
  none: 0,
  taunt: 1,
  martyr: 2,
  outpost: 3,
  swift: 4,
  herald: 5,
  poison: 6,
};

const PIECE_KEYS = makeRandoms(2 * TYPES.length * 64 * 7 * 2);
const TURN_KEY = makeRandoms(1, 0x1234567)[0];
const CASTLE_KEYS = makeRandoms(2 * 2 * 9, 0xabcdef);
const EP_KEYS = makeRandoms(9, 0x55aa55);
const FROZEN_KEYS = makeRandoms(128, 0x0f0f0f);
const POWER_KEYS = makeRandoms(2 * 2, 0x777);

function pieceSlot(
  colorIndex: number,
  typeIndex: number,
  square: number,
  enchIndex: number,
  broken: number,
): number {
  return ((((colorIndex * TYPES.length + typeIndex) * 64 + square) * 7 + enchIndex) * 2) + broken;
}

/** A 32-bit key for the position. Collisions are possible and harmless: every table hit is
 *  re-validated by playing the stored move through the real rules. */
export function positionHash(state: GameState): number {
  let hash = state.turn === 'w' ? 0 : TURN_KEY;

  for (let square = 0; square < 64; square++) {
    const piece = state.board[square];
    if (!piece) continue;
    const slot = pieceSlot(
      piece.color === 'w' ? 0 : 1,
      TYPES.indexOf(piece.type),
      square,
      ENCH_INDEX[piece.ench ?? 'none'],
      piece.shieldBroken ? 1 : 0,
    );
    hash = (hash ^ PIECE_KEYS[slot]) >>> 0;
  }

  for (let i = 0; i < 2; i++) {
    const rights = i === 0 ? state.castling.w : state.castling.b;
    hash = (hash ^ CASTLE_KEYS[i * 18 + (rights.kingRookFile ?? 8)]) >>> 0;
    hash = (hash ^ CASTLE_KEYS[i * 18 + 9 + (rights.queenRookFile ?? 8)]) >>> 0;
  }

  hash = (hash ^ EP_KEYS[state.ep === null ? 8 : state.ep & 7]) >>> 0;
  for (const marker of state.frozen) {
    if (marker.untilPly > state.ply) hash = (hash ^ FROZEN_KEYS[marker.pieceId & 127]) >>> 0;
  }
  if (!state.powers.w.used) hash = (hash ^ POWER_KEYS[0]) >>> 0;
  if (!state.powers.b.used) hash = (hash ^ POWER_KEYS[1]) >>> 0;
  return hash >>> 0;
}

/* ---------------------------------------------------------------------------
   Transposition table
--------------------------------------------------------------------------- */

type Bound = 'exact' | 'lower' | 'upper';

interface Entry {
  hash: number;
  depth: number;
  score: number;
  bound: Bound;
  best: Action | null;
}

export class TranspositionTable {
  private slots: (Entry | undefined)[];
  private mask: number;

  constructor(sizePow2 = 16) {
    const size = 1 << sizePow2;
    this.slots = new Array(size);
    this.mask = size - 1;
  }

  get(hash: number): Entry | undefined {
    const entry = this.slots[hash & this.mask];
    return entry && entry.hash === hash ? entry : undefined;
  }

  put(entry: Entry): void {
    const index = entry.hash & this.mask;
    const existing = this.slots[index];
    // Prefer the deeper search; a shallow probe should not evict real work.
    if (!existing || existing.hash !== entry.hash || entry.depth >= existing.depth) {
      this.slots[index] = entry;
    }
  }

  clear(): void {
    this.slots = new Array(this.mask + 1);
  }
}

/* ---------------------------------------------------------------------------
   Search
--------------------------------------------------------------------------- */

export interface SearchOptions {
  depth: number;
  /** Consider only this many actions per node. Large values mean full width. */
  sample?: number;
  /** When sampling, spend the randomness on quiet moves only and always keep the captures,
   *  promotions and shield-breaks. Only affects seats that sample at all. */
  keepTactics?: boolean;
  budgetMs?: number;
  /** Hard ceiling on searched nodes. Unlike `budgetMs` this is load-independent, so a search
   *  bounded by it plays exactly the same move on a busy machine as on an idle one — which is
   *  what tests need, and what makes a seat's strength a property of the seat rather than of
   *  whatever else the CPU happened to be doing. Both may be set; whichever bites first wins. */
  maxNodes?: number;
  now?: () => number;
  rng?: () => number;
  /** Static evaluation, supplied by the caller so the search stays about searching. */
  evaluate: (state: GameState) => number;
  /** Set for the seats that are meant to miss things. */
  shallowEval?: (state: GameState) => number;
  table?: TranspositionTable;
  /** How much better a King power must look before it is spent. */
  powerMargin?: number;
  /** How deep into the tree King powers are still generated. 0 — the shipped default — means
   *  the root only, so no search ever sees a power played *in reply*.
   *
   *  That is a real blind spot, and a tempting one: Ardax cannot see that he will raise what he
   *  loses, so he prices trades as though his necromancy did not exist, and Wittex cannot see
   *  an answer to a mark. Fixing it looks obviously correct.
   *
   *  MEASURED AND REJECTED. `powerPly: 1` against the shipped `0`, 60 games, both sides holding
   *  Revive with points spare to pay for it, 20k nodes each, colours alternated:
   *
   *      powers one ply deep    20 / 60    33.3% ± 12.9    — measurably worse
   *
   *  Well outside the noise. The reason is the trade every search change is really making: six
   *  sampled power actions at every ply-1 node widen the tree, and at a fixed node budget width
   *  is paid for in depth. Seeing one power reply is worth less than the ply of reading it
   *  costs. Kept as an option so the experiment is reproducible and nobody has to rediscover
   *  this; left at 0 because 0 is better. */
  powerPly?: number;
  /** Order shield-breaks by what they expose rather than as one undifferentiated block.
   *
   *  The argument for it: shipped ordering gives every shield-break a flat 40,000, so breaking
   *  a pawn's shield ranks level with breaking a queen's and both rank above every killer and
   *  quiet move. Opposite the Armored Knight and his eight shielded pawns that looked like
   *  eight moves tried first at every node and almost never wanted.
   *
   *  MEASURED AND REJECTED. 60 games, taunt-heavy loadouts both sides, 20k nodes, colours
   *  alternated:
   *
   *      graded shield-breaks    22.5 / 60    37.5% ± 12.9
   *
   *  The interval clips 50%, so this is not *proven* worse — but there is no evidence of
   *  benefit and a good deal of hint of harm, which is enough to leave the shipped ordering
   *  alone.
   *
   *  A second 40-game run agreed (14.5 / 40, 36.3%), but the two are *not* independent — the
   *  harness derived every game from its index, so the shorter run was the first 40 games of
   *  the longer one. Pooling them would have manufactured significance out of one sample
   *  counted twice. `--seed` exists now so that mistake is not available.
   *
   *  The reasoning behind the change was simply wrong, and that is the part worth keeping. A
   *  shield-break is not a wasted turn: against a shielded piece it is the *prerequisite* to
   *  the capture, a capture in two parts. Its slot just below real captures is therefore right,
   *  and demoting a pawn's break to killer level made the search find the wall-breaking plan
   *  later rather than sooner. Kept as an option so the experiment is reproducible; left off
   *  because off is better. */
  gradedBreaks?: boolean;
  /** Skip captures that a swap-off says lose material.
   *
   *  **Off by default, on measurement.** It never scored above even: 48.5% ± 10.0 over 100
   *  node-budgeted games (`ab.ts -n 100 -k 20000`) and 36.3% ± 15.8 over 40 time-budgeted ones
   *  (`-n 40 -t 120`). Neither result proves harm on its own, but both point estimates sit
   *  below 50 and there is a mechanism that explains it: `see` treats every attacker returned
   *  by `attackersOf` as able to recapture, and two classes of them cannot. A **pinned**
   *  defender may not legally take, and a **king** may not take into a defended square. Both
   *  make the defence look stronger than it is, so the swap-off reads winning captures as
   *  losing and prunes them.
   *
   *  Fixing that means pin detection inside the exchange loop, which costs more than the
   *  pruning saves at these depths. Kept behind the flag with the numbers, so the next attempt
   *  starts from what is already known rather than from scratch. */
  seePruning?: boolean;
  /** Spend an extra ply whenever the side to move is in check.
   *
   *  **Off by default, on measurement.** Check extensions are textbook, and this one is
   *  correctly implemented and bounded — but under a fixed node budget an extension buys depth
   *  on forced lines by spending it everywhere else, and head-to-head it did not pay:
   *  `scripts/ab.ts -n 60 -k 20000` scored it at 45.8% ± 12.9, i.e. inside the noise with the
   *  point estimate below even. A forced-mate suite showed no difference either (5/6 with it
   *  on and off, at every budget from 6k to 120k nodes).
   *
   *  Kept as a flag rather than deleted so the experiment stays one command away: if a larger
   *  sample or a deeper budget ever shows it winning, flip the default. Do not turn it on
   *  without a number. */
  checkExtension?: boolean;
}

export interface SearchResult {
  action: Action;
  score: number;
  depth: number;
  nodes: number;
}

const MOVE_KEY = (action: Action): string =>
  action.type === 'move'
    ? `m${action.from}:${action.to}:${action.promo ?? ''}`
    : action.type === 'shieldBreak'
      ? `s${action.from}:${action.target}`
      : `p${action.type}`;

const SEE_VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, d: 720, k: 0 };

export class Searcher {
  private table: TranspositionTable;
  private killers: (string | null)[][] = [];
  private history = new Map<string, number>();
  private deadline = Infinity;
  private now: () => number;
  private rng: () => number;
  private nodes = 0;
  private aborted = false;
  /** How deep a check extension is still allowed to fire, in plies from the root. Re-set for
   *  each iterative-deepening pass so the allowance grows with the search rather than being a
   *  constant that starves shallow depths and runs away at deep ones. */
  private extensionLimit = 0;
  private readonly extensions: boolean;
  private readonly pruneLosingCaptures: boolean;

  constructor(private options: SearchOptions) {
    this.table = options.table ?? new TranspositionTable();
    this.now = options.now ?? Date.now;
    this.rng = options.rng ?? Math.random;
    this.extensions = options.checkExtension ?? false;
    this.pruneLosingCaptures = options.seePruning ?? false;
  }

  /** Iterative deepening with aspiration windows. Every completed depth replaces the answer
   *  from the one before, so an exhausted budget still leaves a fully searched move. */
  run(state: GameState): SearchResult | null {
    const roots = this.actionsAt(state, true);
    if (!roots.length) return null;

    this.deadline =
      this.options.budgetMs === undefined ? Infinity : this.now() + this.options.budgetMs;
    this.nodes = 0;
    this.aborted = false;
    this.killers = [];

    let best: SearchResult | null = null;
    let bestPower: SearchResult | null = null;
    let guess = 0;

    for (let depth = 1; depth <= this.options.depth; depth++) {
      // Checks may extend the line to roughly twice the nominal depth and no further.
      this.extensionLimit = depth * 2;
      const window = depth <= 2 ? INFINITY : 60;
      let alpha = guess - window;
      let beta = guess + window;
      let attempt = this.searchRoot(state, roots, depth, alpha, beta);

      // An aspiration miss means the window was wrong, so widen and try once more.
      if (!this.aborted && attempt.move && (attempt.move.score <= alpha || attempt.move.score >= beta)) {
        attempt = this.searchRoot(state, roots, depth, -INFINITY, INFINITY);
      }
      if (this.aborted && best) break;

      if (attempt.move) {
        best = attempt.move;
        guess = attempt.move.score;
      }
      if (attempt.power) bestPower = attempt.power;
      if (best && Math.abs(best.score) > MATE_SCORE / 2) break;
      if (this.outOfTime()) break;
    }

    const margin = this.options.powerMargin ?? 60;
    if (bestPower && (!best || bestPower.score > best.score + margin)) return bestPower;
    return best ?? bestPower;
  }

  private searchRoot(
    state: GameState,
    roots: Action[],
    depth: number,
    alpha: number,
    beta: number,
  ): { move: SearchResult | null; power: SearchResult | null } {
    let move: SearchResult | null = null;
    let power: SearchResult | null = null;
    let localAlpha = alpha;

    for (const action of this.order(state, roots, 0, null)) {
      const child = this.advance(state, action);
      const score = -this.negamax(child, depth - 1, -beta, -localAlpha, 1);
      if (this.aborted) break;

      const result: SearchResult = { action, score, depth, nodes: this.nodes };
      if (action.type === 'power') {
        if (!power || score > power.score) power = result;
      } else if (!move || score > move.score) {
        move = result;
        if (score > localAlpha) localAlpha = score;
      }
    }
    return { move, power };
  }

  private negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    if (this.outOfTime()) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    const hash = positionHash(state);
    const hit = this.table.get(hash);
    if (hit && hit.depth >= depth) {
      if (hit.bound === 'exact') return hit.score;
      if (hit.bound === 'lower' && hit.score > alpha) alpha = hit.score;
      else if (hit.bound === 'upper' && hit.score < beta) beta = hit.score;
      if (alpha >= beta) return hit.score;
    }

    const available = this.actionsAt(state, ply <= (this.options.powerPly ?? 0));
    if (!available.length) {
      return inCheck(state, state.turn) ? -MATE_SCORE + ply : 0;
    }
    if (depth <= 0) return this.quiescence(state, alpha, beta, ply);

    const checked = inCheck(state, state.turn);

    // Check extension. A forced sequence is exactly the kind of line a fixed depth cuts in
    // half: the last move of a mating net looks like a quiet loss of material until you see
    // the move after it. Spending a ply on every check is the cheapest way to stop the engine
    // walking into mates and to let it find them. Bounded by `ply` against the root depth, so
    // a long series of spite checks cannot make the tree unbounded.
    if (checked && this.extensions && ply < this.extensionLimit) depth += 1;

    // Null-move pruning: if handing the opponent a free move still leaves us ahead, this line
    // is too good for them to allow. Skipped in check and in thin positions, where passing
    // would be misleading.
    if (!checked && depth >= 3 && ply > 0 && this.hasHeavyPieces(state)) {
      const passed = this.pass(state);
      const reduction = depth > 6 ? 3 : 2;
      const score = -this.negamax(passed, depth - 1 - reduction, -beta, -beta + 1, ply + 1);
      if (!this.aborted && score >= beta) return beta;
    }

    let bestScore = -INFINITY;
    let bestAction: Action | null = null;
    const original = alpha;

    const ordered = this.order(state, available, ply, hit?.best ?? null);
    let searched = 0;

    for (const action of ordered) {
      const child = this.advance(state, action);
      let score: number;

      // Late move reductions: the tail of a well ordered list rarely deserves full depth.
      const quiet =
        action.type === 'move' && state.board[action.to] == null && !('promo' in action && action.promo);
      if (searched >= 4 && depth >= 3 && quiet && !checked) {
        score = -this.negamax(child, depth - 2, -alpha - 1, -alpha, ply + 1);
        if (score > alpha) score = -this.negamax(child, depth - 1, -beta, -alpha, ply + 1);
      } else {
        score = -this.negamax(child, depth - 1, -beta, -alpha, ply + 1);
      }
      if (this.aborted) return bestScore === -INFINITY ? 0 : bestScore;
      searched++;

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (quiet) this.remember(action, depth, ply);
        break;
      }
    }

    const bound: Bound = bestScore <= original ? 'upper' : bestScore >= beta ? 'lower' : 'exact';
    this.table.put({ hash, depth, score: bestScore, bound, best: bestAction });
    return bestScore;
  }

  /** Captures only, so the search never stops in the middle of a trade. */
  private quiescence(state: GameState, alpha: number, beta: number, ply: number): number {
    if (this.outOfTime()) {
      this.aborted = true;
      return 0;
    }
    this.nodes++;

    const stand = this.options.evaluate(state);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 24) return stand;

    const captures = legalMoves(state, state.turn).filter((m) => state.board[m.to] != null);
    for (const move of this.order(state, captures, ply, null) as MoveAction[]) {
      // Delta pruning: a capture that cannot possibly reach alpha is not worth the recursion.
      const victim = state.board[move.to];
      if (victim && stand + SEE_VALUE[victim.type] + 200 < alpha) continue;

      // And a capture that loses the exchange outright is not worth it either. QxP defended by
      // a pawn wins a pawn on the first ply and gives back a queen on the second; searching it
      // costs a subtree to learn what one swap-off already says.
      if (this.pruneLosingCaptures) {
        const swap = this.see(state.board, move.from, move.to);
        if (swap !== null && swap < 0) continue;
      }

      const score = -this.quiescence(this.advance(state, move), -beta, -alpha, ply + 1);
      if (this.aborted) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /** Static exchange evaluation: play out the whole swap on `to`, each side always recapturing
   *  with its least valuable attacker, and return the net material for the side that started
   *  it. Negative means the capture loses material even though it wins a piece — QxP defended
   *  by a pawn is the classic — and those are exactly the branches quiescence should not open.
   *
   *  Two known approximations, and the reason this is not on by default: every attacker
   *  `attackersOf` reports is assumed able to recapture, but a **pinned** piece may not legally
   *  take, and a **king** may not take into a defended square. Both inflate the defence, so a
   *  winning capture can read as losing.
   *
   *  Returns `null` when the enchanted layer makes the swap unanalysable, and callers must then
   *  prune nothing. A Poison victim kills its taker, a Martyr victim freezes it, a shield turns
   *  a capture into something that is not a capture at all, and Outpost decides whether a pawn
   *  may take: none of that is material arithmetic, and guessing at it would prune real moves.
   *  Enchanted pieces are rare (four points buys few), so bailing out is nearly free. */
  private see(board: Board, from: number, to: number): number | null {
    const victim = board[to];
    const attacker = board[from];
    if (!victim || !attacker) return null;
    if (victim.ench || attacker.ench) return null;

    const occupancy: (Piece | null)[] = board.slice();
    let gain = SEE_VALUE[victim.type];
    let onSquare = attacker.type;
    let side: Color = opposite(attacker.color);
    occupancy[from] = null;
    occupancy[to] = attacker;

    // Each entry is the material standing on the square after that many recaptures.
    const swaps: number[] = [gain];
    for (let depth = 1; depth < 32; depth++) {
      const attackers = attackersOf(occupancy, to, side);
      let bestSquare = -1;
      let bestValue = Infinity;
      for (const square of attackers) {
        const piece = occupancy[square];
        // Any magic in the exchange and the arithmetic stops being arithmetic.
        if (!piece || piece.ench) return null;
        if (SEE_VALUE[piece.type] < bestValue) {
          bestValue = SEE_VALUE[piece.type];
          bestSquare = square;
        }
      }
      if (bestSquare < 0) break;
      const taker = occupancy[bestSquare]!;
      gain = SEE_VALUE[onSquare] - gain;
      swaps.push(gain);
      occupancy[bestSquare] = null;
      occupancy[to] = taker;
      onSquare = taker.type;
      side = opposite(side);
    }

    // Walk back: at every point the side to move could have declined the recapture.
    for (let i = swaps.length - 1; i > 0; i--) {
      swaps[i - 1] = -Math.max(-swaps[i - 1], swaps[i]);
    }
    return swaps[0];
  }

  /* -- helpers ------------------------------------------------------------ */

  private outOfTime(): boolean {
    const cap = this.options.maxNodes;
    // The node cap is exact and costs a comparison, so it is checked every node.
    if (cap !== undefined && this.nodes >= cap) return true;
    if (this.deadline === Infinity) return false;
    // Checking the clock on every node costs more than it saves.
    if ((this.nodes & 1023) !== 0) return this.aborted;
    return this.now() > this.deadline;
  }

  private hasHeavyPieces(state: GameState): boolean {
    let count = 0;
    for (const piece of state.board) {
      if (piece && piece.color === state.turn && piece.type !== 'p' && piece.type !== 'k') count++;
    }
    return count > 1;
  }

  /** A null move: hand the turn over without touching the board. */
  private pass(state: GameState): GameState {
    return { ...state, turn: opposite(state.turn), ep: null, ply: state.ply + 1 };
  }

  private actionsAt(state: GameState, withPowers: boolean): Action[] {
    const base: Action[] = [
      ...legalMoves(state, state.turn),
      ...shieldBreakActions(state, state.turn),
    ];
    if (!withPowers) return base;
    const powers = powerActions(state, state.turn);
    if (!powers.length) return base;
    // Teleport alone offers hundreds of placements, so powers are always sampled.
    const shuffled = [...powers].sort(() => this.rng() - 0.5).slice(0, 6);
    return [...base, ...shuffled];
  }

  private advance(state: GameState, action: Action): GameState {
    if (action.type === 'move') return makeMove(state, action as MoveAction);
    const next = applyAction(state, action);
    return isError(next) ? state : next;
  }

  private remember(action: Action, depth: number, ply: number): void {
    const key = MOVE_KEY(action);
    const row = this.killers[ply] ?? (this.killers[ply] = [null, null]);
    if (row[0] !== key) {
      row[1] = row[0];
      row[0] = key;
    }
    this.history.set(key, (this.history.get(key) ?? 0) + depth * depth);
  }

  /** Best guess first: the table's move, then captures by value, then killers and history. */
  private order(state: GameState, actions: Action[], ply: number, tableBest: Action | null): Action[] {
    const bestKey = tableBest ? MOVE_KEY(tableBest) : null;
    const killers = this.killers[ply] ?? [];
    const sample = this.options.sample ?? Infinity;

    const scored = actions.map((action) => {
      const key = MOVE_KEY(action);
      let score = 0;
      if (bestKey && key === bestKey) score += 1_000_000;
      if (action.type === 'move') {
        const victim = state.board[action.to];
        const mover = state.board[action.from];
        // Ordering stays on plain most-valuable-victim / least-valuable-attacker. Running a
        // full swap-off here was measurably slower: `order` is called at every node, and each
        // call copied the board and walked the attackers of every capture. Quiescence, which
        // runs far less often and is where a losing capture actually costs a subtree, is the
        // only place the swap-off earns its keep.
        if (victim) score += 100_000 + SEE_VALUE[victim.type] * 8 - (mover ? SEE_VALUE[mover.type] : 0);
        if (action.promo) score += 90_000;
      } else if (action.type === 'shieldBreak') {
        // Graded: a queen's shield still ranks near the old flat figure, a pawn's drops to
        // roughly killer level, which is about what spending a whole turn on it is worth.
        const behind = state.board[action.target];
        score += this.options.gradedBreaks
          ? 6_000 + (behind ? SEE_VALUE[behind.type] : 0) * 30
          : 40_000;
      } else {
        score += 20_000;
      }
      if (key === killers[0]) score += 9_000;
      else if (key === killers[1]) score += 8_000;
      score += this.history.get(key) ?? 0;
      return { action, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored.map((entry) => entry.action);
    return Number.isFinite(sample) && chosen.length > sample
      ? this.narrow(state, chosen, sample as number)
      : chosen;
  }

  /** Weak seats look at only part of the list, and which part is luck. That is the whole
   *  difference between the teaching seats and the real ones.
   *
   *  With `keepTactics`, the luck is confined to the quiet moves: anything that takes a piece,
   *  crowns a pawn or breaks a shield stays in the list. This came out of a played game — the
   *  Innkeeper left a bishop en prise on g6 and never recaptured, because uniform sampling had
   *  simply not dealt him the capture. A careless player misses plans; they do not decline free
   *  material, and a seat that does reads as broken software rather than as a weak opponent.
   *  Sample size is unchanged, so the seat still costs the same to run. */
  private narrow(state: GameState, actions: Action[], sample: number): Action[] {
    if (!this.options.keepTactics) {
      const pool = [...actions];
      const picked: Action[] = [];
      while (picked.length < sample && pool.length) {
        picked.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
      }
      return picked;
    }

    const forced: Action[] = [];
    const quiet: Action[] = [];
    for (const action of actions) {
      const tactical =
        action.type === 'shieldBreak' ||
        (action.type === 'move' && (Boolean(state.board[action.to]) || Boolean(action.promo)));
      (tactical ? forced : quiet).push(action);
    }

    // `actions` arrives ordered, so slicing the forced list keeps the best captures rather
    // than an arbitrary handful of them.
    const picked = forced.slice(0, sample);
    while (picked.length < sample && quiet.length) {
      picked.push(quiet.splice(Math.floor(this.rng() * quiet.length), 1)[0]);
    }
    return picked;
  }
}
