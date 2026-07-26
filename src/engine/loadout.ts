import { parseSquare, squareName } from './board';
import type { Color, Enchantment, GameState, PieceType, PowerName } from './types';

/** The points a captain spends before the first move, off the road.
 *
 *  Four was the original spec's duelling budget and it outlived its reasoning. It was chosen
 *  when four points was the whole game; the campaign now runs to ten, seven enchantments are
 *  and a duel at four can afford one Poison pawn or one Taunt queen and nothing else — so two
 *  strangers meet on a board that cannot show most of what the game does. A duel should be the
 *  fullest version of it, not the thinnest.
 *
 *  Ten, matching the road's ceiling, so "Duel another captain — every enchantment" is true
 *  rather than nearly true. This is provisional: what a *ranked* match should cost is a
 *  matchmaking question and gets decided when there is matchmaking to decide it with. Every
 *  function here takes the budget as an argument rather than reading this constant, so that
 *  decision changes one line. See `campaignBudget` in `ui/run.ts`. */
export const BUDGET = 10;

export const ENCH_COST: Record<Enchantment, number> = {
  squire: 2,
  taunt: 1,
  martyr: 1,
  outpost: 2,
  swift: 2,
  herald: 3,
  poison: 4,
  immolation: 4,
};

/** Every enchantment that exists, in the order a builder should list them: cheap and legible
 *  first, the expensive and strange at the bottom.
 *
 *  One list, owned here beside the costs, because there were two hand-typed copies of it —
 *  one in the UI builder and one in the house's loadout generator — and adding Immolation
 *  updated neither. A relic the player had earned could not be laid out on a single piece. */
export const ENCHANTMENTS: Enchantment[] = [
  'taunt',
  'martyr',
  'outpost',
  'swift',
  // The Squire sits next to the Herald because it is meaningless without one, and a list is
  // the cheapest place to say so.
  'herald',
  'squire',
  'poison',
  'immolation',
];

/** Every King power, in the order a rulebook should teach them.
 *
 *  Canonical, and exported so nothing has to keep its own copy. Destined Death is last because
 *  a traveller only holds it by finding the Dark Word — but it is in the list, because from the
 *  eighth seat it is used *against* them and a rule you can meet is a rule you can look up. */
export const POWER_NAMES: PowerName[] = [
  'teleport',
  'relocate',
  'decree',
  'revive',
  'chrono',
  'doom',
];

export const CARRIER_MULTIPLIER: Record<PieceType, number> = {
  p: 1,
  n: 2,
  b: 2,
  r: 3,
  d: 4, // a Dragon carries magic as poorly as a queen
  a: 3, // an Archbishop is already half a spell
  q: 4,
  k: 0, // the King can never be enchanted (§2.4a)
};

export const LEGAL_CARRIERS: Record<Enchantment, PieceType[]> = {
  squire: ['p'],
  // No 'd', and no exception anywhere else either: a Dragon is never shielded. The seats'
  // raises shed Taunt (see `raiseDragons`), so a purchasable shield here would be four mana
  // for an enchantment the first move deletes. Rolain's lent dragon gets its shield from the
  // raise itself, not from any loadout.
  taunt: ['p', 'n', 'b', 'r', 'q'],
  martyr: ['p', 'n', 'b', 'r', 'q', 'd'],
  outpost: ['p', 'n', 'b'],
  swift: ['p'],
  herald: ['p'],
  poison: ['p'],
  immolation: ['p'],
};

export const ENCH_TEXT: Record<Enchantment, string> = {
  squire:
    'Instead of moving, this pawn changes places with a friendly Herald pawn anywhere on the board. If the Herald arrives on its crowning rank it crowns at once. Requires a Herald in the same army — a squire with nobody to carry the arms for is only a pawn.',
  taunt:
    'While defended and standing in your own half, this piece has a shield. An enemy capture attempt breaks the shield instead: the attacker does not move, and its turn is spent. Cross into the enemy half and the shield sleeps until the piece comes home. Taunt grants no exception to an attacker, since striking a shield always means reaching into enemy ground. Once broken, it is gone for good.',
  martyr: 'When captured, the capturing piece may not move on its owner’s next turn. A capturing King is immune.',
  outpost: 'This piece cannot be captured by enemy pawns.',
  swift: 'May move two squares forward on any move, not just its first. Every double-step is capturable en passant.',
  herald: 'Promotes on reaching the seventh rank instead of the eighth. Normal promotion choice.',
  poison: 'When captured, the capturing piece is also removed from the board. A capturing King is immune.',
  immolation:
    'When captured, it burns the three squares in front of it — straight ahead and both diagonals, exactly where it could have moved. Every piece standing there is destroyed, yours as well as theirs. Kings do not burn, and the piece that took it survives, standing where it stood.',
};

export const POWER_TEXT: Record<PowerName, string> = {
  teleport:
    'Instead of moving: send one of your pieces to any empty square that is not under enemy attack. It may not arrive giving check.',
  relocate:
    'Instead of moving: swap your King with a friendly piece in your own half. May not leave your King in check, and the swapped piece may not arrive giving check.',
  decree: 'Instead of moving: name one enemy piece (not the King). It cannot move on your opponent’s next turn.',
  revive: 'Instead of moving: return a piece from your graveyard to an unattacked empty square in your own half. Costs reserved points equal to its value: pawn 1, knight or bishop 3. It returns without its enchantment, and may not arrive giving check.',
  doom: 'Instead of moving: name one enemy piece that is not the King, and Destined Death settles on it. It moves and fights as normal for three more of its owner\u2019s turns, and then it is gone. Nothing lifts the mark. Alone among the powers, this one may be called again and again.',
  chrono:
    'Instead of moving: bend time. In a game with an increment you gain +1 second on every remaining move. In 10 | 0 you gain a flat +30 seconds. Needs a clock.',
};

export interface Loadout {
  /** Starting square (e.g. "d1") → enchantment. One per piece, maximum. */
  readonly enchantments: Readonly<Record<string, Enchantment>>;
  /** The single word a seat brings, and the fallback for anything that has not been taught to
   *  choose three. Kept so saved games, the seats and the online protocol all still parse. */
  readonly power: PowerName;
  /** Up to three words, for a King allowed to choose. When present this wins. */
  readonly powers?: readonly PowerName[];
}

export const emptyLoadout = (power: PowerName = 'teleport'): Loadout => ({
  enchantments: {},
  power,
});

export function costOf(ench: Enchantment, carrier: PieceType): number {
  return ENCH_COST[ench] * CARRIER_MULTIPLIER[carrier];
}

/** Plain-prose names, kept here rather than borrowed from the UI so the engine stays a pure
 *  package. The builder shows these words to a player, so they are words and not letters. */
const CARRIER_PLURAL: Record<PieceType, string> = {
  p: 'pawns',
  n: 'knights',
  b: 'bishops',
  r: 'rooks',
  d: 'dragons',
  a: 'archbishops',
  q: 'queens',
  k: 'kings',
};

const ENCH_LABEL: Record<Enchantment, string> = {
  squire: 'Squire',
  taunt: 'Taunt',
  martyr: 'Martyr',
  outpost: 'Outpost',
  swift: 'Swift',
  herald: 'Herald',
  poison: 'Poison',
  immolation: 'Immolation',
};

/** "pawns", "pawns and knights", "pawns, knights and bishops". */
function listCarriers(types: readonly PieceType[]): string {
  const names = types.map((t) => CARRIER_PLURAL[t]);
  if (names.length <= 1) return names[0] ?? 'nothing';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Why this enchantment cannot go on this piece, or null if it can (ignoring budget). */
export function carrierError(ench: Enchantment, carrier: PieceType): string | null {
  if (carrier === 'k') return 'The King bows to no enchantment';
  if (!LEGAL_CARRIERS[ench].includes(carrier)) {
    return `${ENCH_LABEL[ench]} may only be carried by ${listCarriers(LEGAL_CARRIERS[ench])}`;
  }
  return null;
}

export interface LoadoutCheck {
  readonly ok: boolean;
  readonly spent: number;
  readonly reserve: number;
  readonly errors: readonly string[];
}

export function validateLoadout(
  state: GameState,
  color: Color,
  loadout: Loadout,
  budget: number = BUDGET,
): LoadoutCheck {
  const errors: string[] = [];
  let spent = 0;

  for (const [square, ench] of Object.entries(loadout.enchantments)) {
    const piece = state.board[parseSquare(square)];
    if (!piece || piece.color !== color) {
      errors.push(`no ${color === 'w' ? 'white' : 'black'} piece on ${square}`);
      continue;
    }
    const problem = carrierError(ench, piece.type);
    if (problem) {
      errors.push(`${square}: ${problem}`);
      continue;
    }
    spent += costOf(ench, piece.type);
  }

  // A Squire with nobody to carry the arms for is two points of nothing: his only move is to
  // trade places with a Herald, so without one in the same army he is an ordinary pawn that
  // cost extra. Refused at the builder rather than sold and then discovered to be inert.
  const chosen = Object.values(loadout.enchantments);
  if (chosen.includes('squire') && !chosen.includes('herald')) {
    errors.push('a Squire needs a Herald in the same army');
  }

  if (spent > budget) errors.push(`over budget: ${spent}/${budget} points`);
  return { ok: errors.length === 0, spent, reserve: budget - spent, errors };
}

/** Writes a validated loadout into the state: enchantments onto pieces, power and leftover
 *  reserve onto the player. Reveal happens at match start, so nothing here is hidden. */
export function applyLoadout(
  state: GameState,
  color: Color,
  loadout: Loadout,
  budget: number = BUDGET,
): GameState {
  const check = validateLoadout(state, color, loadout, budget);
  if (!check.ok) throw new Error(`invalid loadout: ${check.errors.join('; ')}`);

  const board = state.board.slice();
  for (const [square, ench] of Object.entries(loadout.enchantments)) {
    const index = parseSquare(square);
    const piece = board[index]!;
    board[index] = { ...piece, ench };
  }

  return {
    ...state,
    board,
    powers: {
      ...state.powers,
      // `powers` may name up to three. A Loadout that still carries a single `power` is read as
      // a King who knows that one word, which keeps every existing caller — seats, duels, saved
      // games — working unchanged.
      [color]: {
        powers: loadout.powers ?? [loadout.power],
        spent: [],
        reserve: check.reserve,
      },
    },
  };
}

/** Human-readable summary rows for the reveal screen and the balance log. */
export function loadoutSummary(
  state: GameState,
  loadout: Loadout,
): { square: string; piece: PieceType; ench: Enchantment; cost: number }[] {
  return Object.entries(loadout.enchantments)
    .map(([square, ench]) => {
      const piece = state.board[parseSquare(square)]!;
      return { square: squareName(parseSquare(square)), piece: piece.type, ench, cost: costOf(ench, piece.type) };
    })
    .sort((a, b) => b.cost - a.cost);
}
