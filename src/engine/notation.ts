import { fileOf, rankOf, squareName } from './board';
import { makeMove } from './apply';
import { inCheck, legalMoves } from './movegen';
import type { Action, GameState, MoveAction } from './types';

const LETTER: Record<string, string> = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', d: 'D', k: 'K' };

/** Standard algebraic notation, extended per spec §4 with ⚡ (power) and ⊘ (shield-break). */
export function toSan(state: GameState, action: Action): string {
  if (action.type === 'resign') return 'resign';
  if (action.type === 'drawOffer') return '(=)';
  if (action.type === 'drawAccept') return '½-½';
  if (action.type === 'shieldBreak') {
    return `⊘${squareName(action.target)}`;
  }
  if (action.type === 'power') {
    const a = action.args;
    const where =
      a.kind === 'teleport'
        ? `${squareName(a.from)}→${squareName(a.to)}`
        : a.kind === 'relocate'
          ? `↔${squareName(a.with)}`
          : a.kind === 'decree'
            ? squareName(a.target)
            : a.kind === 'revive'
              ? `${a.piece.toUpperCase()}@${squareName(a.to)}`
              : a.kind === 'doom'
                ? `†${squareName(a.target)}`
                : 'time';
    return `⚡${a.kind}(${where})`;
  }

  const move = action as MoveAction;
  const piece = state.board[move.from];
  if (!piece) return `${squareName(move.from)}${squareName(move.to)}`;
  const flags = move.flags ?? [];
  const after = makeMove(state, move);
  const suffix = inCheck(after, after.turn)
    ? legalMoves(after, after.turn).length === 0
      ? '#'
      : '+'
    : '';

  if (flags.includes('castleK')) return `O-O${suffix}`;
  if (flags.includes('castleQ')) return `O-O-O${suffix}`;

  const isCapture = state.board[move.to] != null || flags.includes('ep');
  const promo = move.promo ? `=${move.promo.toUpperCase()}` : '';

  if (piece.type === 'p') {
    const from = isCapture ? `${squareName(move.from)[0]}x` : '';
    return `${from}${squareName(move.to)}${promo}${suffix}`;
  }

  // Disambiguate against other same-type pieces that could reach the destination.
  const rivals = legalMoves(state, piece.color).filter((m) => {
    const other = state.board[m.from];
    return m.to === move.to && m.from !== move.from && other?.type === piece.type;
  });
  let disambig = '';
  if (rivals.length) {
    const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
    const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
    const name = squareName(move.from);
    disambig = !sameFile ? name[0] : !sameRank ? name[1] : name;
  }
  return `${LETTER[piece.type]}${disambig}${isCapture ? 'x' : ''}${squareName(move.to)}${suffix}`;
}
