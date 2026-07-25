import {
  fileOf,
  findKing,
  forward,
  homeRank,
  inOwnHalf,
  onBoard,
  opposite,
  promoRank,
  rankOf,
  relativeRank,
  sq,
} from './board';
import type {
  Color,
  GameState,
  MoveAction,
  MoveFlag,
  BindAction,
  Piece,
  PieceType,
  ShieldBreakAction,
} from './types';

export type Board = readonly (Piece | null)[];

const KNIGHT_DELTAS: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const DIAGONALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ORTHOGONALS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const ALL_DIRS = [...DIAGONALS, ...ORTHOGONALS];

const PROMO_CHOICES: readonly PieceType[] = ['q', 'r', 'b', 'n'];

/** Does `byColor` attack `target`? Uses the same rule that governs king-move legality,
 *  so pinned enemy pieces still attack (spec §2.4, "under attack" definition). */
export function isAttacked(board: Board, target: number, byColor: Color): boolean {
  const tf = fileOf(target);
  const tr = rankOf(target);

  // Pawns: an attacker sits one rank "behind" the target from its own perspective.
  const pawnRank = tr - forward(byColor);
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (!onBoard(f, pawnRank)) continue;
    const p = board[sq(f, pawnRank)];
    if (p && p.color === byColor && p.type === 'p') return true;
  }

  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && p.color === byColor && (p.type === 'n' || p.type === 'd')) return true;
  }

  for (const [df, dr] of ALL_DIRS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const p = board[sq(f, r)];
    if (p && p.color === byColor && p.type === 'k') return true;
  }

  for (const dirs of [DIAGONALS, ORTHOGONALS] as const) {
    const slider: PieceType = dirs === DIAGONALS ? 'b' : 'r';
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (onBoard(f, r)) {
        const p = board[sq(f, r)];
        if (p) {
          const diagonal = slider === 'b' && (p.type === 'b' || p.type === 'd' || p.type === 'a');
          const straight = slider === 'r' && p.type === 'r';
          if (p.color === byColor && (diagonal || straight || p.type === 'q')) return true;
          break;
        }
        f += df;
        r += dr;
      }
    }
  }
  return false;
}

export function inCheck(state: GameState, color: Color): boolean {
  const k = findKing(state, color);
  return k >= 0 && isAttacked(state.board, k, opposite(color));
}

export function isFrozen(state: GameState, piece: Piece): boolean {
  return state.frozen.some((f) => f.pieceId === piece.id && f.untilPly > state.ply);
}

/** Rank on which this pawn promotes: rank 7 for Herald, rank 8 otherwise (spec §2.3). */
export function promotionRankOf(piece: Piece): number {
  if (piece.ench === 'herald') {
    return piece.color === 'w' ? 6 : 1;
  }
  return promoRank(piece.color);
}

/** A pawn may not capture a piece carrying Outpost (spec §2.3 #3). */
function pawnBlockedByOutpost(attacker: Piece, victim: Piece | null): boolean {
  return attacker.type === 'p' && victim != null && victim.ench === 'outpost';
}

/** Taunt shield state is derived live: shielded ⟺ carries an unbroken Taunt, stands in its
 *  owner's own half, **and** is defended by ≥1 friendly piece right now (T1). Never stored as
 *  a standalone boolean. The half rule (T5) makes Taunt a defensive enchantment: cross into
 *  enemy ground and the shield sleeps, and it wakes again if the piece comes home. */
export function isShielded(board: Board, square: number): boolean {
  const p = board[square];
  return (
    p != null &&
    p.ench === 'taunt' &&
    !p.shieldBroken &&
    inOwnHalf(p.color, square) &&
    isAttacked(board, square, p.color)
  );
}

/** A capture attempt on a shielded piece becomes a shield-break instead, so it is not a legal
 *  *move*.
 *
 *  There is no Taunt-ignores-Taunt exception, and under the half rule there cannot be one: a
 *  shielded piece stands in its owner's half, which is the attacker's enemy half, so the square
 *  the attacker strikes is always ground where its own Taunt is asleep. The old exception is
 *  not merely rare now, it is unreachable, so it is gone rather than left as dead code.
 *
 *  The King needs no clause either — shielded means defended, so a King capture is into check. */
function captureBlockedByShield(board: Board, _attacker: Piece, target: number): boolean {
  return isShielded(board, target);
}

function canCapture(board: Board, attacker: Piece, target: number): boolean {
  const victim = board[target];
  if (!victim || victim.color === attacker.color) return false;
  if (pawnBlockedByOutpost(attacker, victim)) return false;
  return !captureBlockedByShield(board, attacker, target);
}

/** Squares holding pieces of `color` that attack `square`. Used for shield-break generation
 *  and UI overlays — never in the perft-hot path. */
export function attackersOf(board: Board, square: number, color: Color): number[] {
  const out: number[] = [];
  const tf = fileOf(square);
  const tr = rankOf(square);

  const pawnRank = tr - forward(color);
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (!onBoard(f, pawnRank)) continue;
    const s = sq(f, pawnRank);
    const p = board[s];
    if (p && p.color === color && p.type === 'p') out.push(s);
  }
  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const s = sq(f, r);
    const p = board[s];
    if (p && p.color === color && (p.type === 'n' || p.type === 'd')) out.push(s);
  }
  for (const dirs of [DIAGONALS, ORTHOGONALS] as const) {
    const slider: PieceType = dirs === DIAGONALS ? 'b' : 'r';
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      let steps = 0;
      while (onBoard(f, r)) {
        const s = sq(f, r);
        const p = board[s];
        if (p) {
          const diagonal = slider === 'b' && (p.type === 'b' || p.type === 'd' || p.type === 'a');
          const straight = slider === 'r' && p.type === 'r';
          if (
            p.color === color &&
            (diagonal || straight || p.type === 'q' || (p.type === 'k' && steps === 0))
          ) {
            out.push(s);
          }
          break;
        }
        f += df;
        r += dr;
        steps++;
      }
    }
  }
  return out;
}

function pushMove(out: MoveAction[], from: number, to: number, flags?: MoveFlag[]): void {
  out.push(flags && flags.length ? { type: 'move', from, to, flags } : { type: 'move', from, to });
}

function pushPawnMove(
  out: MoveAction[],
  piece: Piece,
  from: number,
  to: number,
  extra: MoveFlag[],
): void {
  if (rankOf(to) === promotionRankOf(piece)) {
    for (const promo of PROMO_CHOICES) {
      out.push({ type: 'move', from, to, promo, flags: [...extra, 'promo'] });
    }
  } else {
    pushMove(out, from, to, extra);
  }
}

function slidingMoves(
  out: MoveAction[],
  board: Board,
  from: number,
  piece: Piece,
  dirs: readonly (readonly [number, number])[],
): void {
  const f0 = fileOf(from);
  const r0 = rankOf(from);
  for (const [df, dr] of dirs) {
    let f = f0 + df;
    let r = r0 + dr;
    while (onBoard(f, r)) {
      const to = sq(f, r);
      const victim = board[to];
      if (!victim) {
        pushMove(out, from, to);
      } else {
        if (canCapture(board, piece, to)) pushMove(out, from, to);
        break;
      }
      f += df;
      r += dr;
    }
  }
}

function castleMoves(out: MoveAction[], state: GameState, kingSq: number, color: Color): void {
  const rights = state.castling[color];
  const rank = homeRank(color);
  const enemy = opposite(color);

  const trySide = (rookFile: number | null, kingDestFile: number, rookDestFile: number, flag: MoveFlag): void => {
    if (rookFile === null) return;
    const rookSq = sq(rookFile, rank);
    const rook = state.board[rookSq];
    if (!rook || rook.type !== 'r' || rook.color !== color) return;
    const kingDest = sq(kingDestFile, rank);
    const rookDest = sq(rookDestFile, rank);

    // Every square the king or rook travels through (or lands on) must be empty,
    // ignoring the castling king and rook themselves.
    const span = (a: number, b: number): number[] => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const list: number[] = [];
      for (let i = lo; i <= hi; i++) list.push(i);
      return list;
    };
    for (const f of [...span(fileOf(kingSq), kingDestFile), ...span(rookFile, rookDestFile)]) {
      const s = sq(f, rank);
      const occ = state.board[s];
      if (occ && s !== kingSq && s !== rookSq) return;
    }
    // The king may not start, pass through, or end in check.
    for (const f of span(fileOf(kingSq), kingDestFile)) {
      if (isAttacked(state.board, sq(f, rank), enemy)) return;
    }
    void rookDest;
    out.push({ type: 'move', from: kingSq, to: kingDest, flags: [flag] });
  };

  trySide(rights.kingRookFile, 6, 5, 'castleK');
  trySide(rights.queenRookFile, 2, 3, 'castleQ');
}

/** Pseudo-legal moves: geometry and enchantment movement rules applied, king safety not yet. */
export function pseudoMoves(state: GameState, color: Color): MoveAction[] {
  const out: MoveAction[] = [];
  const board = state.board;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;
    if (isFrozen(state, piece)) continue; // M1: frozen pieces still attack, but cannot move.

    const f0 = fileOf(from);
    const r0 = rankOf(from);

    switch (piece.type) {
      case 'p': {
        const dir = forward(color);
        const one = sq(f0, r0 + dir);
        if (onBoard(f0, r0 + dir) && !board[one]) {
          pushPawnMove(out, piece, from, one, []);
          // Double step: unmoved pawn on its home rank, or from anywhere if Swift (§2.3 #4).
          // The `moved` flag is what stops a revived pawn from double-stepping (§2.4 Revive).
          const canDouble =
            piece.ench === 'swift' || (!piece.moved && relativeRank(color, from) === 2);
          const twoRank = r0 + dir * 2;
          if (canDouble && onBoard(f0, twoRank) && !board[sq(f0, twoRank)]) {
            pushPawnMove(out, piece, from, sq(f0, twoRank), ['double']);
          }
        }
        for (const df of [-1, 1]) {
          const f = f0 + df;
          const r = r0 + dir;
          if (!onBoard(f, r)) continue;
          const to = sq(f, r);
          const victim = board[to];
          if (victim) {
            if (canCapture(board, piece, to)) pushPawnMove(out, piece, from, to, []);
          } else if (to === state.ep) {
            const capturedSq = sq(f, r0);
            if (canCapture(board, piece, capturedSq)) {
              pushPawnMove(out, piece, from, to, ['ep']);
            }
          }
        }
        break;
      }
      case 'n': {
        for (const [df, dr] of KNIGHT_DELTAS) {
          const f = f0 + df;
          const r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const to = sq(f, r);
          const victim = board[to];
          if (!victim || canCapture(board, piece, to)) pushMove(out, from, to);
        }
        break;
      }
      case 'b':
      // The Archbishop walks the diagonals like any bishop. What makes him is what he can do
      // instead of arriving: see `bindActions`.
      case 'a':
        slidingMoves(out, board, from, piece, DIAGONALS);
        break;
      case 'd': {
        // Knight's leap or bishop's diagonal, the Dragonlord's cavalry.
        for (const [df, dr] of KNIGHT_DELTAS) {
          const f = f0 + df;
          const r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const to = sq(f, r);
          const victim = board[to];
          if (!victim || canCapture(board, piece, to)) pushMove(out, from, to);
        }
        slidingMoves(out, board, from, piece, DIAGONALS);
        break;
      }
      case 'r':
        slidingMoves(out, board, from, piece, ORTHOGONALS);
        break;
      case 'q':
        slidingMoves(out, board, from, piece, ALL_DIRS);
        break;
      case 'k': {
        for (const [df, dr] of ALL_DIRS) {
          const f = f0 + df;
          const r = r0 + dr;
          if (!onBoard(f, r)) continue;
          const to = sq(f, r);
          const victim = board[to];
          if (!victim || canCapture(board, piece, to)) pushMove(out, from, to);
        }
        castleMoves(out, state, from, color);
        break;
      }
    }
  }
  return out;
}

/** Applies a move to a bare board copy — enough to test king safety, nothing else. */
export function boardAfter(state: GameState, m: MoveAction): (Piece | null)[] {
  const board = state.board.slice() as (Piece | null)[];
  const piece = board[m.from];
  if (!piece) return board;
  const flags = m.flags ?? [];

  if (flags.includes('castleK') || flags.includes('castleQ')) {
    const rank = homeRank(piece.color);
    const rights = state.castling[piece.color];
    const rookFile = flags.includes('castleK') ? rights.kingRookFile! : rights.queenRookFile!;
    const rookSq = sq(rookFile, rank);
    const rook = board[rookSq];
    board[m.from] = null;
    board[rookSq] = null;
    board[m.to] = piece;
    board[sq(flags.includes('castleK') ? 5 : 3, rank)] = rook;
    return board;
  }

  if (flags.includes('ep')) {
    board[sq(fileOf(m.to), rankOf(m.from))] = null;
  }
  board[m.from] = null;
  board[m.to] = m.promo ? { ...piece, type: m.promo } : piece;
  return board;
}

/** Legal shield-breaks: a capture attempt on a shielded enemy piece, which destroys the shield
 *  instead of capturing and leaves the attacker where it stands (T2).
 *  - Illegal while your own King is in check, since it resolves nothing (T4).
 *  - A King never qualifies: shielded ⇒ defended ⇒ that capture is into check.
 *  - A Taunt-carrying attacker gets no exception: it is striking into the enemy half, where its
 *    own shield is asleep (T5). Everyone but a King breaks shields the same way.
 *  - Frozen pieces *may* shield-break: nothing moves, and freezing restricts movement only (M1).
 *  - A pinned piece may also shield-break, for the same reason — no piece changes square. */
export function shieldBreakActions(
  state: GameState,
  color: Color = state.turn,
): ShieldBreakAction[] {
  if (inCheck(state, color)) return [];
  const out: ShieldBreakAction[] = [];
  for (let target = 0; target < 64; target++) {
    const victim = state.board[target];
    if (!victim || victim.color === color) continue;
    if (!isShielded(state.board, target)) continue;
    for (const from of attackersOf(state.board, target, color)) {
      const attacker = state.board[from];
      if (!attacker || attacker.type === 'k') continue;
      out.push({ type: 'shieldBreak', from, target });
    }
  }
  return out;
}

/** Every binding the side to move could lay this turn.
 *
 *  The Archbishop's word, and the mirror of a shield-break: he reaches a piece he could have
 *  taken and stops it instead, staying where he is and spending the turn. The frozen piece
 *  keeps every square it covers (M1) — this restricts movement and nothing else, so a bound
 *  piece still gives check, still defends its friends, and still has to be answered.
 *
 *  Two limits, both borrowed from rules that already exist rather than invented here. He may
 *  not bind a King, for the same reason Decree may not name one: the King bows to nothing.
 *  And he may not bind while his own King is in check, for the same reason a shield-break is
 *  illegal there (T4) — a bind does not answer a check, so spending the turn on one would be
 *  leaving the King attacked. */
export function bindActions(state: GameState, color: Color = state.turn): BindAction[] {
  if (inCheck(state, color)) return [];
  const out: BindAction[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = state.board[from];
    if (!piece || piece.color !== color || piece.type !== 'a') continue;
    if (isFrozen(state, piece)) continue;
    // The first piece down each diagonal, exactly as far as he could have moved to take it.
    const f0 = fileOf(from);
    const r0 = rankOf(from);
    for (const [df, dr] of DIAGONALS) {
      let f = f0 + df;
      let r = r0 + dr;
      while (onBoard(f, r)) {
        const target = sq(f, r);
        const victim = state.board[target];
        if (victim) {
          // Already bound is already bound; a second word this turn changes nothing. Outpost
          // and Taunt say who may *take* a piece, and a binding takes nothing, so neither of
          // them has an opinion here.
          if (victim.color !== color && victim.type !== 'k' && !isFrozen(state, victim)) {
            out.push({ type: 'bind', from, target });
          }
          break;
        }
        f += df;
        r += dr;
      }
    }
  }
  return out;
}

/** Squares between two aligned squares, exclusive. Empty when they do not line up. */
function between(from: number, to: number): number[] {
  const df = Math.sign(fileOf(to) - fileOf(from));
  const dr = Math.sign(rankOf(to) - rankOf(from));
  const straight = df === 0 || dr === 0;
  const diagonal = Math.abs(fileOf(to) - fileOf(from)) === Math.abs(rankOf(to) - rankOf(from));
  if (!straight && !diagonal) return [];

  const squares: number[] = [];
  let f = fileOf(from) + df;
  let r = rankOf(from) + dr;
  while (onBoard(f, r) && sq(f, r) !== to) {
    squares.push(sq(f, r));
    f += df;
    r += dr;
  }
  return squares;
}

/** Is `target` attacked by `byColor` if the piece on `ignore` were not there? Used for king
 *  moves, where the king must not step along the line of the slider that is checking it. */
function isAttackedIgnoring(
  board: Board,
  target: number,
  byColor: Color,
  ignore: number,
): boolean {
  const tf = fileOf(target);
  const tr = rankOf(target);

  const pawnRank = tr - forward(byColor);
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (!onBoard(f, pawnRank)) continue;
    const s = sq(f, pawnRank);
    if (s === ignore) continue;
    const p = board[s];
    if (p && p.color === byColor && p.type === 'p') return true;
  }

  for (const [df, dr] of KNIGHT_DELTAS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const s = sq(f, r);
    if (s === ignore) continue;
    const p = board[s];
    if (p && p.color === byColor && (p.type === 'n' || p.type === 'd')) return true;
  }

  for (const [df, dr] of ALL_DIRS) {
    const f = tf + df;
    const r = tr + dr;
    if (!onBoard(f, r)) continue;
    const s = sq(f, r);
    if (s === ignore) continue;
    const p = board[s];
    if (p && p.color === byColor && p.type === 'k') return true;
  }

  for (const dirs of [DIAGONALS, ORTHOGONALS] as const) {
    const slider: PieceType = dirs === DIAGONALS ? 'b' : 'r';
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (onBoard(f, r)) {
        const s = sq(f, r);
        if (s !== ignore) {
          const p = board[s];
          if (p) {
            const diagonal = slider === 'b' && (p.type === 'b' || p.type === 'd' || p.type === 'a');
            const straight = slider === 'r' && p.type === 'r';
            if (p.color === byColor && (diagonal || straight || p.type === 'q')) return true;
            break;
          }
        }
        f += df;
        r += dr;
      }
    }
  }
  return false;
}

/** Who is giving check, and which friendly pieces are pinned to the king and along what line.
 *  Working this out once per position is what makes legality cheap: no board is copied. */
interface KingPicture {
  king: number;
  checkers: number[];
  /** square → the squares it may still move to while remaining pinned (its own line). */
  pins: Map<number, Set<number>>;
}

function pictureOf(board: Board, color: Color): KingPicture {
  let king = -1;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.type === 'k' && p.color === color) {
      king = i;
      break;
    }
  }
  const picture: KingPicture = { king, checkers: [], pins: new Map() };
  if (king < 0) return picture;

  const enemy = opposite(color);
  picture.checkers = attackersOf(board, king, enemy);

  // A friendly piece with an enemy slider behind it, and nothing else between, is pinned.
  for (const dirs of [DIAGONALS, ORTHOGONALS] as const) {
    const slider: PieceType = dirs === DIAGONALS ? 'b' : 'r';
    for (const [df, dr] of dirs) {
      let f = fileOf(king) + df;
      let r = rankOf(king) + dr;
      let candidate = -1;
      // Every empty square on the line, on both sides of the pinned piece: it may slide
      // towards the king or away towards the pinner, so long as it stays on the line.
      const line: number[] = [];

      while (onBoard(f, r)) {
        const s = sq(f, r);
        const piece = board[s];
        if (piece) {
          if (candidate < 0) {
            if (piece.color !== color) break; // an enemy first: this is a check, not a pin
            candidate = s;
          } else {
            const diagonal = slider === 'b' && (piece.type === 'b' || piece.type === 'd' || piece.type === 'a');
            const straight = slider === 'r' && piece.type === 'r';
            if (piece.color === enemy && (diagonal || straight || piece.type === 'q')) {
              // Along the line, or take the pinner itself.
              picture.pins.set(candidate, new Set([...line, s]));
            }
            break;
          }
        } else {
          line.push(s);
        }
        f += df;
        r += dr;
      }
    }
  }
  return picture;
}

/** Fully legal chess moves for the side to move (shield-breaks and powers are separate actions).
 *
 *  Legality is decided from a single picture of the king rather than by playing every move on a
 *  copy of the board, which is what the search spends most of its time on. */
export function legalMoves(state: GameState, color: Color = state.turn): MoveAction[] {
  const board = state.board;
  const enemy = opposite(color);
  const picture = pictureOf(board, color);
  const { king, checkers } = picture;
  const legal: MoveAction[] = [];

  // In double check only the king may move, so do not even generate the rest.
  const doubleCheck = checkers.length > 1;
  const moves = pseudoMoves(state, color);

  // When a single piece gives check, every other piece must capture it or stand in the way.
  let resolving: Set<number> | null = null;
  if (checkers.length === 1 && king >= 0) {
    resolving = new Set([checkers[0], ...between(king, checkers[0])]);
  }

  for (const move of moves) {
    const piece = board[move.from];
    if (!piece) continue;
    const flags = move.flags ?? [];

    if (piece.type === 'k') {
      // Castling has already checked its own squares; a step must land somewhere unattacked,
      // measured with the king out of the way so it cannot retreat along a checking line.
      if (flags.includes('castleK') || flags.includes('castleQ')) {
        legal.push(move);
        continue;
      }
      if (!isAttackedIgnoring(board, move.to, enemy, king)) legal.push(move);
      continue;
    }

    if (doubleCheck) continue;

    // En passant can expose the king along a rank in a way no pin test sees, so those few
    // moves are still checked the honest way.
    if (flags.includes('ep')) {
      const after = boardAfter(state, move);
      if (king < 0 || !isAttacked(after, king, enemy)) legal.push(move);
      continue;
    }

    if (resolving && !resolving.has(move.to)) continue;

    const pin = picture.pins.get(move.from);
    if (pin && !pin.has(move.to)) continue;

    legal.push(move);
  }

  return legal;
}
