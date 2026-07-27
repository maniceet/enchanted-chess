import { describe, expect, it } from 'vitest';
import { HOUSE } from '../engine/ai';
import { MANA_START, campaignBudget, loadRun, loseRun, winSeat } from './run';

/* Two changes that came out of playtesting, pinned because both are economy numbers and economy
 * numbers drift silently: nothing crashes when a traveller is a point poorer than intended, the
 * game just gets quietly worse to play.
 *
 * The complaint was that the middle of the road was starving. Rolain, the Wit, the Armoured
 * Knight and Ardax all sit down with three mana; a traveller arriving on one was not playing a
 * harder game so much as a smaller one, since the enchantments are the entire subject and they
 * could not afford to bring any. And Taunt cost eight gold — most of an early purse — so the
 * first decision of every run was "buy the cheap one", which is not a decision.
 */
describe('what a traveller sets out with', () => {
  it('starts level with the middle seats rather than beneath them', () => {
    expect(MANA_START).toBe(3);
    expect(campaignBudget(loadRun())).toBe(3);
    for (const seat of ['rolain', 'wit', 'armored', 'ardax'] as const) {
      expect(MANA_START, `${seat} must not out-spend a traveller from the first move`).toBe(
        HOUSE[seat].mana,
      );
    }
  });

  it('still leaves the teaching seats beneath the traveller, which is what they are for', () => {
    expect(HOUSE.drunkard.mana).toBeLessThan(MANA_START);
    expect(HOUSE.innkeeper.mana).toBeLessThan(MANA_START);
  });

  it('sits back down on the full three after a lost run, not on one', () => {
    const walked = winSeat(loadRun(), 'drunkard');
    expect(loseRun(walked).mana).toBe(3);
  });
});

describe('the Innkeeper teaching Taunt', () => {
  it('hands it over the first time he falls', () => {
    const before = loadRun();
    expect(before.taught).not.toContain('taunt');
    expect(winSeat(before, 'innkeeper').taught).toContain('taunt');
  });

  it('teaches nothing the second time, and never a duplicate', () => {
    const once = winSeat(loadRun(), 'innkeeper');
    const twice = winSeat({ ...once, progress: [] }, 'innkeeper');
    expect(twice.taught.filter((e) => e === 'taunt')).toHaveLength(1);
  });

  it('is his gift alone — no other seat teaches it', () => {
    for (const seat of ['drunkard', 'rolain', 'wit', 'armored'] as const) {
      expect(winSeat(loadRun(), seat).taught, seat).not.toContain('taunt');
    }
  });

  it('survives the walk back, because the book is what crosses between runs', () => {
    const taught = winSeat(loadRun(), 'innkeeper');
    expect(loseRun(taught).taught).toContain('taunt');
  });
});
