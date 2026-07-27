import { describe, expect, it } from 'vitest';
import { applyAction } from './apply';
import { parseSquare } from './board';
import { position } from './testkit';
import { isError, type GameState } from './types';

/* Draws by agreement, which could not happen.
 *
 * Offering does not consume a turn — that is right, and matches how the game is played — so the
 * only way to hand the board to the opponent is to move. But `endTurn` cleared the offer
 * unconditionally, so the move that passed the turn also destroyed the thing the opponent was
 * meant to answer. `drawAccept` was unreachable from any legal sequence, the Accept button on
 * the board was dead code, and ½-½ could never appear in a chronicle. Found by playing it.
 */
const board = () => position({ e1: 'wk', e8: 'bk', a2: 'wp', h7: 'bp' });
const play = (s: GameState, from: string, to: string) =>
  applyAction(s, { type: 'move', from: parseSquare(from), to: parseSquare(to) }) as GameState;

describe('a draw offered can be accepted', () => {
  it('stands over the opponent’s turn, so they can take it', () => {
    let s = applyAction(board(), { type: 'drawOffer' }) as GameState;
    expect(s.drawOfferedBy).toBe('w');
    expect(s.turn, 'offering is not a turn').toBe('w');
    s = play(s, 'a2', 'a3');
    expect(s.drawOfferedBy, 'the offer survives the move that carries it').toBe('w');
    expect(s.turn).toBe('b');
    const drawn = applyAction(s, { type: 'drawAccept' }) as GameState;
    expect(isError(drawn)).toBe(false);
    expect(drawn.status).toEqual({ kind: 'draw', reason: 'agreement' });
  });

  it('is declined by playing on', () => {
    let s = applyAction(board(), { type: 'drawOffer' }) as GameState;
    s = play(s, 'a2', 'a3');
    s = play(s, 'h7', 'h6');
    expect(s.drawOfferedBy, 'answering with a move is a refusal').toBeNull();
    expect(isError(applyAction(s, { type: 'drawAccept' }))).toBe(true);
  });

  it('cannot be accepted by the player who made it', () => {
    const s = applyAction(board(), { type: 'drawOffer' }) as GameState;
    expect(isError(applyAction(s, { type: 'drawAccept' }))).toBe(true);
  });

  it('does not survive a second exchange', () => {
    let s = applyAction(board(), { type: 'drawOffer' }) as GameState;
    s = play(s, 'a2', 'a3');
    s = play(s, 'h7', 'h6');
    s = play(s, 'a3', 'a4');
    expect(s.drawOfferedBy).toBeNull();
  });
});
