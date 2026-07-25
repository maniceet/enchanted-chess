import { findKing, opposite, piecesOf, relativeRank } from './board';
import { inCheck, isAttacked, promotionRankOf } from './movegen';
import type { Color, GameState, PieceType, PowerAction, PowerArgs, PowerName } from './types';

/** Reserve cost of reviving a piece = its face value (spec §2.4). Rook and queen are
 *  unaffordable inside a 4-point budget and are filtered out automatically. */
export const REVIVE_COST: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, d: 7, a: 4, k: 0 };

const inOwnHalf = (color: Color, square: number): boolean => relativeRank(color, square) <= 4;

/** Whether a pawn still has a game to play from this square: strictly short of the rank it
 *  crowns on. Herald crowns on the seventh, so a Herald pawn is barred from the seventh and
 *  the eighth alike. */
function pawnMayLand(piece: { color: Color; ench: unknown }, to: number): boolean {
  const promoRelative = relativeRank(
    piece.color,
    promotionRankOf(piece as Parameters<typeof promotionRankOf>[0]) * 8,
  );
  return relativeRank(piece.color, to) < promoRelative;
}

/** Squares that are empty and not attacked by the enemy — the landing zone shared by
 *  Teleport and Revive. Pinned enemy pieces still attack, and because the enemy King attacks
 *  all 8 adjacent squares, nothing can ever land next to it. */
function safeEmptySquares(state: GameState, color: Color): number[] {
  const enemy = opposite(color);
  const out: number[] = [];
  for (let s = 0; s < 64; s++) {
    if (state.board[s]) continue;
    if (isAttacked(state.board, s, enemy)) continue;
    out.push(s);
  }
  return out;
}

/** Would lifting the piece on `from` off the board leave our own King attacked? Placing a
 *  piece elsewhere can never expose your own King, so origin is the only thing that matters. */
function removalExposesKing(state: GameState, color: Color, from: number): boolean {
  const board = state.board.slice() as (typeof state.board)[number][];
  const piece = board[from];
  board[from] = null;
  const king = piece && piece.type === 'k' ? -1 : findKing({ ...state, board }, color);
  if (king < 0) return false;
  return isAttacked(board, king, opposite(color));
}

/** Every King-power activation legally available to `color` right now.
 *  Global restriction: a power may never be activated while your King is in check (§2.4). */
/** Destined Death is the one power that is not spent by being used. Every other King speaks
 *  once a game; the Dark Lord keeps speaking. */
export const REPEATABLE: ReadonlySet<PowerName> = new Set<PowerName>(['doom']);

export function powerActions(state: GameState, color: Color = state.turn): PowerAction[] {
  const ps = state.powers[color];
  if ((ps.used && !REPEATABLE.has(ps.power)) || inCheck(state, color)) return [];
  const out: PowerAction[] = [];

  switch (ps.power) {
    case 'teleport': {
      const landing = safeEmptySquares(state, color);
      const enemyKing = findKing(state, opposite(color));
      for (const { square: from, piece } of piecesOf(state, color)) {
        if (removalExposesKing(state, color, from)) continue;
        for (const to of landing) {
          // A pawn may not be set down on the rank it would have crowned on, or past it.
          // Teleport is a move, not a promotion: a pawn that arrives there never crowns, and
          // a pawn on its last rank has no forward move and no capture, so it is dead wood for
          // the rest of the game. Letting it crown instead would be worse — a pawn teleported
          // from the second rank to the eighth would be a free queen, and no other power comes
          // close to that. So the square is simply not offered.
          if (piece.type === 'p' && !pawnMayLand(piece, to)) continue;
          // Teleport may never deliver check: it moves a piece without the opponent having
          // seen it coming across the board, so it is barred from ending on a checking square.
          if (enemyKing >= 0) {
            const board = state.board.slice() as (typeof state.board)[number][];
            board[from] = null;
            board[to] = piece;
            if (isAttacked(board, enemyKing, color)) continue;
          }
          out.push({ type: 'power', power: 'teleport', args: { kind: 'teleport', from, to } });
        }
      }
      break;
    }
    case 'relocate': {
      const king = findKing(state, color);
      if (king < 0) break;
      const board = state.board;
      const enemyKing = findKing(state, opposite(color));
      for (const { square, piece } of piecesOf(state, color)) {
        if (piece.type === 'k' || !inOwnHalf(color, square)) continue;
        const swapped = board.slice() as (typeof board)[number][];
        swapped[square] = board[king];
        swapped[king] = piece;
        if (isAttacked(swapped, square, opposite(color))) continue;
        // Like Teleport, a swap may not arrive giving check.
        if (enemyKing >= 0 && isAttacked(swapped, enemyKing, color)) continue;
        out.push({ type: 'power', power: 'relocate', args: { kind: 'relocate', with: square } });
      }
      break;
    }
    case 'decree': {
      for (const { square, piece } of piecesOf(state, opposite(color))) {
        if (piece.type === 'k') continue; // Decree cannot target the King (§2.4a).
        out.push({ type: 'power', power: 'decree', args: { kind: 'decree', target: square } });
      }
      break;
    }
    case 'doom': {
      // Destined Death. The King is immune, exactly as he is to Decree and to every other
      // enchantment (§2.4a) — the Dark Lord may unmake an army but not a crown. A piece
      // already marked is not offered again: a second mark on the same man buys nothing.
      for (const { square, piece } of piecesOf(state, opposite(color))) {
        if (piece.type === 'k') continue;
        if (state.doomed.some((d) => d.pieceId === piece.id)) continue;
        out.push({ type: 'power', power: 'doom', args: { kind: 'doom', target: square } });
      }
      break;
    }
    case 'chrono': {
      // Only meaningful with a clock running; untimed games leave the button dead.
      if (state.clock) out.push({ type: 'power', power: 'chrono', args: { kind: 'chrono' } });
      break;
    }
    case 'revive': {
      const affordable = [...new Set(state.graveyard[color])].filter(
        (t) => t !== 'k' && REVIVE_COST[t] <= ps.reserve,
      );
      if (!affordable.length) break;
      const landing = safeEmptySquares(state, color).filter((s) => inOwnHalf(color, s));
      const enemyKing = findKing(state, opposite(color));
      for (const piece of affordable) {
        for (const to of landing) {
          // A piece may not arrive giving check, the same rule Teleport and Relocate obey.
          if (enemyKing >= 0) {
            const board = state.board.slice() as (typeof state.board)[number][];
            board[to] = {
              id: -1,
              color,
              type: piece,
              ench: null,
              shieldBroken: false,
              moved: true,
            };
            if (isAttacked(board, enemyKing, color)) continue;
          }
          out.push({ type: 'power', power: 'revive', args: { kind: 'revive', piece, to } });
        }
      }
      break;
    }
  }
  return out;
}

/** Why a power button is unusable, for the UI (spec §4: greyed with reason). */
/** Why a power button is unusable, for the UI (spec §4: greyed with reason). */
export function powerUnavailableReason(state: GameState, color: Color): string | null {
  const ps = state.powers[color];
  if (ps.used && !REPEATABLE.has(ps.power)) return 'used';
  if (state.turn !== color) return 'not your turn';
  if (inCheck(state, color)) return 'in check';
  if (!powerActions(state, color).length) {
    if (ps.power === 'revive') return 'no affordable piece';
    if (ps.power === 'chrono') return 'no clock';
    if (ps.power === 'doom') return 'nothing left to mark';
    return 'no legal target';
  }
  return null;
}

export function samePowerArgs(a: PowerArgs, b: PowerArgs): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'teleport':
      return b.kind === 'teleport' && a.from === b.from && a.to === b.to;
    case 'relocate':
      return b.kind === 'relocate' && a.with === b.with;
    case 'decree':
      return b.kind === 'decree' && a.target === b.target;
    case 'revive':
      return b.kind === 'revive' && a.piece === b.piece && a.to === b.to;
    case 'doom':
      return b.kind === 'doom' && a.target === b.target;
    case 'chrono':
      return b.kind === 'chrono';
  }
}
