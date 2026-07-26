/* Which squares a King power just acted on, so the board can say so.
 *
 * A power costs a whole turn and can move a piece across the board, freeze one, or bring one
 * back from the dead — and until now the board simply looked different afterwards, with no
 * indication that anything had been spent. Reported as: "it seems very abrupt as to what
 * happened." A move at least has a piece leaving one square and arriving at another; a power
 * had nothing.
 *
 * Kept apart from the component and pure, because "which squares lit up" is exactly the sort
 * of thing that is easy to get subtly wrong and easy to test.
 */

import { findKing } from '../engine/board';
import type { GameState, PowerAction } from '../engine/types';

/** The squares to highlight for `action`, given the positions either side of it.
 *
 *  Both states are needed because two powers are only legible as a difference: Relocate swaps
 *  the King with a friendly piece, so the pair of squares is "where the King was" and "where it
 *  is", which no single position knows on its own. */
export function powerSquares(before: GameState, after: GameState, action: PowerAction): number[] {
  const args = action.args;
  switch (args.kind) {
    case 'teleport':
      return [args.from, args.to];
    case 'relocate': {
      const from = findKing(before, before.turn);
      const to = findKing(after, before.turn);
      // A swap with itself is not legal, but a defensive dedupe keeps the highlight honest
      // rather than drawing the same ring twice.
      return from === to ? [to] : [from, to];
    }
    case 'decree':
      return [args.target];
    case 'doom':
      return [args.target];
    case 'revive':
      return [args.to];
    case 'chrono':
      // Time Manipulation touches the clock, not the board. There is nothing on the squares to
      // point at, so the banner carries it alone.
      return [];
  }
}

/** The last action, if it was a power. Reading it off the log rather than off the click handler
 *  means the flash fires the same way for your own power, the opponent's, and one replayed from
 *  a server — three paths that would otherwise each need their own hook. */
export function lastPower(state: GameState | null | undefined): PowerAction | null {
  if (!state) return null;
  const last = state.log[state.log.length - 1];
  return last && last.type === 'power' ? last : null;
}
