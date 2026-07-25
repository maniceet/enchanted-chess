import { describe, expect, it } from 'vitest';
import { initialState } from './board';
import { parseFen } from './fen';
import { perft } from './perft';

// Published perft numbers (chessprogramming.org). Zero enchantments anywhere, so this
// pins the vanilla-chess subset of the engine exactly (spec §7).
const POSITIONS: { name: string; fen?: string; counts: number[] }[] = [
  { name: 'start position', counts: [20, 400, 8902, 197281, 4865609] },
  {
    name: 'kiwipete',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862, 4085603],
  },
  {
    name: 'position 3 (endgame)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238, 674624],
  },
  {
    name: 'position 4 (promotions)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467, 422333],
  },
  {
    name: 'position 5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379, 2103487],
  },
];

describe('perft — vanilla chess', () => {
  for (const { name, fen, counts } of POSITIONS) {
    describe(name, () => {
      counts.forEach((expected, i) => {
        const depth = i + 1;
        it(`depth ${depth} = ${expected}`, { timeout: 120_000 }, () => {
          const state = fen ? parseFen(fen) : initialState();
          expect(perft(state, depth)).toBe(expected);
        });
      });
    });
  }
});

describe('perft — Chess960 representation', () => {
  // The classic layout expressed as a 960 position with Shredder-style castling files.
  // Castling is stored as rook origin files, so this must reproduce the standard counts.
  it('classic layout via file-based castling rights matches standard perft', () => {
    const state = parseFen(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1',
    );
    expect(perft(state, 1)).toBe(20);
    expect(perft(state, 2)).toBe(400);
    expect(perft(state, 3)).toBe(8902);
    expect(perft(state, 4)).toBe(197281);
  });
});
