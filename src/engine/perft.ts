import { makeMove } from './apply';
import { legalMoves } from './movegen';
import type { GameState } from './types';

/** Node count of the legal-move tree to `depth`. The vanilla-chess subset of the engine is
 *  validated against published perft numbers (spec §3.1). */
export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(state, state.turn);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const m of moves) nodes += perft(makeMove(state, m), depth - 1);
  return nodes;
}

/** Per-root-move breakdown, for bisecting a perft mismatch. */
export function perftDivide(state: GameState, depth: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of legalMoves(state, state.turn)) {
    const key = `${m.from}-${m.to}${m.promo ?? ''}`;
    out[key] = perft(makeMove(state, m), depth - 1);
  }
  return out;
}
