import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN,
  HOUSE,
  REVIVE_RESERVE,
  innkeeperLoadout,
  seatRegime,
  searchOptionsFor,
} from './ai';
import { initialState } from './board';
import type { Enchantment } from './types';
import { BUDGET, ENCHANTMENTS, ENCH_COST, validateLoadout } from './loadout';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A seat whose whole character is a power has to be able to *call* it. Ardax is the case that
 *  went wrong: his profile forces Revive, but the loadout generator spent the entire budget
 *  first and then quietly downgraded him to Teleport, because Revive is paid for out of what
 *  you did not spend. Three separate pieces of copy promised necromancy that never happened. */
describe('Seat loadouts can afford their own powers', () => {
  it('Ardax always keeps Revive, with enough reserve to call a real piece', () => {
    const base = initialState({});
    for (let seed = 0; seed < 25; seed++) {
      const loadout = innkeeperLoadout(base, 'b', {
        power: HOUSE.ardax.power,
        rng: seeded(seed),
      });
      const check = validateLoadout(base, 'b', loadout);
      expect(loadout.power, `seed ${seed}`).toBe('revive');
      expect(check.ok, `seed ${seed}: ${check.errors.join('; ')}`).toBe(true);
      expect(check.reserve, `seed ${seed} reserve`).toBeGreaterThanOrEqual(REVIVE_RESERVE);
    }
  });

  it('a seat with no forced power still spends the whole purse', () => {
    // The reserve is only held back for Revive; nobody else should be handicapped by it.
    const base = initialState({});
    let anyFull = false;
    for (let seed = 0; seed < 25; seed++) {
      const loadout = innkeeperLoadout(base, 'b', { rng: seeded(seed) });
      const check = validateLoadout(base, 'b', loadout);
      expect(check.ok).toBe(true);
      if (check.spent > BUDGET - REVIVE_RESERVE) anyFull = true;
    }
    expect(anyFull, 'no unforced seat ever spent past the Revive reserve').toBe(true);
  });

  it('every seat produces a legal loadout for its own profile', () => {
    const base = initialState({});
    for (const who of CAMPAIGN) {
      for (let seed = 0; seed < 6; seed++) {
        const loadout = innkeeperLoadout(base, 'b', {
          power: HOUSE[who].power,
          rng: seeded(seed * 31 + 5),
        });
        const check = validateLoadout(base, 'b', loadout);
        expect(check.ok, `${who} seed ${seed}: ${check.errors.join('; ')}`).toBe(true);
        // A forced power must survive; an unforced one may be anything legal.
        if (HOUSE[who].power) expect(loadout.power, who).toBe(HOUSE[who].power);
      }
    }
  });
});

/** A seat has to understand the magic its own encounter is built out of.
 *
 *  The Armored Knight is the case that went wrong. His whole encounter is that every piece he
 *  owns wears Taunt, but the evaluation is chosen by whether a seat is *wide*, and he is
 *  deliberately narrow — so he searched with `positional`, which excludes enchantment values
 *  entirely. He could not tell a shielded piece from a bare one, had no reason to keep one home
 *  where the plate works or defended so that the plate exists at all, and measured 6-0-0
 *  against the reference hero with a full suit of armour on. */
describe('Seat regimes', () => {
  it('lets the Armored Knight see the plate he is wearing', () => {
    expect(seatRegime(searchOptionsFor(HOUSE.armored)).magic).toBe(true);
  });

  it('keeps that guarantee even if his sample is later tuned below the wide threshold', () => {
    // The original bug was that `magic` was implied by `sample >= 12` alone. His profile now
    // states it outright, so narrowing him cannot silently take his eyes away again.
    const narrowed = { ...searchOptionsFor(HOUSE.armored), sample: 8 };
    const regime = seatRegime(narrowed);
    expect(regime.wide).toBe(false);
    expect(regime.magic).toBe(true);
  });

  /** What a seat is made of, and why this stopped being one number.
   *
   *  This used to assert that `maxNodes` climbs strictly along the road, on the stated grounds
   *  that "difficulty lives in maxNodes, not in depth and not in armour (worth about one tempo
   *  per shielded piece)". Both halves of that turned out to be wrong, and measurement is what
   *  said so.
   *
   *  Cutting the Wit's search twice moved his win rate not at all; cutting his *mana* from four
   *  to three moved it from 25% to 50% immediately. And the Armoured Knight's free armour is
   *  worth far more than a tempo a piece — eight shielded pawns produced seven draws in eight
   *  games, an opponent nobody could open rather than one they could not beat.
   *
   *  So difficulty is mana, armour and search together, and no unit test can measure the sum.
   *  What it can still hold is the shape: the two teaching seats must stay the weakest things on
   *  the road, and the two at the end must out-search everything in the middle. The flat stretch
   *  between them is deliberate — the Wit and the Armoured Knight both sit near an even fight,
   *  reached by different means — and asserting a strict climb through it would be asserting a
   *  model of difficulty that the numbers have already refuted.
   *
   *  Win rates against the reference hero, n=8, at the time of writing:
   *  rolain 75 · wit 50 · armored 50 · ardax 38 · kyrax 0 · wittex 0. */
  it('keeps the teaching seats weakest and the end of the road strongest', () => {
    const nodesOf = (who: House) => HOUSE[who].maxNodes ?? 0;
    const middle: House[] = ['wit', 'armored', 'ardax'];

    for (const teaching of ['innkeeper', 'rolain'] as const) {
      for (const later of middle) {
        expect(nodesOf(teaching), `${teaching} must not out-search ${later}`)
          .toBeLessThanOrEqual(nodesOf(later));
      }
    }

    for (const boss of ['kyrax', 'wittex'] as const) {
      for (const earlier of middle) {
        expect(nodesOf(boss), `${boss} must out-search ${earlier}`)
          .toBeGreaterThan(nodesOf(earlier));
      }
    }

    // And mana climbs to the end, which is the axis that actually decides these games.
    expect(HOUSE.wittex.mana).toBeGreaterThan(HOUSE.kyrax.mana);
    expect(HOUSE.kyrax.mana).toBeGreaterThan(HOUSE.ardax.mana);
  });

  it('leaves the teaching seats blind to enchantments, which is what keeps them careless', () => {
    for (const who of ['drunkard', 'innkeeper', 'rolain'] as const) {
      expect(seatRegime(searchOptionsFor(HOUSE[who])).magic, who).toBe(false);
    }
  });

  it('gives every seat that is meant to beat you the full evaluation', () => {
    for (const who of ['wit', 'ardax', 'kyrax'] as const) {
      expect(seatRegime(searchOptionsFor(HOUSE[who])).magic, who).toBe(true);
    }
  });

  it('carries every profile field the search cares about, so none is dropped in transit', () => {
    // `searchOptionsFor` exists because three call sites used to hand-copy these, and the one
    // that forgot `magic` is what hid the bug above.
    for (const who of CAMPAIGN) {
      const profile = HOUSE[who];
      const options = searchOptionsFor(profile);
      expect(options.maxNodes, who).toBe(profile.maxNodes);
      expect(options.budgetMs, who).toBe(profile.budgetMs);
      expect(options.magic, who).toBe(profile.magic);
      expect(options.random, who).toBe(profile.random);
    }
  });
});

/** One list of enchantments, not three.
 *
 *  There were two hand-typed copies — one in the loadout builder, one in the house's random
 *  loadout generator — and adding Immolation updated neither, so a relic the player had earned
 *  off Prince Ardax could not be laid out on a single pawn. */
describe('The enchantment list has one owner', () => {
  it('offers every enchantment that has a cost and a carrier', () => {
    for (const ench of Object.keys(ENCH_COST) as Enchantment[]) {
      expect(ENCHANTMENTS, `${ench} is priced but not offered`).toContain(ench);
    }
    expect(ENCHANTMENTS.length).toBe(Object.keys(ENCH_COST).length);
  });

  it('includes the relic, so a found book can actually be carried', () => {
    expect(ENCHANTMENTS).toContain('immolation');
  });
});

