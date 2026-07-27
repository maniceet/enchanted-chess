import { describe, expect, it } from 'vitest';
import { applyAction } from './apply';
import { swapActions } from './movegen';
import { position } from './testkit';
import { isError, type GameState } from './types';

/* The contract the board has to honour when it offers a Squire's trade.
 *
 * The board did not offer it at all: `swap` appeared nowhere in the game screen, so an
 * enchantment sold by the Sorcerer for twelve gold, with a drill of its own teaching it, could
 * not be played once in a real game. Wiring it up then went wrong a second time for a subtler
 * reason, which these tests exist to fix in place: a swap that will crown the Herald is offered
 * *without* a `promo` field and refused when applied without one. Reading the offered action to
 * decide whether to ask the player produces a picker that never opens and a move that is always
 * refused.
 */
const board = () =>
  position({ e1: 'wk', f7: 'wp:squire', b2: 'wp:herald', h8: 'bk', a7: 'bp' }, { ply: 24 });

describe('a Squire trading with a Herald', () => {
  it('is offered, from the Squire to the Herald', () => {
    const [swap, ...rest] = swapActions(board(), 'w');
    expect(rest).toHaveLength(0);
    expect(board().board[swap.from]?.ench).toBe('squire');
    expect(board().board[swap.to]?.ench).toBe('herald');
  });

  it('is offered without a promotion, and refused without one, when the Herald would crown', () => {
    // Both halves matter: the absence of `promo` on the offer is why reading it cannot work,
    // and the refusal is what the board asks the engine about instead.
    const swap = swapActions(board(), 'w')[0];
    expect(swap.promo).toBeUndefined();
    expect(isError(applyAction(board(), swap))).toBe(true);
  });

  it('crowns the Herald on arrival when the piece is named', () => {
    const swap = swapActions(board(), 'w')[0];
    const after = applyAction(board(), { ...swap, promo: 'q' }) as GameState;
    expect(isError(after)).toBe(false);
    // The Herald went to the Squire's square, which is its crowning rank, and crowned there.
    expect(after.board[swap.from]?.type).toBe('q');
    expect(after.board[swap.to]?.ench).toBe('squire');
  });

  it('needs no promotion when the Herald lands short of its rank', () => {
    const quiet = position(
      { e1: 'wk', f5: 'wp:squire', b2: 'wp:herald', h8: 'bk', a7: 'bp' },
      { ply: 24 },
    );
    const swap = swapActions(quiet, 'w')[0];
    const after = applyAction(quiet, swap);
    expect(isError(after), 'an ordinary trade is legal as offered').toBe(false);
    expect((after as GameState).board[swap.from]?.ench).toBe('herald');
  });

  it('offers nothing when there is no Herald to carry the arms for', () => {
    const lonely = position({ e1: 'wk', f7: 'wp:squire', h8: 'bk' }, { ply: 24 });
    expect(swapActions(lonely, 'w')).toHaveLength(0);
  });
});
