import { describe, expect, it } from 'vitest';
import { WITTEX_CLEARS_REQUIRED } from '../engine/ai';
import { kyraxCard } from './story';

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
