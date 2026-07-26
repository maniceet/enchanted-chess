import { describe, expect, it } from 'vitest';
import { initialState } from './board';
import { applyLoadout, emptyLoadout } from './loadout';
import { armorArmy, HOUSE, innkeeperLoadout, raiseArchbishops, raiseDragons } from './ai';
import type { GameState, Piece } from './types';

/* A seat's dragons and archbishops are never shielded. The profile type already cannot ask for
 * it — `dragons?: { count: number }` has no taunt field, and its absence is the rule — but the
 * type was not the only door. A seat's own rolled loadout may put Taunt on a knight, and the
 * raise used to carry the enchantment through to the dragon: the exact
 * wall-you-cannot-reach-into that deleting the profile option was supposed to end, back on
 * whatever fraction of rolls happened to draw it. A rules bug that appears on a dice roll is
 * the worst kind to playtest against, so this pins the whole assembly, not just the helper.
 *
 * The one deliberate exception: Rolain's lent dragon on the *player's* side is raised with
 * `taunt: true` and keeps its shield. A boon is not a wall. */

const pieces = (state: GameState, color: 'w' | 'b'): Piece[] =>
  state.board.filter((p): p is Piece => p !== null && p.color === color);

describe('no seat ever fields a shielded dragon or archbishop', () => {
  it('the raise sheds Taunt that a rolled loadout put on the mount', () => {
    // Taunt on both knights and both bishops — the worst roll the loadout generator can make.
    const base = initialState({});
    const loadout = {
      ...emptyLoadout('teleport'),
      enchantments: { b8: 'taunt', g8: 'taunt', c8: 'taunt', f8: 'taunt' } as const,
    };
    const armed = applyLoadout(base, 'b', loadout);
    const raised = raiseArchbishops(raiseDragons(armed, 'b', { count: 2 }), 'b', { count: 2 });
    for (const piece of pieces(raised, 'b')) {
      if (piece.type === 'd' || piece.type === 'a') {
        expect(piece.ench, `${piece.type} must shed Taunt`).not.toBe('taunt');
      }
    }
  });

  it('a non-Taunt enchantment rides along — it is the shield that is banned, not enchantment', () => {
    const base = initialState({});
    const loadout = { ...emptyLoadout('teleport'), enchantments: { b8: 'outpost' } as const };
    const armed = applyLoadout(base, 'b', loadout);
    const raised = raiseDragons(armed, 'b', { count: 2 });
    const dragons = pieces(raised, 'b').filter((p) => p.type === 'd');
    expect(dragons.some((d) => d.ench === 'outpost')).toBe(true);
  });

  it('holds for every seat, assembled the way the game assembles it', () => {
    // Mirrors the order in `startingState`: loadout → dragons → archbishops → armour. If the
    // real assembly reorders (armour before the raise would re-open the hole from the other
    // side), this stays green while the game breaks — which is why the raise itself sheds the
    // shield rather than trusting the order. Fixed rng: the roll that always spends.
    let n = 0;
    const rng = () => (n = (n * 1664525 + 1013904223 + 1) >>> 0) / 4294967296;
    for (const [name, profile] of Object.entries(HOUSE)) {
      const base = initialState({});
      const loadout = innkeeperLoadout(base, 'b', { rng, budget: profile.mana });
      let army = applyLoadout(base, 'b', loadout);
      if (profile.dragons) army = raiseDragons(army, 'b', profile.dragons);
      if (profile.archbishops) army = raiseArchbishops(army, 'b', profile.archbishops);
      if (profile.armored) army = armorArmy(army, 'b', profile.armored);
      for (const piece of pieces(army, 'b')) {
        if (piece.type === 'd' || piece.type === 'a') {
          expect(piece.ench, `${name} fields a shielded ${piece.type}`).not.toBe('taunt');
        }
      }
    }
  });

  it("Rolain's lent dragon is the exception and keeps its shield", () => {
    const raised = raiseDragons(initialState({}), 'w', { count: 1, taunt: true });
    const dragons = pieces(raised, 'w').filter((p) => p.type === 'd');
    expect(dragons).toHaveLength(1);
    expect(dragons[0].ench).toBe('taunt');
  });
});
