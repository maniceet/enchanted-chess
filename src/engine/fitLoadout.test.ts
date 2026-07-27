import { describe, expect, it } from 'vitest';
import { initialState } from './board';
import { emptyLoadout, fitLoadout, validateLoadout } from './loadout';
import type { Loadout } from './loadout';

/* A standing loadout, handed back under tonight's conditions.
 *
 * The builder edits `setup`, which is rebuilt from the bench whenever a game starts, so an army
 * assembled at the table was discarded the moment the game ended — reported from play as "once
 * I've set my loadout, it should persist unless I make a change". Remembering it is only half
 * the job: the conditions move underneath it. Mana falls back to the floor when a run ends, the
 * Sorcerer's book grows, the road drops a Venom onto a pawn the bench had plans for. An army
 * handed back unchanged can open the builder already illegal, refusing to continue until the
 * player clears it by hand, which is worse than not remembering at all.
 */
const army = (enchantments: Record<string, string>, powers?: string[]): Loadout =>
  ({ ...emptyLoadout('teleport'), enchantments, ...(powers ? { powers, power: powers[0] } : {}) }) as Loadout;

describe('a remembered loadout is cut to what tonight allows', () => {
  it('keeps everything that still fits', () => {
    const kept = fitLoadout(initialState({}), 'w', army({ e2: 'taunt', d2: 'martyr' }), { budget: 10 });
    expect(kept.enchantments).toEqual({ e2: 'taunt', d2: 'martyr' });
  });

  it('drops what the purse can no longer pay for, cheapest kept first', () => {
    // Two points of budget: the queen's Taunt costs four on its own and cannot come.
    const kept = fitLoadout(initialState({}), 'w', army({ d1: 'taunt', e2: 'taunt', d2: 'taunt' }), {
      budget: 2,
    });
    expect(Object.keys(kept.enchantments).sort()).toEqual(['d2', 'e2']);
    expect(validateLoadout(initialState({}), 'w', kept, 2).ok).toBe(true);
  });

  it('drops what the Sorcerer has not taught', () => {
    const kept = fitLoadout(initialState({}), 'w', army({ e2: 'poison', d2: 'taunt' }), {
      book: ['taunt'],
      budget: 10,
    });
    expect(kept.enchantments).toEqual({ d2: 'taunt' });
  });

  it('leaves a square the road has already claimed alone', () => {
    // Venom lands on a pawn of its own choosing; a gift is not a slot to build on.
    const base = initialState({});
    const board = [...base.board];
    board[12] = { ...board[12]!, ench: 'poison' }; // e2
    const kept = fitLoadout({ ...base, board }, 'w', army({ e2: 'taunt', d2: 'taunt' }), { budget: 10 });
    expect(kept.enchantments).toEqual({ d2: 'taunt' });
  });

  it('keeps only the words the King is actually offered', () => {
    const kept = fitLoadout(initialState({}), 'w', army({}, ['doom', 'teleport', 'relocate']), {
      powers: ['teleport', 'relocate', 'decree'],
      budget: 10,
    });
    expect(kept.powers).toEqual(['teleport', 'relocate']);
  });

  it('never leaves the King speechless when something is on offer', () => {
    const kept = fitLoadout(initialState({}), 'w', army({}, ['doom']), {
      powers: ['teleport'],
      budget: 10,
    });
    expect(kept.powers).toEqual(['teleport']);
  });

  it('carries no words at all when the King has not learned to speak', () => {
    const kept = fitLoadout(initialState({}), 'w', army({}, ['teleport']), { powers: [], budget: 10 });
    expect(kept.powers ?? []).toEqual([]);
  });

  it('never returns more than three', () => {
    const kept = fitLoadout(initialState({}), 'w', army({}, ['teleport', 'relocate', 'decree', 'revive']), {
      budget: 10,
    });
    expect(kept.powers).toHaveLength(3);
  });
});
