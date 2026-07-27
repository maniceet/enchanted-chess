import { describe, expect, it } from 'vitest';
import { emptyLoadout } from '../engine/loadout';
import { powerTallies, sideOf, type GameRecord } from './stats';

/* Three words, everywhere three words are relevant.
 *
 * `Loadout.power` is a single field kept so saves written before Kings carried three still
 * deserialize, and it turned out that several places were still reading it as though it were
 * the whole answer: the reveal announced a King with three words as carrying one, the Ledger
 * counted the first and ignored the other two, and mirroring a standing loadout onto Black
 * dropped them entirely. Reported from play as "here also it doesn't show the three choices".
 */
const three = { ...emptyLoadout('teleport'), powers: ['teleport', 'relocate', 'decree'] as const };

describe('a King who knows three words is described as knowing three', () => {
  it('records every word a side carried, not just the first', () => {
    const side = sideOf(three, 0);
    expect(side.powers).toEqual(['teleport', 'relocate', 'decree']);
    expect(side.power, 'the old field still reads, for old records').toBe('teleport');
  });

  it('counts all three as picks at the bar', () => {
    const record = (): GameRecord => ({
      at: Date.now(),
      mode: 'classic',
      outcome: 'w',
      reason: 'checkmate',
      sides: { w: sideOf(three, 0), b: sideOf(emptyLoadout('revive'), 0) },
    });
    const names = powerTallies([record()]).map((t) => t.key).sort();
    expect(names).toEqual(['decree', 'relocate', 'revive', 'teleport']);
  });

  it('still reads a record written before Kings had three', () => {
    const old: GameRecord = {
      at: 0,
      mode: 'classic',
      outcome: 'draw',
      reason: 'agreement',
      sides: {
        w: { enchantments: [], power: 'chrono', reserve: 0 },
        b: { enchantments: [], power: 'doom', reserve: 0 },
      },
    };
    expect(powerTallies([old]).map((t) => t.key).sort()).toEqual(['chrono', 'doom']);
  });
});
