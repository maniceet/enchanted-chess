import type {
  CastleRights,
  ClockState,
  Color,
  GameState,
  Piece,
  PieceType,
  PowerName,
} from './types';

export const FILES = 'abcdefgh';

export const sq = (file: number, rank: number): number => rank * 8 + file;
export const fileOf = (s: number): number => s & 7;
export const rankOf = (s: number): number => s >> 3;
export const onBoard = (file: number, rank: number): boolean =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8;

export const squareName = (s: number): string => `${FILES[fileOf(s)]}${rankOf(s) + 1}`;
export const parseSquare = (name: string): number =>
  sq(FILES.indexOf(name[0]), Number(name[1]) - 1);

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Direction of forward movement for a colour, in ranks. */
export const forward = (c: Color): number => (c === 'w' ? 1 : -1);
/** Back rank (rank index) for a colour. */
export const homeRank = (c: Color): number => (c === 'w' ? 0 : 7);
/** Rank a pawn of this colour promotes on under standard rules. */
export const promoRank = (c: Color): number => (c === 'w' ? 7 : 0);
/** Rank index counted from the owner's side, 1-based (rank 1 = own back rank). */
export const relativeRank = (c: Color, s: number): number =>
  c === 'w' ? rankOf(s) + 1 : 8 - rankOf(s);
/** Your own half: ranks 1–4 counted from your side. Taunt, Relocate and Revive all use it. */
export const inOwnHalf = (c: Color, s: number): boolean => relativeRank(c, s) <= 4;

/** Where the Book of Immolation burns: the three squares in front of the carrier, straight
 *  ahead and both diagonals — which is to say exactly the squares that carrier could itself
 *  have moved to or taken on. That is the whole rule, and it makes the blast readable from the
 *  piece rather than memorised from a card.
 *
 *  It points at the enemy, so it goes off *into* their ground. The piece that took it stepped
 *  past the fire onto the square the carrier vacated, and survives standing in the crater —
 *  which is what separates this from Poison. Poison kills whoever touched it. Immolation
 *  clears the ground it was holding, and does not care whose men are on it. */
export function blastZone(c: Color, from: number): number[] {
  const rank = rankOf(from) + forward(c);
  if (rank < 0 || rank > 7) return [];
  const file = fileOf(from);
  const zone: number[] = [];
  for (const df of [-1, 0, 1]) {
    const f = file + df;
    if (f >= 0 && f <= 7) zone.push(sq(f, rank));
  }
  return zone;
}

export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, d: 7, a: 4, k: 0 };

export function makePiece(
  id: number,
  color: Color,
  type: PieceType,
  ench: Piece['ench'] = null,
): Piece {
  return { id, color, type, ench, shieldBroken: false, moved: false };
}

const EMPTY_CASTLE: CastleRights = { kingRookFile: null, queenRookFile: null };

/** Back-rank layout for the classic start, file a → h. */
const CLASSIC_BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** Fisher-random back rank: bishops on opposite colours, king between the rooks. */
export function random960Back(rand: () => number = Math.random): PieceType[] {
  const row: (PieceType | null)[] = Array(8).fill(null);
  const emptyIdx = (n: number): number => {
    let seen = -1;
    for (let i = 0; i < 8; i++) {
      if (row[i] === null && ++seen === n) return i;
    }
    throw new Error('no empty square');
  };
  const pick = (n: number): number => Math.floor(rand() * n);

  // Bishops: one on each colour complex.
  row[pick(4) * 2] = 'b';
  row[pick(4) * 2 + 1] = 'b';
  row[emptyIdx(pick(6))] = 'q';
  row[emptyIdx(pick(5))] = 'n';
  row[emptyIdx(pick(4))] = 'n';
  // Remaining three squares take r, k, r in order — king always between the rooks.
  row[emptyIdx(0)] = 'r';
  row[emptyIdx(0)] = 'k';
  row[emptyIdx(0)] = 'r';
  return row as PieceType[];
}

export interface StartOptions {
  readonly back?: PieceType[];
  readonly powers?: Record<Color, PowerName>;
  readonly reserve?: Record<Color, number>;
  readonly clock?: ClockState | null;
}

/** Positional key for threefold repetition: placement + side + castling + ep. */
export function positionKey(state: GameState): string {
  let placement = '';
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    placement += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.';
  }
  const c = state.castling;
  return [
    placement,
    state.turn,
    c.w.kingRookFile ?? '-',
    c.w.queenRookFile ?? '-',
    c.b.kingRookFile ?? '-',
    c.b.queenRookFile ?? '-',
    state.ep ?? '-',
  ].join('|');
}

export function initialState(opts: StartOptions = {}): GameState {
  const back = opts.back ?? CLASSIC_BACK;
  const board: (Piece | null)[] = Array(64).fill(null);
  let id = 1;
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = makePiece(id++, 'w', back[f]);
    board[sq(f, 1)] = makePiece(id++, 'w', 'p');
    board[sq(f, 6)] = makePiece(id++, 'b', 'p');
    board[sq(f, 7)] = makePiece(id++, 'b', back[f]);
  }
  const kingFile = back.indexOf('k');
  const rooks = back.flatMap((t, f) => (t === 'r' ? [f] : []));
  const rights: CastleRights = {
    kingRookFile: rooks.find((f) => f > kingFile) ?? null,
    queenRookFile: [...rooks].reverse().find((f) => f < kingFile) ?? null,
  };
  const powers = opts.powers ?? { w: 'teleport' as PowerName, b: 'teleport' as PowerName };
  const reserve = opts.reserve ?? { w: 0, b: 0 };

  const state: GameState = {
    board,
    turn: 'w',
    castling: { w: rights, b: rights },
    kingStartFile: kingFile,
    ep: null,
    halfmove: 0,
    fullmove: 1,
    ply: 0,
    frozen: [],
    doomed: [],
    powers: {
      w: { power: powers.w, used: false, reserve: reserve.w },
      b: { power: powers.b, used: false, reserve: reserve.b },
    },
    graveyard: { w: [], b: [] },
    repetition: {},
    clock: opts.clock ?? null,
    status: { kind: 'ongoing' },
    log: [],
    nextPieceId: id,
    drawOfferedBy: null,
  };

  // The starting position counts as its own first occurrence, as under FIDE rules.
  return { ...state, repetition: { [positionKey(state)]: 1 } };
}

export const emptyCastleRights = (): CastleRights => EMPTY_CASTLE;

export function findKing(state: GameState, color: Color): number {
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.type === 'k' && p.color === color) return i;
  }
  return -1;
}

export function piecesOf(state: GameState, color: Color): { square: number; piece: Piece }[] {
  const out: { square: number; piece: Piece }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.color === color) out.push({ square: i, piece: p });
  }
  return out;
}
