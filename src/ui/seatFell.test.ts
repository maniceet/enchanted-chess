import { describe, expect, it } from 'vitest';
import { seatHasFallen } from './run';
import type { GameStatus } from '../engine/types';

/* Who won, from the traveller's side of the board.
 *
 * The screen that decides a run's fate used to ask whether *White* had won, and White is the
 * traveller at every table but one. The Second Chair seats them as Black. Measured on that trial
 * before this rule was pulled out of the component: the traveller mated White and the run
 * recorded `progress: []`, `active: false`, no purse and no credit for the seat — winning the
 * hardest chair on the road wiped the walk that reached it. The same condition handed the purse,
 * the gate and the spoils to a traveller who lost.
 *
 * The rule now takes the traveller's colour as an argument, so the question cannot be asked
 * without answering "which side is theirs?" first. */
const mate = (winner: 'w' | 'b'): GameStatus => ({ kind: 'checkmate', winner });

describe('whether the seat opposite has fallen', () => {
  it('is true when the traveller mates, on either side of the board', () => {
    expect(seatHasFallen(mate('w'), 'w')).toBe(true);
    expect(seatHasFallen(mate('b'), 'b'), 'The Second Chair: the traveller is Black').toBe(true);
  });

  it('is false when the seat mates, on either side of the board', () => {
    expect(seatHasFallen(mate('b'), 'w')).toBe(false);
    expect(seatHasFallen(mate('w'), 'b'), 'losing must never pay out').toBe(false);
  });

  it('counts a resignation and a flag the same way a mate is counted', () => {
    expect(seatHasFallen({ kind: 'resigned', winner: 'b' }, 'b')).toBe(true);
    expect(seatHasFallen({ kind: 'flagged', winner: 'b' }, 'b')).toBe(true);
    expect(seatHasFallen({ kind: 'resigned', winner: 'w' }, 'b')).toBe(false);
  });

  it('never falls on a draw, a stalemate, or a game still being played', () => {
    expect(seatHasFallen({ kind: 'stalemate' }, 'w')).toBe(false);
    expect(seatHasFallen({ kind: 'draw', reason: 'threefold' }, 'w')).toBe(false);
    expect(seatHasFallen({ kind: 'ongoing' }, 'w')).toBe(false);
  });
});
