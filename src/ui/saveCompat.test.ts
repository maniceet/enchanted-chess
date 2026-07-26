import { beforeEach, describe, expect, it } from 'vitest';
import { hasUnreadableSave, loadRun, recoverSave, winSeat } from './run';

/* Shipping an update must never cost anyone their campaign.
 *
 * A run is the only thing in this app that cannot be earned back in an evening — the Sorcerer's
 * book, every seat ever beaten, the dragon Rolain lends once a lifetime — and it lives in a
 * browser's localStorage, read back by a build the player did not ask for and cannot roll back.
 * Two ways that goes wrong, and both are covered here: a save from an older build that no
 * longer matches the current shape, and a save that will not parse at all.
 *
 * `environment: 'node'`, so there is no localStorage to write through to. The stub below is the
 * whole point of this file rather than an inconvenience: these tests are *about* what is on
 * disk between two versions of the app, so the store has to be real enough to hold a value
 * written by a build that no longer exists.
 */

const KEY = 'enchanted-chess:run';
const SALVAGE = 'enchanted-chess:run.unreadable';

let store = new Map<string, string>();
beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

describe('a save written by an older build', () => {
  it('keeps everything it did know, and takes defaults for what it did not', () => {
    // Exactly what a save looked like before mana, dragons, relics or trials existed: no
    // version stamp, and most of today's fields simply absent.
    store.set(
      KEY,
      JSON.stringify({
        progress: ['drunkard', 'innkeeper'],
        active: true,
        gold: 7,
        taught: ['taunt'],
        keeper: true,
        attempts: 3,
        beaten: { drunkard: 2 },
      }),
    );

    const run = loadRun();
    expect(run.progress, 'the seats already beaten in this attempt').toEqual([
      'drunkard',
      'innkeeper',
    ]);
    expect(run.gold).toBe(7);
    expect(run.taught).toEqual(['taunt']);
    expect(run.keeper).toBe(true);
    expect(run.attempts).toBe(3);
    expect(run.beaten.drunkard).toBe(2);
    // Added after that save was written. A traveller who has been playing for weeks should not
    // sit down with an empty purse because the field is new.
    expect(run.mana, 'a new field arrives at its default, not at zero').toBeGreaterThan(0);
    expect(run.trials).toEqual([]);
    expect(run.relics).toEqual([]);
  });

  it('is stamped with a version the moment it is written back', () => {
    store.set(KEY, JSON.stringify({ progress: [], gold: 4, active: true }));
    winSeat(loadRun(), 'drunkard');
    const written = JSON.parse(store.get(KEY) as string) as { version?: number };
    // Without this, a future migration has nothing to branch on — it cannot tell a save written
    // last year from one written by the build that needs fixing up.
    expect(written.version).toBe(1);
  });
});

describe('a save written by this build', () => {
  it('is stamped even when there was no older save to migrate', () => {
    // The case the stamp actually exists for, and the first version of this test missed it:
    // `sanitize` spreads the raw save, so a *migrated* one carries its version through no
    // matter what `save` does, and the assertion above passes with the stamp deleted. A
    // traveller starting today has no raw save to carry anything, so this is the one that
    // fails if the write stops stamping.
    winSeat(loadRun(), 'drunkard');
    const written = JSON.parse(store.get(KEY) as string) as { version?: number };
    expect(written.version).toBe(1);
  });
});

describe('a save that will not parse', () => {
  it('is set aside rather than written over', () => {
    // A write cut short by a full quota, or a half-synced profile. The old code returned a
    // fresh run here and the next save overwrote the wreckage — turning "unreadable this once"
    // into "gone for good".
    store.set(KEY, '{"progress":["drunkard","inn');

    const run = loadRun();
    expect(run.progress, 'this session starts clean').toEqual([]);
    expect(hasUnreadableSave(), 'and the damaged save is still on disk').toBe(true);
    expect(store.get(SALVAGE)).toBe('{"progress":["drunkard","inn');
  });

  it('can be put back if it turns out to be readable after all', () => {
    store.set(SALVAGE, JSON.stringify({ progress: ['drunkard'], gold: 12, active: true }));
    const recovered = recoverSave();
    expect(recovered?.gold).toBe(12);
    expect(recovered?.progress).toEqual(['drunkard']);
    expect(hasUnreadableSave(), 'and it is no longer waiting').toBe(false);
    expect(loadRun().gold, 'it is the live save now').toBe(12);
  });

  it('says so plainly when the set-aside copy is unreadable too', () => {
    store.set(SALVAGE, 'not json');
    expect(recoverSave()).toBeNull();
  });

  it('reports nothing to recover when nothing was set aside', () => {
    expect(hasUnreadableSave()).toBe(false);
    expect(recoverSave()).toBeNull();
  });
});
