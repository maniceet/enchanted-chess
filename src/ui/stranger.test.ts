import { describe, expect, it } from 'vitest';
import { BUDGET } from '../engine/loadout';
import { strangerReset } from './stranger';

/* Reproduces a bug found in a live two-tab match: after a campaign duel, the online builder
 * offered White 3 points and Black 4, because the road's mana was still sitting on the shared
 * `setup` object and only the online path skips the code that clears it. An unfair board is
 * about the worst thing a matchmaker can hand two strangers, so it gets a test. */
describe('a match against a stranger inherits nothing from the road', () => {
  it('gives both captains the flat budget, whatever the run had reached', () => {
    expect(strangerReset('w').budget).toBe(BUDGET);
    expect(strangerReset('b').budget).toBe(BUDGET);
  });

  it('drops the lent dragon, the silent King, the dragons and the trials', () => {
    const reset = strangerReset('w');
    expect(reset.boon).toBe(false);
    expect(reset.silentKing).toBe(false);
    expect(reset.dragons).toBe(0);
    expect(reset.trials).toEqual([]);
  });

  it('starts both armies bare rather than reusing the last game', () => {
    // The live match that found this opened with the Innkeeper's own army — Outpost b7,
    // Taunt f7, Taunt h7 — sitting on the human Black player, carried straight off the
    // campaign board by the shared `setup` object.
    const reset = strangerReset('w');
    expect(reset.white.enchantments).toEqual({});
    expect(reset.black.enchantments).toEqual({});
  });

  it('takes its colour from the server, not from the Second Chair trial', () => {
    expect(strangerReset('b').player).toBe('b');
    expect(strangerReset('w').player).toBe('w');
    // Before the server has said, build as White rather than crashing.
    expect(strangerReset(null).player).toBe('w');
    expect(strangerReset(undefined).player).toBe('w');
  });
});
