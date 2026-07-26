import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../engine/apply';
import { isError } from '../engine/types';
import { parseSquare } from '../engine/board';
import { DRILLS, rememberDrilled } from './drills';
import type { GameState } from '../engine/types';

/* Every drill must be completable, proven by walking it — a set piece with an impossible goal
 * is a locked room, and without this the only way to find one is a stuck player. For each step
 * the engine's own legal actions are searched for one that satisfies the goal; the drill then
 * advances exactly the way DrillsPage advances it, scripted reply included. */

function walk(drillId: string): void {
  const drill = DRILLS.find((d) => d.id === drillId);
  if (!drill) throw new Error(`no drill ${drillId}`);
  let state = drill.start();
  for (const [i, step] of drill.steps.entries()) {
    const candidates = legalActions(state);
    let advanced: GameState | null = null;
    for (const action of candidates) {
      const next = applyAction(state, action);
      if (isError(next)) continue;
      if (step.done(state, action, next)) {
        advanced = next;
        break;
      }
    }
    expect(advanced, `${drill.id} step ${i + 1}: no legal action reaches the goal`).not.toBeNull();
    state = advanced as GameState;
    if (step.reply) {
      const replied = applyAction(state, step.reply);
      expect(isError(replied), `${drill.id} step ${i + 1}: scripted reply is illegal`).toBe(false);
      state = replied as GameState;
    }
  }
}

describe("every set piece at the Innkeeper's table can be completed", () => {
  for (const drill of DRILLS) {
    it(`${drill.id} — ${drill.title}`, () => walk(drill.id));
  }
});

describe('the set pieces teach what they claim', () => {
  it('the taunt drill offers the capture as a shield-break, never as a move', () => {
    const drill = DRILLS.find((d) => d.id === 'taunt')!;
    const state = drill.start();
    const ontoPawn = legalActions(state).filter(
      (a) => (a.type === 'move' && a.to === parseSquare('d5')) || a.type === 'shieldBreak',
    );
    // If a plain capture of d5 exists the whole lesson is a lie.
    expect(ontoPawn.some((a) => a.type === 'move')).toBe(false);
    expect(ontoPawn.some((a) => a.type === 'shieldBreak')).toBe(true);
  });

  it('the outpost drill really offers no pawn capture of the knight', () => {
    const drill = DRILLS.find((d) => d.id === 'outpost')!;
    const pawnTakes = legalActions(drill.start()).filter(
      (a) =>
        a.type === 'move' &&
        a.to === parseSquare('d5') &&
        (a.from === parseSquare('c4') || a.from === parseSquare('e4')),
    );
    expect(pawnTakes).toHaveLength(0);
  });

  it('the poison drill leaves the King alive and the knight dead', () => {
    const drill = DRILLS.find((d) => d.id === 'poison')!;
    let state = drill.start();
    // Knight takes the first poison pawn: both die.
    state = applyAction(state, {
      type: 'move',
      from: parseSquare('c3'),
      to: parseSquare('d5'),
    }) as GameState;
    expect(state.board[parseSquare('d5')], 'the knight died with the pawn').toBeNull();
    state = applyAction(state, drill.steps[0].reply!) as GameState;
    // King takes the second: he bows to no enchantment.
    state = applyAction(state, {
      type: 'move',
      from: parseSquare('g1'),
      to: parseSquare('g2'),
    }) as GameState;
    expect(state.board[parseSquare('g2')]?.type).toBe('k');
  });

  it('remembers a finished drill without duplicating', () => {
    expect(rememberDrilled(['taunt'], 'taunt')).toEqual(['taunt']);
    expect(rememberDrilled(['taunt'], 'herald')).toEqual(['taunt', 'herald']);
  });
});
