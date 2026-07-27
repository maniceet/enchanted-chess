import { describe, expect, it } from 'vitest';
import { initialState, squareName } from './board';
import { applyAction, legalActions } from './apply';
import { isError, type GameState, type MoveAction, type PieceType } from './types';

/* Chess960 castling, and the collision classic chess cannot produce.
 *
 * With the King on b1 and a rook on a1, castling queen-side lands the King on c1 — which is
 * also an ordinary King step. `legalMoves` offers both, correctly, and they are different
 * moves: one brings the rook to d1, the other leaves it on a1. The engine matched an incoming
 * action against the legal list by from/to/promo alone, found the ordinary step first, and
 * castled by moving the King one square and abandoning the rook. From those back ranks
 * castling did not work at all, and no test noticed, because from e1 the castling square is
 * two files away and can never be a King's step.
 */
const back = ['r', 'k', 'n', 'b', 'b', 'q', 'n', 'r'] as PieceType[];

/** King b1, rooks a1 and h1, nothing in between on either back rank. */
function cleared(): GameState {
  const s = initialState({ back });
  const board = [...s.board];
  for (const square of [2, 3, 4, 5, 6, 58, 59, 60, 61, 62]) board[square] = null;
  return { ...s, board };
}

const rank1 = (s: GameState) =>
  Array.from({ length: 8 }, (_, f) => {
    const p = s.board[f];
    return `${squareName(f)}:${p ? p.color + p.type : '--'}`;
  }).join(' ');

const find = (s: GameState, flag: string) =>
  legalActions(s).find(
    (a) => a.type === 'move' && (a.flags ?? []).includes(flag as never),
  ) as MoveAction;

describe('Chess960 castling from a King that starts beside its castling square', () => {
  it('brings the rook across when castling queen-side', () => {
    const after = applyAction(cleared(), find(cleared(), 'castleQ'));
    expect(isError(after)).toBe(false);
    expect(rank1(after as GameState)).toBe(
      'a1:-- b1:-- c1:wk d1:wr e1:-- f1:-- g1:-- h1:wr',
    );
  });

  it('brings the rook across when castling king-side', () => {
    const after = applyAction(cleared(), find(cleared(), 'castleK'));
    expect(isError(after)).toBe(false);
    expect(rank1(after as GameState)).toBe(
      'a1:wr b1:-- c1:-- d1:-- e1:-- f1:wr g1:wk h1:--',
    );
  });

  it('still lets the King take the ordinary step onto the same square', () => {
    // The step and the castle share from/to, so the fix must tell them apart rather than
    // preferring one — this is the move that would be lost by choosing castle-always.
    const after = applyAction(cleared(), { type: 'move', from: 1, to: 2 });
    expect(isError(after)).toBe(false);
    expect(rank1(after as GameState)).toBe(
      'a1:wr b1:-- c1:wk d1:-- e1:-- f1:-- g1:-- h1:wr',
    );
  });

  it('offers both, so the board has something to ask the player about', () => {
    const both = legalActions(cleared()).filter(
      (a) => a.type === 'move' && a.from === 1 && a.to === 2,
    );
    expect(both).toHaveLength(2);
  });

  it('leaves classic castling exactly as it was', () => {
    const s = initialState();
    const board = [...s.board];
    for (const square of [5, 6, 1, 2, 3]) board[square] = null;
    const open = { ...s, board };
    const after = applyAction(open, find(open, 'castleK')) as GameState;
    expect(isError(after)).toBe(false);
    expect(rank1(after)).toContain('f1:wr');
    expect(rank1(after)).toContain('g1:wk');
  });
});
