import { describe, expect, it } from 'vitest';
import { parseSquare } from './board';
import { ENCH_COST, LEGAL_CARRIERS } from './loadout';
import { isShielded, legalMoves, shieldBreakActions } from './movegen';
import { applyAction } from './apply';
import { position } from './testkit';
import { initialState } from './board';
import { HOUSE, innkeeperLoadout } from './ai';
import { SPELLBOOK } from '../ui/run';
import { isError } from './types';

/* The Aegis: a shield with no conditions on it.
 *
 * Taunt is one point because it charges rent — be defended, and stay in your own half. This is
 * three because it charges nothing, so the piece under it simply cannot be taken in one turn.
 * Everything downstream is deliberately shared with Taunt: same broken flag, same break action,
 * same hammer. These tests are about the four places the two differ, plus the one guarantee that
 * is not a rule at all but an absence — no seat may ever bring one.
 */
describe('a Shield, against the Taunt it is priced beside', () => {
  it('holds with nothing defending it, where a Taunt would be down', () => {
    const aegis = position({ e1: 'wk', a2: 'wp:shield', h8: 'bk' }, { ply: 20 });
    expect(isShielded(aegis.board, parseSquare('a2'))).toBe(true);

    const taunt = position({ e1: 'wk', a2: 'wp:taunt', h8: 'bk' }, { ply: 20 });
    expect(isShielded(taunt.board, parseSquare('a2')), 'Taunt needs a defender').toBe(false);
  });

  it('holds deep in the enemy half, where a Taunt would be asleep', () => {
    const aegis = position({ e1: 'wk', a7: 'wp:shield', b8: 'wr', h8: 'bk' }, { ply: 20 });
    expect(isShielded(aegis.board, parseSquare('a7'))).toBe(true);

    const taunt = position({ e1: 'wk', a7: 'wp:taunt', b8: 'wr', h8: 'bk' }, { ply: 20 });
    expect(isShielded(taunt.board, parseSquare('a7')), 'Taunt sleeps past the middle').toBe(false);
  });

  it('costs a turn to break and only then can be taken', () => {
    // Black rook on a8, White Shield pawn on a6, nothing defending it.
    const board = position({ e1: 'wk', a6: 'wp:shield', a8: 'br', h8: 'bk' }, { ply: 21, turn: 'b' });
    const from = parseSquare('a8');
    const target = parseSquare('a6');

    // The capture is not offered as a move; the break is offered instead.
    expect(legalMoves(board, 'b').some((m) => m.to === target)).toBe(false);
    expect(shieldBreakActions(board, 'b').some((b) => b.target === target)).toBe(true);

    const broken = applyAction(board, { type: 'shieldBreak', from, target });
    if (isError(broken)) throw new Error(broken.error);
    // The attacker has not moved and the piece is still standing.
    expect(broken.board[from]?.type, 'the rook stays where it was').toBe('r');
    expect(broken.board[target]?.ench).toBe('shield');
    expect(broken.board[target]?.shieldBroken).toBe(true);
    expect(isShielded(broken.board, target), 'a broken shield is gone for good').toBe(false);
  });

  it('is priced at three and may be worn by anything but the King', () => {
    expect(ENCH_COST.shield).toBe(3);
    expect(LEGAL_CARRIERS.shield).toEqual(['p', 'n', 'b', 'r', 'q']);
    expect(LEGAL_CARRIERS.shield, 'a raise sheds shields, so a Dragon would waste the points').not.toContain('d');
    expect(LEGAL_CARRIERS.shield, 'the King can never be enchanted').not.toContain('k');
  });
});

/* The part that is not a rule but an absence.
 *
 * "Not available to the enemies" is enforced by the Shield being missing from HOUSE_SPELLBOOK
 * rather than by any check at the board, which means nothing would fail loudly if somebody
 * added it there — the seats would simply start wearing armour the traveller cannot strip and
 * has no counter for. So the guarantee is asserted against generated armies rather than against
 * the list, because the list is exactly the thing that could change by accident.
 */
describe('no seat on the road brings one', () => {
  it('never appears in a house loadout, over many draws, for any seat', () => {
    const rand = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    };
    const base = initialState();
    const seats = ['drunkard', 'innkeeper', 'rolain', 'wit', 'armored', 'ardax', 'kyrax', 'wittex'] as const;
    const rng = rand(20260728);
    for (const seat of seats) {
      for (let i = 0; i < 60; i++) {
        const loadout = innkeeperLoadout(base, 'b', { rng, budget: HOUSE[seat].mana });
        const worn = Object.values(loadout.enchantments);
        expect(worn, `${seat} drew a Shield`).not.toContain('shield');
      }
    }
  });

  it('is on the traveller own shelf, so the asymmetry is deliberate rather than an oversight', () => {
    expect(SPELLBOOK).toContain('shield');
  });
});
