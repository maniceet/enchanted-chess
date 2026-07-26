import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN, FULL_ROAD, HOUSE, WITTEX_CLEARS_REQUIRED, searchOptionsFor } from '../engine/ai';
import { kyraxCard } from './story';
import { houseSays, type BanterMood, type Voice } from './banter';
import {
  MANA_CAP,
  MANA_START,
  SPELLBOOK,
  beginRun,
  campaignBudget,
  isOpen,
  offerSpoils,
  powerupEffect,
  takePowerup,
  loadRun,
  loseRun,
  lessonEarned,
  LESSON_GOLD,
  opensTheShop,
  clearsUntilTruth,
  hasTrial,
  TRIALS,
  toggleTrial,
  knowsTheTruth,
  nextSeat,
  purseFor,
  purseSoFar,
  roadFor,
  type RunState,
  resetRun,
  winSeat,
} from './run';

/** `run.ts` writes through to localStorage on every change, so each test starts from a clean
 *  slate rather than inheriting the last one's inn. */
beforeEach(() => {
  resetRun();
});

function seeded(seed: number): () => number {
  let s = (seed + 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** When the back room opens.
 *
 *  Beating the Innkeeper earns the right to it and does not open it. The road is one unbroken
 *  walk, and a shop you can duck into halfway along turns the walk into a series of errands —
 *  so the door opens when a walk *ends*, which for almost everyone is the first fall. */
describe('The Sorcerer opens on the walk back, not mid-walk', () => {
  it('stays shut while the attempt that beat the Innkeeper is still running', () => {
    const walking = winSeat(winSeat(loadRun(), 'drunkard'), 'innkeeper');
    expect(walking.keeper, 'the right is earned immediately').toBe(true);
    expect(walking.sorcerer, 'the room is not open mid-walk').toBe(false);
    expect(walking.active).toBe(true);
  });

  it('opens on the defeat that ends that attempt, and says so once', () => {
    const walking = winSeat(winSeat(loadRun(), 'drunkard'), 'innkeeper');
    expect(opensTheShop(walking), 'this is the defeat that opens it').toBe(true);

    const back = loseRun(walking);
    expect(back.sorcerer).toBe(true);
    // The card only announces it once: the next defeat is an ordinary one.
    expect(opensTheShop(back)).toBe(false);
    expect(loseRun(back).sorcerer).toBe(true);
  });

  it('never opens for someone who has not beaten the keeper', () => {
    const walking = winSeat(loadRun(), 'drunkard');
    expect(opensTheShop(walking)).toBe(false);
    expect(loseRun(walking).sorcerer).toBe(false);
  });

  it('opens for a traveller who clears the road without ever falling', () => {
    let run = loadRun();
    for (const who of ['drunkard', 'innkeeper', 'rolain', 'wit', 'armored', 'ardax', 'kyrax'] as const) {
      run = winSeat(run, who);
    }
    expect(run.sorcerer, 'a clean clear still ends an attempt').toBe(true);
    expect(run.active).toBe(false);
  });
});

/** A seat pays less every time you beat it: 4, 2, 1, 0 for the Drunken Knight.
 *
 *  Without this the cheapest way to fill a book is to beat the first chair and resign, over and
 *  over, which is neither a game nor a story. The incentive has to point up the road. */
describe('A beaten seat pays half as much next time', () => {
  it('halves the purse and floors it, down to nothing', () => {
    let run = loadRun();
    const paid: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = run.gold;
      run = winSeat(run, 'drunkard');
      paid.push(run.gold - before);
      run = loseRun(run); // clears `progress`, so the seat can be beaten again next walk
    }
    expect(paid).toEqual([4, 2, 1, 0, 0]);
  });

  it('decays each seat independently, so the road always pays more than the taps', () => {
    let run = loadRun();
    for (let i = 0; i < 3; i++) run = loseRun(winSeat(run, 'drunkard'));
    expect(purseFor(run, 'drunkard'), 'mined out').toBe(0);
    expect(purseFor(run, 'innkeeper'), 'never beaten, still full price').toBe(6);
    expect(purseFor(run, 'kyrax')).toBe(34);
  });

  it('reports what the walk actually paid, not what the seats are worth new', () => {
    // Beat the first two seats, fall, then do it again. The second walk is worth half.
    let run = loseRun(winSeat(winSeat(loadRun(), 'drunkard'), 'innkeeper'));
    expect(run.gold).toBe(10);

    run = winSeat(winSeat(beginRun(run), 'drunkard'), 'innkeeper');
    expect(purseSoFar(run), 'second walk pays 2 + 3').toBe(5);
    expect(run.gold).toBe(15);
  });

  it('starts each walk from zero', () => {
    const run = beginRun(loseRun(winSeat(loadRun(), 'drunkard')));
    expect(purseSoFar(run)).toBe(0);
  });
});

/** Mana: the campaign's own budget, and the reason to walk back up.
 *
 *  Two at the first table, eight at the last, and a duel between strangers is always four. The
 *  campaign starting *below* the duelling budget is the point — it is a story about someone who
 *  has nothing. */
describe('Mana', () => {
  it('starts at two and is capped at eight', () => {
    expect(campaignBudget(loadRun())).toBe(MANA_START);
    expect(MANA_START).toBeLessThan(4);

    let run = loadRun();
    for (let i = 0; i < 20; i++) run = takePowerup(run, 'whetstone');
    expect(campaignBudget(run)).toBe(MANA_CAP);
  });

  it('keeps offering mana at the cap, but says plainly that it is a gesture', () => {
    let run = loadRun();
    for (let i = 0; i < 20; i++) run = takePowerup(run, 'whetstone');
    expect(campaignBudget(run)).toBe(MANA_CAP);

    // Still on the table — an empty half of the table is worse than an honest consolation.
    expect(powerupEffect(run, 'mana')).toMatch(/symbolic/i);
    expect(powerupEffect(run, 'mana')).toMatch(/better than nothing/i);
    const before = run.gold;
    const after = takePowerup(run, 'mana');
    expect(after.mana, 'the meter does not move').toBe(MANA_CAP);
    expect(after.gold, 'but it is not nothing').toBeGreaterThan(before);
    expect(takePowerup(run, 'whetstone').gold).toBeGreaterThan(after.gold);
  });

  it('offers exactly two, never the same one twice, never two of a kind', () => {
    // Two from one family is not a choice, it is one reward at two sizes: a Whetstone beside a
    // Point of Mana is just the Whetstone, and a Hoard beside a Purse is just the Hoard.
    const kin: Record<string, string> = {
      purse: 'gold',
      hoard: 'gold',
      mana: 'mana',
      whetstone: 'mana',
      lesson: 'lesson',
      dragonblood: 'dragon',
    };
    for (const run of [loadRun(), takePowerup(loadRun(), 'dragonblood')]) {
      for (let seed = 0; seed < 80; seed++) {
        const spoils = offerSpoils(run, seeded(seed));
        expect(spoils.length, `seed ${seed}`).toBe(2);
        expect(new Set(spoils).size, `seed ${seed}: ${spoils.join(', ')}`).toBe(2);
        expect(new Set(spoils.map((s) => kin[s])).size, `seed ${seed}: ${spoils.join(', ')}`).toBe(2);
      }
    }
  });

  it('turns a free lesson into coin when there is nothing left to teach', () => {
    let run = loadRun();
    for (let i = 0; i < 8; i++) run = takePowerup(run, 'lesson', () => 0);
    expect(run.taught.length).toBe(SPELLBOOK.length);
    const before = run.gold;
    expect(takePowerup(run, 'lesson').gold).toBe(before + 20);
  });

  it('caps Dragonblood at the two knights that exist', () => {
    let run = loadRun();
    for (let i = 0; i < 5; i++) run = takePowerup(run, 'dragonblood');
    expect(run.dragons).toBe(2);
    expect(offerSpoils(run, seeded(3))).not.toContain('dragonblood');
  });
});

/** A seat you have beaten is behind you. */
describe('The ladder does not let you sit down twice', () => {
  it('shuts the first chair once the drunk has fallen this walk', () => {
    const run = winSeat(beginRun(loadRun()), 'drunkard');
    // `slice(0, 0).every(...)` is vacuously true, so the first seat used to stay open forever.
    expect(isOpen(run, 'drunkard')).toBe(false);
    expect(isOpen(run, 'innkeeper'), 'and the next one is now open').toBe(true);
  });

  it('opens it again on the next walk', () => {
    const run = beginRun(loseRun(winSeat(beginRun(loadRun()), 'drunkard')));
    expect(isOpen(run, 'drunkard')).toBe(true);
  });
});

/** The eighth seat.
 *
 *  Kyrax is under the same working he is resisting, and its terms are that he may not name the
 *  man who cast it until he has been beaten often enough that the telling is a fact rather than
 *  a plea. Five times. A player who beats him once and walks away never learns any of it, which
 *  is precisely what the spell was for. */
describe('Dark Lord Wittex', () => {
  const beatKyraxTimes = (n: number): RunState => {
    let run = loadRun();
    for (let i = 0; i < n; i++) run = beginRun(winSeat(run, 'kyrax'));
    return run;
  };

  it('is not on the road, or reachable, before the Dragonlord has fallen five times', () => {
    for (let times = 0; times < WITTEX_CLEARS_REQUIRED; times++) {
      const run = beatKyraxTimes(times);
      expect(roadFor(run), `after ${times}`).not.toContain('wittex');
      expect(knowsTheTruth(run)).toBe(false);
      expect(clearsUntilTruth(run)).toBe(WITTEX_CLEARS_REQUIRED - times);
      // Even asked for directly, the seat is shut.
      expect(isOpen(run, 'wittex')).toBe(false);
    }
  });

  it('joins the road on the fifth, and stays', () => {
    const run = beatKyraxTimes(WITTEX_CLEARS_REQUIRED);
    expect(knowsTheTruth(run)).toBe(true);
    expect(clearsUntilTruth(run)).toBe(0);
    expect(roadFor(run)).toContain('wittex');
    expect(roadFor(run)).toHaveLength(CAMPAIGN.length + 1);
    expect(nextSeat(beginRun(run))).toBe('drunkard');
  });

  it('moves the end of the walk from Kyrax to Wittex', () => {
    // Before the truth, beating the Dragonlord ends the attempt.
    const naive = winSeat(loadRun(), 'kyrax');
    expect(naive.active, 'the walk is over at the Dragonlord').toBe(false);

    // After it, there is one more chair, so the walk goes on.
    const knowing = winSeat(beginRun(beatKyraxTimes(WITTEX_CLEARS_REQUIRED)), 'kyrax');
    expect(knowing.active, 'the road does not end there any more').toBe(true);
    expect(winSeat(knowing, 'wittex').active).toBe(false);
  });

  it('gives the Dragonlord something new to say on each of the five', () => {
    const said = new Set<string>();
    for (let before = 0; before < WITTEX_CLEARS_REQUIRED; before++) {
      said.add(kyraxCard(before).lines.join(' '));
    }
    expect(said.size, 'five defeats, five different tellings').toBe(WITTEX_CLEARS_REQUIRED);
    // Only the last one names him, and only the last one hands over the lesson.
    expect(kyraxCard(WITTEX_CLEARS_REQUIRED - 1).lines.join(' ')).toContain('Wittex');
    expect(kyraxCard(0).lines.join(' ')).not.toContain('Wittex');
    expect(kyraxCard(WITTEX_CLEARS_REQUIRED - 1).lesson).toBeDefined();
    expect(kyraxCard(0).lesson).toBeUndefined();
  });
});

/** The keeper's cruelties, offered only once the story is finished. */
describe('Trials', () => {
  it('are not on offer until Wittex has fallen', () => {
    let run = winSeat(loadRun(), 'kyrax');
    expect(run.freed).toBe(false);
    run = winSeat(beginRun(run), 'wittex');
    expect(run.freed, 'the spell is lifted').toBe(true);
  });

  it('toggle on and off, and stack', () => {
    let run = loadRun();
    expect(hasTrial(run, 'black')).toBe(false);
    run = toggleTrial(run, 'black');
    run = toggleTrial(run, 'deadly');
    expect(run.trials).toHaveLength(2);
    expect(hasTrial(run, 'deadly')).toBe(true);
    run = toggleTrial(run, 'black');
    expect(run.trials).toEqual(['deadly']);
  });

  it('start switched off, and only ever hold real trials', () => {
    // Not asserted through `loadRun`: `run.ts` wraps localStorage in try/catch and vitest's
    // shim does not persist, so a round-trip here would be testing the harness rather than the
    // code. The pure transitions are the thing worth pinning.
    expect(loadRun().trials).toEqual([]);
    const run = toggleTrial(toggleTrial(loadRun(), 'timed'), 'black');
    expect(run.trials.every((t) => TRIALS.includes(t))).toBe(true);
    expect(run.trials).toHaveLength(2);
  });
});

/** The Deadly Duel is "one notch above yourself", which has to mean something a ladder can
 *  actually keep: the next seat's node budget. Depth alone would change nothing, because the
 *  node cap reaches its limit first. */
describe('The Deadly Duel sharpens every seat', () => {
  it('gives each seat at least the next one’s search', () => {
    for (let i = 0; i < FULL_ROAD.length - 1; i++) {
      const seat = HOUSE[FULL_ROAD[i]];
      const above = HOUSE[FULL_ROAD[i + 1]];
      const deadly = searchOptionsFor(seat, true);
      expect(deadly.maxNodes ?? 0, FULL_ROAD[i]).toBeGreaterThanOrEqual(above.maxNodes ?? 0);
      expect(deadly.maxNodes ?? 0, `${FULL_ROAD[i]} must not get weaker`).toBeGreaterThanOrEqual(
        seat.maxNodes ?? 0,
      );
    }
  });

  it('has something for the last seat too, which has nothing above it', () => {
    const last = HOUSE[FULL_ROAD[FULL_ROAD.length - 1]];
    const deadly = searchOptionsFor(last, true);
    expect(deadly.maxNodes ?? 0).toBeGreaterThan(last.maxNodes ?? 0);
  });

  it('changes nothing at all when it is switched off', () => {
    for (const who of FULL_ROAD) {
      expect(searchOptionsFor(HOUSE[who], false)).toEqual(searchOptionsFor(HOUSE[who]));
    }
  });
});

/** What the Deadly Duel actually does, as opposed to what it was written to do.
 *
 *  Both of these were measured wrong before they were fixed. The drunk came back 6-0-0 with the
 *  Duel switched on — exactly his ordinary result — because `chooseAction` tests `random` before
 *  it reads any other option, so every sharpening was silently discarded. And raising a shallow
 *  seat's node cap is inert: Rolain finishes her nominal depth 3 long before ten thousand nodes,
 *  let alone two hundred thousand, so the ceiling has to move too. */
describe('The Deadly Duel actually sharpens every seat', () => {
  it('makes the drunk look at the board', () => {
    expect(searchOptionsFor(HOUSE.drunkard).random, 'ordinarily he reaches at random').toBe(true);
    expect(searchOptionsFor(HOUSE.drunkard, true).random, 'under the Duel he searches').toBe(false);
  });

  it('raises depth as well as nodes, so the bump is not inert for the shallow seats', () => {
    for (let i = 0; i < FULL_ROAD.length - 1; i++) {
      const seat = HOUSE[FULL_ROAD[i]];
      const above = HOUSE[FULL_ROAD[i + 1]];
      const deadly = searchOptionsFor(seat, true);
      expect(deadly.depth ?? 0, FULL_ROAD[i]).toBeGreaterThanOrEqual(above.depth);
      expect(deadly.depth ?? 0, `${FULL_ROAD[i]} must not get shallower`).toBeGreaterThanOrEqual(
        seat.depth,
      );
    }
  });

  it('leaves the last seat with something, having nothing above it', () => {
    const last = HOUSE[FULL_ROAD[FULL_ROAD.length - 1]];
    const deadly = searchOptionsFor(last, true);
    expect(deadly.depth ?? 0).toBeGreaterThan(last.depth);
    expect(deadly.maxNodes ?? 0).toBeGreaterThan(last.maxNodes ?? 0);
  });
});

/** The clues planted before the reveal.
 *
 *  Every one has to work twice: as ordinary needling on a first hearing, and as an account of
 *  something that actually happened once the player knows what Wittex is. None of them may name
 *  him, or the road tells its own ending in the first hour. */
describe('Foreshadowing', () => {
  const pool = (voice: Voice, mood: BanterMood) => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(houseSays(voice, mood, Math.random));
    return [...seen];
  };

  it('never names Wittex before he is met', () => {
    const voices: Voice[] = ['drunkard', 'rolain', 'wit', 'armored', 'ardax', 'kyrax'];
    const moods: BanterMood[] = ['greeting', 'move', 'win', 'lose', 'draw'];
    for (const voice of voices) {
      for (const mood of moods) {
        for (const line of pool(voice, mood)) {
          expect(line, `${voice}/${mood}`).not.toMatch(/wittex|shivlar/i);
        }
      }
    }
  });

  it('has the Wit give himself away when he loses, and only then', () => {
    const beaten = pool('wit', 'lose').join(' ');
    // He compares you to somebody he has already played, without ever saying who.
    expect(beaten).toMatch(/could not/i);
    expect(beaten).toMatch(/guard/i);
    // And he is not actually playing for the game in front of him.
    expect(beaten).toMatch(/win in the end/i);
  });

  it('lets Rolain surface, rarely, and only when she has just been beaten', () => {
    // Never when she wins: she has a script for winning.
    expect(pool('rolain', 'win').join(' ')).not.toMatch(/honourable|save him/i);
    const beaten = pool('rolain', 'lose').join(' ');
    expect(beaten).toMatch(/honourable/i);
    expect(beaten).toMatch(/save him/i);
  });

  it('leaves the memory hole in the mouth of the man nobody listens to', () => {
    expect(pool('drunkard', 'lose').join(' ')).toMatch(/Before what/i);
  });
});

/* The road used to hand back nothing at all when a run ended in a loss. Everything earned on
 * the way was already banked, so an attempt was never wasted — but there was no moment of being
 * paid for it, which is what makes losing feel like time spent rather than progress. */
describe('the lesson: what a defeat is worth', () => {
  it('pays gold for falling further than ever before', () => {
    // Gold rather than mana, because mana does not cross between runs any more. A defeat has to
    // hand back the currency that does, or it hands back nothing.
    const fresh = { ...loadRun(), gold: 0, best: 1, progress: ['drunkard', 'innkeeper'] } as RunState;
    expect(lessonEarned(fresh)).toBe(LESSON_GOLD);
    expect(loseRun(fresh).gold).toBe(LESSON_GOLD);
  });

  it('pays nothing for ground already covered, so it cannot be farmed', () => {
    // The whole point of tying this to `best` rather than to the seat you died at: losing to
    // the Drunken Knight forty times must not be a faucet.
    const again = { ...loadRun(), gold: 7, best: 4, progress: ['drunkard'] } as RunState;
    expect(lessonEarned(again)).toBe(0);
    expect(loseRun(again).gold).toBe(7);
  });

  it('raises `best` on a defeat, so the same ground never pays twice', () => {
    const first = { ...loadRun(), mana: 2, best: 1, progress: ['drunkard', 'innkeeper'] } as RunState;
    const after = loseRun(first);
    expect(after.best).toBe(2);
    expect(lessonEarned({ ...after, progress: ['drunkard', 'innkeeper'] } as RunState)).toBe(0);
  });

  it('strips the walk back to nothing, which is what makes this a roguelike', () => {
    // Mana, dragons, archbishops and the road's gifts are all *this run's* strength. What
    // crosses over is gold and what gold has already taught you.
    const rich = {
      ...loadRun(),
      mana: 9,
      dragons: 2,
      archbishops: 1,
      venom: ['c'],
      fortifiedRooks: 2,
      doomCall: true,
      gold: 40,
      taught: ['taunt'],
      best: 9,
      progress: ['drunkard'],
    } as RunState;
    const after = loseRun(rich);
    expect(after.mana).toBe(MANA_START);
    expect(after.dragons).toBe(0);
    expect(after.archbishops).toBe(0);
    expect(after.venom).toEqual([]);
    expect(after.fortifiedRooks).toBe(0);
    expect(after.doomCall).toBe(false);
    expect(after.gold, 'gold survives').toBe(40);
    expect(after.taught, 'and so does the book').toEqual(['taunt']);
  });
});

function worthOfferingVenom(state: RunState): boolean {
  return offerSpoils(state, () => 0, 9).includes('venom');
}

/* Found in play: Venom vanished after a loss (correct — the walk's gifts do not survive it) but
 * it had also been landing on a different pawn every board *within* a run, which is not. A gift
 * you have to build around must stay where it was put. */
describe('Venom picks a pawn once and keeps it', () => {
  it('records a file when taken, not a count', () => {
    const after = takePowerup({ ...loadRun(), venom: [] } as RunState, 'venom', seeded(3));
    expect(after.venom).toHaveLength(1);
    expect('abcdefgh').toContain(after.venom[0]);
  });

  it('never poisons the same file twice, and stops at four of the eight', () => {
    let run = { ...loadRun(), venom: [] } as RunState;
    for (let i = 0; i < 4; i++) run = takePowerup(run, 'venom', seeded(i + 1));
    expect(new Set(run.venom).size, 'four distinct files').toBe(4);
    expect(worthOfferingVenom(run), 'and the road stops offering it').toBe(false);
  });

  it('is gone after a defeat, which is the part that was already right', () => {
    const walked = { ...loadRun(), venom: ['c', 'f'], best: 9, progress: ['drunkard'] } as RunState;
    expect(loseRun(walked).venom).toEqual([]);
  });
});
