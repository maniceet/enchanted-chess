/* The Innkeeper teaching the parts of this game that are not chess.
 *
 *  The rules assume you can already play chess. What they cannot assume is any of the rest —
 *  that a shield has to be broken before the piece under it can be taken, that capturing a
 *  Martyr costs you your next move, that a King's word is spent the moment it is spoken. The
 *  Rules page has all of it, and a Rules page is read by people who already understand the
 *  thing they are looking up.
 *
 *  So it is taught at the board, once each, in the one voice on the road that would bother:
 *  thirty years behind that table and he has watched every traveller make the same four
 *  mistakes. He speaks when the situation is actually in front of the player and not before —
 *  a warning about Poison delivered on move one is a rule; delivered as your knight lines up
 *  the pawn, it is advice.
 *
 *  Pure and separate from the component on purpose. "Which lesson does this position deserve"
 *  is a question with right answers, and answering it inside a render is how it stops being
 *  testable.
 */

import { isShielded } from '../engine/movegen';
import type { Color, GameState, Piece } from '../engine/types';

export type Lesson =
  | 'shield'
  | 'martyr'
  | 'poison'
  | 'outpost'
  | 'power'
  | 'herald'
  | 'doom';

/** Said once, the first time the situation is really on the board. */
export const LESSON_TEXT: Record<Lesson, string> = {
  shield:
    'That one has a shield up. You cannot take it while it holds — strike it and you break the steel instead, and that is your whole turn gone. Break it now, or leave it and take something else.',
  martyr:
    'Careful. That piece is marked to die badly: take it and whatever took it stands still for a turn. Sometimes that is worth it. Sometimes it is exactly what they wanted.',
  poison:
    'Do not take that pawn with anything you would miss. It is poisoned — whatever kills it dies with it. Your King is the one exception; he bows to no enchantment.',
  outpost:
    'Your pawns cannot touch that one. Outpost. Bring something that is not a pawn, or leave it where it stands and work around it.',
  power:
    'Your King has a word, and it is worth remembering that speaking one costs your whole move. He gets each of them once. Most travellers save them until it is too late to matter.',
  herald:
    'That pawn crowns on the seventh, not the eighth. One rank closer than anybody expects, which is the entire point of it — count the squares again.',
  doom:
    'He has marked that piece. Three of your turns and it is gone, and nothing lifts it: not moving it, not defending it. Spend it, trade it, or make the three turns pay for themselves.',
};

/** Squares whose occupant belongs to `color`. */
function piecesOf(state: GameState, color: Color): { square: number; piece: Piece }[] {
  const out: { square: number; piece: Piece }[] = [];
  for (let s = 0; s < 64; s++) {
    const piece = state.board[s];
    if (piece && piece.color === color) out.push({ square: s, piece });
  }
  return out;
}

/** The lesson this position has earned, or null.
 *
 *  `learned` is everything the traveller has already been told, so nothing repeats across a
 *  whole campaign. Order matters: the list runs from the mistake that costs a game soonest to
 *  the one a player has time to notice unaided.
 */
export function lessonFor(
  state: GameState,
  player: Color,
  learned: readonly Lesson[],
): Lesson | null {
  const knows = (l: Lesson) => learned.includes(l);
  const enemy: Color = player === 'w' ? 'b' : 'w';
  const theirs = piecesOf(state, enemy);
  const mine = piecesOf(state, player);

  // Only ever on the player's own turn: a lesson that arrives while the opponent is thinking is
  // a lesson about a board that is already changing.
  if (state.turn !== player) return null;

  // Something of yours is under sentence. Soonest and most expensive to miss.
  if (!knows('doom') && state.doomed.some((d) => mine.some((m) => m.piece.id === d.pieceId))) {
    return 'doom';
  }

  // A shielded enemy piece you could otherwise be taking.
  if (!knows('shield') && theirs.some(({ square }) => isShielded(state.board, square))) {
    return 'shield';
  }

  if (!knows('poison') && theirs.some(({ piece }) => piece.ench === 'poison')) return 'poison';
  if (!knows('martyr') && theirs.some(({ piece }) => piece.ench === 'martyr')) return 'martyr';
  if (!knows('outpost') && theirs.some(({ piece }) => piece.ench === 'outpost')) return 'outpost';

  // Yours, and about what you can do rather than what can be done to you.
  if (!knows('herald') && mine.some(({ piece }) => piece.ench === 'herald')) return 'herald';

  // Last, because it costs nothing to be late with: the King's words, once there is one to spend.
  if (!knows('power') && state.powers[player].powers.length > 0 && state.ply >= 6) return 'power';

  return null;
}

/* `taught2`, not `taught`: the first key is poisoned. Before the sayRef fix the lessons were
 * recorded as learned while the bubble showed nothing, so every list written under the old key
 * describes a player who was told nothing and will never be told. A new key resets everyone,
 * which is exactly right — the worst case is hearing seven short lines again. */
export const TAUGHT_KEY = 'enchanted-chess:taught2';
const KEY = TAUGHT_KEY;
const POISONED_KEY = 'enchanted-chess:taught';

export function loadLearned(): Lesson[] {
  try {
    localStorage.removeItem(POISONED_KEY);
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value.filter((v) => typeof v === 'string') as Lesson[]) : [];
  } catch {
    return [];
  }
}

export function remember(learned: readonly Lesson[], lesson: Lesson): Lesson[] {
  const next = learned.includes(lesson) ? [...learned] : [...learned, lesson];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* a traveller in private browsing simply gets told twice */
  }
  return next;
}

/** For the Ledger, and for anyone who wants to be taught it all again. */
export function forgetLessons(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
}
