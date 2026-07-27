import { describe, expect, it } from 'vitest';
import { random960Back } from './board';
import type { PieceType } from './types';

/* The three things that make a back rank a legal Chess960 rank.
 *
 * The generator gets them right by construction — bishops are placed on the two colour
 * complexes by index, and the last three empty squares take rook, king, rook in order, so the
 * king cannot help but stand between them. That is a good design and it is exactly why it needs
 * a test: the invariants live in the *arithmetic*, where they are invisible, and a refactor of
 * `emptyIdx` or of the `pick` bounds could keep every game playable while quietly producing
 * ranks that no 960 position ever has. Self-play would not notice; castling would, eventually,
 * and by then the position would be the last place anyone looked.
 *
 * Run over a deterministic sweep rather than once: a single draw proves nothing about a
 * generator, and a fixed sequence means a failure here reproduces exactly.
 */
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

describe('a Chess960 back rank', () => {
  const draws: PieceType[][] = [];
  const rand = seeded(20260727);
  for (let i = 0; i < 400; i++) draws.push(random960Back(rand));

  it('holds exactly the pieces a back rank holds', () => {
    for (const row of draws) {
      const count = (t: PieceType) => row.filter((p) => p === t).length;
      expect(row, row.join('')).toHaveLength(8);
      expect(count('r'), row.join('')).toBe(2);
      expect(count('n'), row.join('')).toBe(2);
      expect(count('b'), row.join('')).toBe(2);
      expect(count('q'), row.join('')).toBe(1);
      expect(count('k'), row.join('')).toBe(1);
    }
  });

  it('puts the bishops on opposite colours', () => {
    for (const row of draws) {
      const files = row.flatMap((p, f) => (p === 'b' ? [f] : []));
      expect(files, row.join('')).toHaveLength(2);
      expect(files[0] % 2, `both bishops on one colour: ${row.join('')}`).not.toBe(files[1] % 2);
    }
  });

  it('puts the king between the two rooks, which is what makes 960 castling possible at all', () => {
    for (const row of draws) {
      const king = row.indexOf('k');
      const rooks = row.flatMap((p, f) => (p === 'r' ? [f] : []));
      expect(rooks, row.join('')).toHaveLength(2);
      expect(king, `king outside its rooks: ${row.join('')}`).toBeGreaterThan(rooks[0]);
      expect(king, `king outside its rooks: ${row.join('')}`).toBeLessThan(rooks[1]);
    }
  });

  it('actually varies — a generator stuck on one rank would pass everything above', () => {
    expect(new Set(draws.map((r) => r.join(''))).size).toBeGreaterThan(100);
  });
});
