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

  /** The road dips in the middle if seat 5 is easier than seat 4: you beat a real opponent at
   *  the Wit and then walk through the gate. Difficulty lives in `maxNodes`, not in `depth`
   *  (which is a ceiling on iterative deepening that the node cap reaches first) and not in
   *  armour (worth about one tempo per shielded piece). */
  it('walks up the ladder without a trough, measured in nodes', () => {
    const caps = CAMPAIGN.map((who) => HOUSE[who].maxNodes ?? 0);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i], `${CAMPAIGN[i]} must not search less than ${CAMPAIGN[i - 1]}`)
        .toBeGreaterThanOrEqual(caps[i - 1]);
    }
    expect(HOUSE.armored.maxNodes!).toBeGreaterThan(HOUSE.wit.maxNodes!);
    expect(HOUSE.armored.maxNodes!).toBeLessThan(HOUSE.ardax.maxNodes!);
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
