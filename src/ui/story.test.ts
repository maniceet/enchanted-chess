import { describe, expect, it } from 'vitest';
import { WITTEX_CLEARS_REQUIRED } from '../engine/ai';
import { kyraxCard, runOverCard, seatFallCard, STORY } from './story';

/* The Dragonlord tells the story in instalments, and the instalment count is load-bearing:
 * the reveal must land exactly on the clear that opens the eighth seat, and every clear after
 * it must stop re-announcing a name the player already has. Before this was pinned down the
 * card index was clamped, so a sixth win replayed "The Name" verbatim. */
describe('the Dragonlord tells it in instalments', () => {
  it('hints without naming, and asks for another game, until the last telling', () => {
    for (let beaten = 0; beaten < WITTEX_CLEARS_REQUIRED - 1; beaten += 1) {
      const card = kyraxCard(beaten);
      const text = card.lines.join(' ');
      expect(text).not.toContain('Wittex');
      // Every early card has to send the player back up the mountain, or the five-clear
      // reveal is a secret nobody is given a reason to dig for.
      expect(text.toLowerCase()).toMatch(/come back|once more|twice more|again/);
      expect(card.title).not.toBe('The Name');
    }
  });

  it('says the name on the clear that opens the eighth seat', () => {
    const card = kyraxCard(WITTEX_CLEARS_REQUIRED - 1);
    expect(card.title).toBe('The Name');
    expect(card.lines.join(' ')).toContain('Wittex');
    expect(card.lesson).toContain('Destined Death');
    expect(card.cta).toBe('South →');
  });

  it('stops re-revealing afterwards, and warns about Destined Death instead', () => {
    for (const beaten of [WITTEX_CLEARS_REQUIRED, WITTEX_CLEARS_REQUIRED + 3]) {
      const card = kyraxCard(beaten);
      expect(card.title).toBe('Not A Costume');
      const text = card.lines.join(' ');
      expect(text).toContain('Destined Death');
      // He is on your side and still trying to win: that contradiction is the whole beat.
      expect(text).toContain('working is still on me');
      expect(card.cta).toBeUndefined();
    }
  });
});


/* The cards after a result read the run, not just the result. A defeat screen that says the
 * same thing on the first fall and the ninth, or a seat that repeats its victory speech
 * verbatim forever, is a recording where a character should be. */
describe('a seat that falls again says something new', () => {
  it('gives the full story beat on first blood and a shorter return after', () => {
    const first = seatFallCard('wit', 0);
    expect(first).toEqual(STORY.wit.after);
    const second = seatFallCard('wit', 1);
    expect(second.title).not.toBe(first.title);
    expect(second.lines).not.toEqual(first.lines);
    // No lesson on a return: the teaching happened the first time.
    expect(second.lesson).toBeUndefined();
  });

  it('holds on the last telling rather than running out of things to say', () => {
    expect(seatFallCard('drunkard', 7)).toEqual(seatFallCard('drunkard', 40));
  });

  it('keeps the instalment tellers for the two seats that had them', () => {
    expect(seatFallCard('kyrax', 2)).toEqual(kyraxCard(2));
  });

  it('varies every seat on the road, not just the bosses', () => {
    for (const seat of ['drunkard', 'innkeeper', 'wit', 'armored', 'ardax', 'wittex'] as const) {
      const again = seatFallCard(seat, 1);
      expect(again.lines, seat).not.toEqual(STORY[seat].after.lines);
    }
  });
});

describe('the walk back reads the run count and the depth', () => {
  const lines = (c: { lines: string[] }) => c.lines.join(' ');

  it('a first fall gets the rules of the road; a ninth gets the shorthand', () => {
    const first = runOverCard(2, 10, false, false, 0, 1, 0);
    const ninth = runOverCard(2, 10, false, false, 0, 9, 2);
    expect(lines(first)).toContain('nobody warned you');
    expect(lines(ninth)).toContain('You know the speech by now');
    expect(lines(first)).not.toBe(lines(ninth));
  });

  it('falling short of your own deepest mark is noticed', () => {
    const short = runOverCard(1, 5, false, false, 0, 3, 5);
    expect(lines(short)).toContain('You have been further than this');
    // New ground (lesson > 0) is the opposite case and must never carry the regression line.
    const deeper = runOverCard(6, 30, false, false, 1, 3, 5);
    expect(lines(deeper)).not.toContain('You have been further than this');
  });

  it('losing to the first chair reads differently once it keeps happening', () => {
    const first = runOverCard(0, 0, false, false, 0, 1, 0);
    const later = runOverCard(0, 0, false, false, 0, 5, 3);
    expect(lines(first)).toContain('worse than laughing');
    expect(lines(later)).toContain('even the drunk gets an evening');
  });
});
