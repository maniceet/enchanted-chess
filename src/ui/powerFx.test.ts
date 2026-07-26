import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/apply';
import { findKing } from '../engine/board';
import { parseFen } from '../engine/fen';
import { isError } from '../engine/types';
import type { GameState, PowerAction } from '../engine/types';
import { lastPower, powerSquares } from './powerFx';

/** A position with both powers unused, so a power is legal from move one. */
function board(fen: string, power: 'teleport' | 'relocate' | 'decree' | 'revive'): GameState {
  const state = parseFen(fen);
  return {
    ...state,
    powers: {
      w: { power, used: false, reserve: 4 },
      b: { power, used: false, reserve: 4 },
    },
  } as GameState;
}

function play(state: GameState, action: PowerAction): GameState {
  const next = applyAction(state, action);
  if (isError(next)) throw new Error(`illegal in fixture: ${next.error}`);
  return next;
}

describe('which squares a power lights up', () => {
  it('teleport points at where the piece left and where it landed', () => {
    const before = board('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'teleport');
    const action = { type: 'power', power: 'teleport', args: { kind: 'teleport', from: 12, to: 28 } } as PowerAction;
    const after = play(before, action);
    expect(powerSquares(before, after, action)).toEqual([12, 28]);
  });

  it('relocate points at both ends of the swap, which needs both positions to know', () => {
    // The King's own square is not in the action — the action only names the piece swapped
    // with — so a highlight derived from the action alone would light one square and lose the
    // more interesting one.
    // Black's king is on h8, not e8: with it on e8 the rook arriving at e1 would give
    // check, and a swapped piece may not arrive giving check.
    const before = board('7k/8/8/8/8/8/8/R3K3 w - - 0 1', 'relocate');
    const action = { type: 'power', power: 'relocate', args: { kind: 'relocate', with: 0 } } as PowerAction;
    const after = play(before, action);
    const from = findKing(before, 'w');
    const to = findKing(after, 'w');
    expect(from).not.toBe(to);
    expect(powerSquares(before, after, action)).toEqual([from, to]);
  });

  it('decree points at the piece it silenced', () => {
    // The knight is on b6, not f3: a knight on f3 checks the king on e1, and no power may
    // be activated while in check. The first draft of this fixture made exactly that mistake.
    const before = board('4k3/8/1n6/8/8/8/8/4K3 w - - 0 1', 'decree');
    const action = { type: 'power', power: 'decree', args: { kind: 'decree', target: 41 } } as PowerAction;
    const after = play(before, action);
    expect(powerSquares(before, after, action)).toEqual([41]);
  });

  it('time manipulation lights nothing, because it happens to the clock', () => {
    const before = board('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'teleport');
    const action = { type: 'power', power: 'chrono', args: { kind: 'chrono' } } as PowerAction;
    // Not applied: the point here is that the square list is empty whatever the position.
    expect(powerSquares(before, before, action)).toEqual([]);
  });
});

describe('reading the last action off the log', () => {
  it('finds a power that has just been played', () => {
    const before = board('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'teleport');
    const action = { type: 'power', power: 'teleport', args: { kind: 'teleport', from: 12, to: 28 } } as PowerAction;
    expect(lastPower(play(before, action))?.power).toBe('teleport');
  });

  it('says nothing for an ordinary move, or for no game at all', () => {
    const before = board('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'teleport');
    const moved = applyAction(before, { type: 'move', from: 12, to: 20 });
    expect(isError(moved)).toBe(false);
    expect(lastPower(moved as GameState)).toBeNull();
    expect(lastPower(null)).toBeNull();
    expect(lastPower(before)).toBeNull();
  });
});
