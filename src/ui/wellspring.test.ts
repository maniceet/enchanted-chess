import { beforeEach, describe, expect, it } from 'vitest';
import {
  MANA_CAP,
  MANA_START,
  loseRun,
  offerSpoils,
  powerupEffect,
  resetRun,
  takePowerup,
  winSeat,
  type RunState,
} from './run';
import { loadRun } from './run';

/* The one number a traveller keeps.
 *
 * Everything a walk builds is left on the road when it ends — dragons, venom, the mana you
 * spent the evening accumulating — and that is deliberate: it is what makes the road a
 * roguelike rather than a ladder. But it left nothing at all to carry forward except gold and
 * the Sorcerer's book, so the well raises the floor a walk *starts* from, a point at a time.
 *
 * Worth recording alongside it: the defeat card used to promise "+1 mana, permanently" for
 * reaching new ground while `loseRun` paid fifteen gold, and had done since mana stopped
 * crossing between runs. The card is honest now, and this is where the promise it made is
 * actually kept.
 */
beforeEach(() => {
  resetRun();
});

const deep = (state: RunState, times: number) => {
  let out = state;
  for (let i = 0; i < times; i++) out = takePowerup(out, 'wellspring');
  return out;
};

describe('A Deeper Well', () => {
  it('raises the floor a walk begins from, and this walk with it', () => {
    const before = loadRun();
    expect(before.manaFloor).toBe(MANA_START);
    const after = takePowerup(before, 'wellspring');
    expect(after.manaFloor).toBe(MANA_START + 1);
    expect(after.mana, 'a gift you must lose a run to unwrap is not a gift').toBe(before.mana + 1);
  });

  it('is what the traveller sits down with after the walk ends', () => {
    const walked = takePowerup(winSeat(loadRun(), 'drunkard'), 'wellspring');
    const raised = walked.manaFloor;
    const ended = loseRun(walked);
    expect(ended.mana, 'the floor is the point of it').toBe(raised);
    expect(ended.manaFloor).toBe(raised);
  });

  it('stacks, and stops at the cap', () => {
    const full = deep(loadRun(), MANA_CAP + 4);
    expect(full.manaFloor).toBe(MANA_CAP);
    expect(powerupEffect(full, 'wellspring')).toContain('Symbolic');
    expect(takePowerup(full, 'wellspring').gold, 'a full well pays coin instead').toBeGreaterThan(
      full.gold,
    );
  });

  it('is never offered beside the temporary mana, since that is not a choice', () => {
    // Same family: one table never asks "permanent point, or two you lose tonight?"
    const seeded = (seed: number) => {
      let s = seed >>> 0;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
    };
    for (let seed = 0; seed < 40; seed++) {
      const offer = offerSpoils(loadRun(), seeded(seed));
      const manaish = offer.filter((up) => up === 'wellspring' || up === 'mana' || up === 'whetstone');
      expect(manaish.length, `seed ${seed}: ${offer.join('+')}`).toBeLessThanOrEqual(1);
    }
  });

  it('says plainly what it will do', () => {
    expect(powerupEffect(loadRun(), 'wellspring')).toContain('+1 mana you keep');
  });
});
