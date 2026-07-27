import { describe, expect, it } from 'vitest';
import { canActFrom } from './movegen';
import { parseSquare } from './board';
import { position } from './testkit';

/* Whether a piece can be picked up at all.
 *
 * The screen asked this question in two places and got it wrong in both: a Squire whose pawn
 * step was blocked could not be selected, offered no trade squares, and did not even refuse —
 * clicking it did nothing whatsoever, and clicking the Herald afterwards simply selected the
 * Herald. The trade was the piece's only legal turn, and the only turn the predicate did not
 * know about.
 *
 * These pin the shape of the answer: a piece with *any* kind of turn is reachable, and the ones
 * that are not ordinary moves are the ones that matter, because a piece with an ordinary move
 * was never the bug. */
describe('a piece the board will let you pick up', () => {
  it('reaches a Squire whose pawn step is blocked, because the trade is still a turn', () => {
    // The Squire on a2 has a knight of its own standing on a3: no step, no capture, one trade.
    const state = position({ e1: 'wk', a2: 'wp:squire', a3: 'wn', b2: 'wp:herald', h8: 'bk' });
    expect(canActFrom(state, parseSquare('a2'))).toBe(true);
  });

  it('does not reach a pawn that is blocked and carries nothing', () => {
    const state = position({ e1: 'wk', a2: 'wp', a3: 'wn', h8: 'bk' });
    expect(canActFrom(state, parseSquare('a2'))).toBe(false);
  });

  it('reaches a piece whose only turn is a shield-break', () => {
    /* The rook on a5 has its own pawns behind it on a4 and beside it on b5, and above it a
     * shielded Black pawn: defended from b7 and standing in Black's own half, so it cannot be
     * captured. The rook has no move on the board. It does have a turn. */
    const walled = { e1: 'wk', a5: 'wr', a4: 'wp', b5: 'wp', a6: 'bp:taunt', b7: 'bp', h8: 'bk' };
    const state = position(walled, { ply: 20 });
    expect(canActFrom(state, parseSquare('a5'))).toBe(true);

    // And the same rook, against an ordinary pawn, is reachable for the ordinary reason.
    const plain = position(
      { e1: 'wk', a5: 'wr', a4: 'wp', b5: 'wp', a6: 'bp', h8: 'bk' },
      { ply: 20 },
    );
    expect(canActFrom(plain, parseSquare('a5'))).toBe(true);
  });

  it('never reaches a piece belonging to the side that is not to move', () => {
    const state = position({ e1: 'wk', e2: 'wp', e7: 'bp', h8: 'bk' });
    expect(canActFrom(state, parseSquare('e7'))).toBe(false);
  });

  it('says nothing is there when nothing is there', () => {
    const state = position({ e1: 'wk', h8: 'bk' });
    expect(canActFrom(state, parseSquare('d4'))).toBe(false);
  });
});
