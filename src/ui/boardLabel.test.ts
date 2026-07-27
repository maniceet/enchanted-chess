import { describe, expect, it } from 'vitest';
import { parseSquare } from '../engine/board';
import { position } from '../engine/testkit';
import { label } from './Board';

/* What a screen reader is told about a square.
 *
 * The accessible name used to be `describe(...).split('\n')[0]`, and `describe` is written for a
 * tooltip — its first line is the bare "White Pawn on a2". So every enchanted piece on the board
 * announced itself as an ordinary one: a Poison pawn, a Taunt piece standing behind a live
 * shield, a piece bound by Martyr and unable to move were all indistinguishable by ear. A phone
 * has no hover, so for a touch screen reader that information existed nowhere at all — in a game
 * whose stated design law is that everything is knowable.
 *
 * These pin the facts a label must carry: what the piece is carrying, whether the shield is up
 * right now, and whether it can move. */
describe('the name a square announces', () => {
  it('says the enchantment, not just the piece', () => {
    const state = position({ e1: 'wk', a2: 'wp:poison', h8: 'bk' });
    expect(label(state, parseSquare('a2'))).toBe('White Pawn on a2, Poison');
  });

  it('leaves an ordinary piece ordinary', () => {
    const state = position({ e1: 'wk', a2: 'wp', h8: 'bk' });
    expect(label(state, parseSquare('a2'))).toBe('White Pawn on a2');
  });

  it('names an empty square by its name alone', () => {
    const state = position({ e1: 'wk', h8: 'bk' });
    expect(label(state, parseSquare('d4'))).toBe('d4');
  });

  /* The shield is the one property that changes without the piece moving, so hearing "Taunt" is
   * not enough — a player needs to know whether it is up *now*. */
  it('distinguishes a live shield from a sleeping one', () => {
    // Defended along the a-file — a rook on b1 sees neither rank 2 nor file a, which is how
    // the first draft of this test managed to assert a shield that was never up.
    const up = position({ e1: 'wk', a2: 'wp:taunt', a1: 'wr', h8: 'bk' }, { ply: 20 });
    expect(label(up, parseSquare('a2'))).toBe('White Pawn on a2, Taunt, shield up');

    // Undefended, but still at home: down rather than asleep.
    const down = position({ e1: 'wk', a2: 'wp:taunt', h8: 'bk' }, { ply: 20 });
    expect(label(down, parseSquare('a2'))).toBe('White Pawn on a2, Taunt, shield down');

    // Past the middle, where Taunt does not reach at all.
    // Past the middle the shield sleeps whether or not anything defends it.
    const away = position({ e1: 'wk', a6: 'wp:taunt', b6: 'wr', h8: 'bk' }, { ply: 20 });
    expect(label(away, parseSquare('a6'))).toBe('White Pawn on a6, Taunt, shield asleep');
  });

  it('says when a piece may not move', () => {
    const state = position({ e1: 'wk', a2: 'wp:poison', h8: 'bk' }, { ply: 20 });
    const frozen = {
      ...state,
      frozen: [{ pieceId: state.board[parseSquare('a2')]!.id, untilPly: state.ply + 2 }],
    };
    expect(label(frozen, parseSquare('a2'))).toContain('bound this turn');
  });
});
