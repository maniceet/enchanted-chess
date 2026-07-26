import { describe, expect, it } from 'vitest';
import { initialState } from '../engine/board';
import { applyLoadout, emptyLoadout } from '../engine/loadout';
import { armorArmy, HOUSE, raiseDragons } from '../engine/ai';
import type { GameState } from '../engine/types';

/** `boon` (Rolain's lent dragon) and `silentKing` (no Divine Call yet) describe a *run*, and
 *  the UI's `Setup` object is reused between games. Stale copies have leaked into a hotseat
 *  duel and into an online match against a stranger, twice telling a player to go and beat a
 *  character their opponent has never heard of.
 *
 *  `startingState` now re-derives them from the opponent, so the flags cannot apply when there
 *  is no House opposite. This mirrors that logic; if the real one stops deriving, this fails. */

function build(opts: {
  house?: keyof typeof HOUSE;
  boon?: boolean;
  silentKing?: boolean;
}): GameState {
  const base = initialState({});
  const ready = applyLoadout(applyLoadout(base, 'w', emptyLoadout()), 'b', emptyLoadout());
  const profile = opts.house ? HOUSE[opts.house] : undefined;
  const mounted = profile?.dragons ? raiseDragons(ready, 'b', profile.dragons) : ready;
  const armored = profile?.armored ? armorArmy(mounted, 'b') : mounted;
  const onTheRoad = profile !== undefined;
  const withBoon =
    onTheRoad && opts.boon ? raiseDragons(armored, 'w', { count: 1, taunt: true }) : armored;
  return onTheRoad && opts.silentKing
    ? {
        ...withBoon,
        // A silent King knows nothing rather than having spent it: an empty word list, not a
        // spent one, which is also what the bar reads to say "No power".
        powers: { ...withBoon.powers, w: { ...withBoon.powers.w, powers: [], spent: [] } },
      }
    : withBoon;
}

const whiteDragons = (state: GameState) =>
  state.board.filter((p) => p?.color === 'w' && p.type === 'd').length;

describe('Run flags never apply away from the road', () => {
  it('a stale boon gives no dragon when there is no House opposite', () => {
    expect(whiteDragons(build({ boon: true }))).toBe(0);
  });

  it('a stale silentKing leaves the King able to call when there is no House opposite', () => {
    expect(build({ silentKing: true }).powers.w.powers.length).toBeGreaterThan(0);
  });

  it('but both still apply on the road, where they mean something', () => {
    expect(whiteDragons(build({ house: 'kyrax', boon: true }))).toBe(1);
    expect(build({ house: 'rolain', silentKing: true }).powers.w.powers).toHaveLength(0);
  });

  it('a House opponent still gets its own profile quirks', () => {
    const armouredSeat = build({ house: 'armored' });
    const armoured = armouredSeat.board.filter((p) => p?.color === 'b' && p.ench === 'taunt');
    expect(armoured.length).toBeGreaterThan(0);
    expect(build({ house: 'kyrax' }).board.filter((p) => p?.color === 'b' && p.type === 'd')).toHaveLength(2);
  });
});
