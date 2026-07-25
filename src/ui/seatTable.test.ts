import { describe, expect, it } from 'vitest';
import { forgetSeatTable, withSeatTable } from './seatTable';
import { HOUSE } from '../engine/ai';

/** The table has to survive between moves and must not be shared across seats that score
 *  positions differently. Both halves matter: the first is why it exists, the second is why it
 *  cannot simply be a global. */
describe('seat transposition table', () => {
  it('hands the same table back for the same seat', () => {
    forgetSeatTable();
    const seat = { depth: HOUSE.wit.depth, sample: HOUSE.wit.sample, maxNodes: HOUSE.wit.maxNodes };
    const first = withSeatTable(seat).table;
    const second = withSeatTable(seat).table;
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it('starts a fresh table when the seat changes', () => {
    forgetSeatTable();
    const wit = withSeatTable({ depth: HOUSE.wit.depth, sample: HOUSE.wit.sample }).table;
    const inn = withSeatTable({ depth: HOUSE.innkeeper.depth, sample: HOUSE.innkeeper.sample }).table;
    // The teaching seats score with `positional` and the deep ones with `evaluate`; a score
    // cached by one would be a lie to the other, and the hash cannot tell them apart.
    expect(inn).not.toBe(wit);
  });

  it('leaves everything else about the options alone', () => {
    forgetSeatTable();
    const options = { depth: 8, sample: 40, maxNodes: 1234, budgetMs: 999 };
    const out = withSeatTable(options);
    expect(out.depth).toBe(8);
    expect(out.sample).toBe(40);
    expect(out.maxNodes).toBe(1234);
    expect(out.budgetMs).toBe(999);
  });
});
