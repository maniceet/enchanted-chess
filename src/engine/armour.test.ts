import { describe, expect, it } from 'vitest';
import { initialState, squareName } from './board';
import { armorArmy, HOUSE } from './ai';
import type { GameState } from './types';

/* Which pawns the plate goes on, not merely how many.
 *
 * `armorArmy` walked the board in square order and plated whichever pawns it met first — a2 and
 * b2 — so the seat whose entire identity is that he holds ground was armouring the one flank
 * nobody contests while his centre stood bare. Reported from play: "the text says every pawn is
 * armoured but I see only two flank pawns". Both halves of that were wrong, and the text was
 * wronger than the board: `few` fell through to the branch that announces a fully armoured army.
 */
const plated = (s: GameState, color: 'w' | 'b') =>
  s.board
    .map((p, i) => (p?.ench === 'taunt' && p.color === color ? squareName(i) : null))
    .filter(Boolean);

describe('the Armored Knight plates his centre', () => {
  it('puts the two shields on the middle pawns, not the a-file', () => {
    expect(plated(armorArmy(initialState({}), 'w', 'few'), 'w')).toEqual(['d2', 'e2']);
    expect(plated(armorArmy(initialState({}), 'b', 'few'), 'b')).toEqual(['d7', 'e7']);
  });

  it('widens outwards from the middle when there are four to give', () => {
    expect(plated(armorArmy(initialState({}), 'w', 'half'), 'w')).toEqual(['c2', 'd2', 'e2', 'f2']);
  });

  it('is the scope the seat actually fields, so the reveal can describe it', () => {
    expect(HOUSE.armored.armored).toBe('few');
    expect(HOUSE.armored.blurb).toContain('centre is where the shields are');
  });

  it('adds to what he bought rather than replacing it, which is why the reveal cannot claim his flanks are bare', () => {
    // He spends his own mana on shields too, and a bought one can land on any file. Seen in
    // play as three armoured pawns where the text promised two: c7 was his, d7 and e7 the
    // armour. The board was right and the sentence was not.
    const base = initialState({});
    const board = [...base.board];
    board[50] = { ...board[50]!, ench: 'taunt' }; // c7, as his own loadout might buy
    const armoured = armorArmy({ ...base, board }, 'b', 'few');
    expect(plated(armoured, 'b')).toEqual(['c7', 'd7', 'e7']);
  });

  it('never plates a pawn that already carries something', () => {
    const base = initialState({});
    const board = [...base.board];
    board[11] = { ...board[11]!, ench: 'poison' }; // d2, one of the two it wants
    const armoured = armorArmy({ ...base, board }, 'w', 'few');
    expect(armoured.board[11]?.ench, 'a road gift is never overwritten').toBe('poison');
    expect(plated(armoured, 'w')).toEqual(['e2']);
  });

  it('leaves the wider scopes alone', () => {
    const all = armorArmy(initialState({}), 'w', 'all');
    expect(plated(all, 'w').length, 'every piece but the King').toBe(15);
  });
});
