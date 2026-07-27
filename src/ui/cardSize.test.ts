import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../engine/ai';
import {
  EPILOGUE,
  FREED,
  PROLOGUE,
  drawCard,
  kyraxCard,
  rolainCard,
  runOverCard,
  seatFallCard,
  STORY,
  type StoryCard,
} from './story';

/* A ceiling on story cards, set from what the game actually contains rather than from taste.
 *
 * The cards are read on a phone and the road keeps handing out more of them — repeat victories
 * gained three phases, the walk back gained lines that vary with the run — so prose here grows
 * in the direction nobody is watching. Measured across every card the game can produce, the
 * spread runs from about two hundred characters to 1469: the long end is the prologue, the
 * Wittex reveal and the Dragonlord's instalments, all of which have been that length since they
 * were written and are the payoffs rather than the furniture.
 *
 * So this is not a style rule and deliberately does not enforce one — a first draft of it used
 * 900 and flagged four beats that had been fine for weeks, which is a test encoding its
 * author's preferences and calling them defects. It is a runaway guard: nothing may quietly
 * grow half again as long as the longest thing the story has ever legitimately said. */
const LIMIT = 1600;

function everyCard(): Array<{ where: string; card: StoryCard }> {
  const out: Array<{ where: string; card: StoryCard }> = [];
  out.push({ where: 'prologue', card: PROLOGUE });
  out.push({ where: 'epilogue', card: EPILOGUE });
  out.push({ where: 'freed', card: FREED });
  for (const seat of [...CAMPAIGN, 'wittex'] as const) {
    out.push({ where: `${seat}.before`, card: STORY[seat].before });
    for (const times of [0, 1, 2, 9]) {
      for (const [name, mood] of [
        ['plain', {}],
        ['knowing', { knowsTruth: true }],
        ['after', { knowsTruth: true, freed: true }],
      ] as const) {
        out.push({ where: `${seat} x${times} ${name}`, card: seatFallCard(seat, times, mood) });
      }
    }
  }
  out.push({ where: 'rolain freed', card: rolainCard(2, { freed: true }) });
  out.push({ where: 'kyrax freed', card: kyraxCard(3, { freed: true }) });
  for (const reason of ['stalemate', 'fifty-move', 'threefold', 'material', 'agreement'] as const) {
    out.push({ where: `draw ${reason}`, card: drawCard(reason) });
  }
  for (const [reached, attempts] of [
    [0, 1],
    [6, 9],
  ]) {
    out.push({ where: `walk back ${reached}/${attempts}`, card: runOverCard(reached, 10, true, false, 1, attempts, 7) });
  }
  return out;
}

const weight = (card: StoryCard) => card.lines.join(' ').length + (card.lesson?.length ?? 0);

describe('story cards stay a beat, not a chapter', () => {
  it('lets no card grow past the longest beat the story legitimately has', () => {
    const heavy = everyCard()
      .filter(({ card }) => weight(card) > LIMIT)
      .map(({ where, card }) => `${where} — "${card.title}" at ${weight(card)} chars`);
    expect(heavy, 'these have grown past a beat').toEqual([]);
  });

  it('never hands over an empty one', () => {
    for (const { where, card } of everyCard()) {
      expect(card.lines.length, where).toBeGreaterThan(0);
      expect(card.title.length, where).toBeGreaterThan(0);
      expect(card.lines.every((l) => l.trim().length > 0), where).toBe(true);
    }
  });
});
