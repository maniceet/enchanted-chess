import {
  FILES,
  initialState,
  makePiece,
  parseSquare,
  positionKey,
  sq,
  squareName,
} from './board';
import type { Color, GameState, Piece, PieceType } from './types';

/** Parses standard FEN into engine state (no enchantments — used for perft fixtures and
 *  the scenario loader's vanilla positions). Castling letters map onto rook files, and
 *  Shredder-FEN file letters (e.g. "HAha") are accepted for 960 positions. */
export function parseFen(fen: string): GameState {
  const [placement, turn, castle, ep, half = '0', full = '1'] = fen.trim().split(/\s+/);
  const base = initialState();
  const board: (Piece | null)[] = Array(64).fill(null);

  let id = 1;
  const rows = placement.split('/');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
      board[sq(file, rank)] = makePiece(id++, color, ch.toLowerCase() as PieceType);
      file++;
    }
  });

  const kingFileOf = (color: Color): number => {
    for (let f = 0; f < 8; f++) {
      const p = board[sq(f, color === 'w' ? 0 : 7)];
      if (p && p.type === 'k' && p.color === color) return f;
    }
    return 4;
  };
  const rightsFor = (color: Color): { kingRookFile: number | null; queenRookFile: number | null } => {
    const kf = kingFileOf(color);
    let kingRookFile: number | null = null;
    let queenRookFile: number | null = null;
    for (const ch of castle === '-' ? '' : castle) {
      const chColor: Color = ch === ch.toUpperCase() ? 'w' : 'b';
      if (chColor !== color) continue;
      const lower = ch.toLowerCase();
      if (lower === 'k') kingRookFile = 7;
      else if (lower === 'q') queenRookFile = 0;
      else {
        const f = FILES.indexOf(lower);
        if (f >= 0) {
          if (f > kf) kingRookFile = f;
          else queenRookFile = f;
        }
      }
    }
    return { kingRookFile, queenRookFile };
  };

  // Pieces that are not on their home square must count as moved.
  const marked = board.map((p, i) => {
    if (!p) return p;
    const home = p.color === 'w' ? [0, 1] : [7, 6];
    const onHome = p.type === 'p' ? i >> 3 === home[1] : i >> 3 === home[0];
    return onHome ? p : { ...p, moved: true };
  });

  const parsed: GameState = {
    ...base,
    board: marked,
    turn: (turn as Color) ?? 'w',
    castling: { w: rightsFor('w'), b: rightsFor('b') },
    kingStartFile: kingFileOf('w'),
    ep: ep && ep !== '-' ? parseSquare(ep) : null,
    halfmove: Number(half),
    fullmove: Number(full),
    nextPieceId: id,
    repetition: {},
  };
  return { ...parsed, repetition: { [positionKey(parsed)]: 1 } };
}

export function toFen(state: GameState): string {
  let placement = '';
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = state.board[sq(file, rank)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) {
        placement += empty;
        empty = 0;
      }
      placement += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    if (empty) placement += empty;
    if (rank > 0) placement += '/';
  }
  const c = state.castling;
  const letters =
    [
      c.w.kingRookFile !== null ? 'K' : '',
      c.w.queenRookFile !== null ? 'Q' : '',
      c.b.kingRookFile !== null ? 'k' : '',
      c.b.queenRookFile !== null ? 'q' : '',
    ].join('') || '-';
  return [
    placement,
    state.turn,
    letters,
    state.ep === null ? '-' : squareName(state.ep),
    state.halfmove,
    state.fullmove,
  ].join(' ');
}

/** Full lossless state serialization, including enchantments — the localStorage and
 *  export/import format (spec §3.1). */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const state = JSON.parse(json) as GameState;
  // A state written before Destined Death existed has no `doomed` list, and every turn walks
  // it. Defaulting here keeps old exports and old saved games loadable, which is the whole
  // point of the scenario loader.
  return state.doomed ? state : { ...state, doomed: [] };
}
