import { BUDGET, emptyLoadout, type Loadout } from '../engine/loadout';
import type { Color } from '../engine/types';

/* What a match against a stranger inherits from the road: nothing.
 *
 * `setup` is one object reused across every game the app plays, which is convenient right up
 * until a road run leaves something on it. Being matched online does *not* go through
 * `beginBuild`, so it is the one path that has to do this clearing itself, and it has now been
 * missed twice — first for the lent dragon and the silenced King, then for mana, which was
 * worse because it decided games rather than just reading oddly: White built on whatever the
 * campaign had reached while Black always got the flat four.
 *
 * So the list lives here, once, with a test. Anything a run writes onto `setup` belongs in it.
 */
export interface StrangerReset {
  /** Rolain's lent dragon is a road boon. */
  boon: false;
  /** A King with no Divine Call is a road state. */
  silentKing: false;
  /** Four points each, always. Mana is the campaign's currency. */
  budget: number;
  /** Dragonblood turns knights into dragons on the road only. */
  dragons: number;
  /** Trials — Second Chair, timed, deadly — are road modifiers. */
  trials: never[];
  /** Colour comes from the server, not from whatever the last game used. */
  player: Color;
  /** Both armies start bare. Carrying the previous game's loadouts across meant a stranger
   *  match opened with the *Innkeeper's* army sitting on Black — Outpost b7, Taunt f7, Taunt
   *  h7, straight off the campaign board — as though the player had chosen it. Your own last
   *  build would at least be defensible; an opponent's is not, and telling them apart on a
   *  shared `setup` object is not worth the convenience. */
  white: Loadout;
  black: Loadout;
}

export function strangerReset(you: Color | null | undefined): StrangerReset {
  return {
    boon: false,
    silentKing: false,
    budget: BUDGET,
    dragons: 0,
    trials: [],
    player: you ?? 'w',
    white: emptyLoadout(),
    black: emptyLoadout(),
  };
}
