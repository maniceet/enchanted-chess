import {
  blastZone,
  fileOf,
  findKing,
  homeRank,
  opposite,
  positionKey,
  rankOf,
  sq,
  squareName,
} from './board';
import {
  boardAfter,
  inCheck,
  isFrozen,
  isShielded,
  legalMoves,
  promotionRankOf,
  shieldBreakActions,
} from './movegen';
import { REPEATABLE, REVIVE_COST, powerActions, samePowerArgs } from './powers';
import { TIME_POWER_INCREMENT_MS, TIME_POWER_LUMP_MS, incrementFor } from './clock';
import type {
  Action,
  Color,
  EngineError,
  FrozenMarker,
  GameState,
  GameStatus,
  MoveAction,
  Piece,
  PieceType,
  PowerAction,
  ShieldBreakAction,
} from './types';

const err = (error: string): EngineError => ({ error });

function sameMove(a: MoveAction, b: MoveAction): boolean {
  return a.from === b.from && a.to === b.to && (a.promo ?? null) === (b.promo ?? null);
}

function dropCastleRightsFor(
  state: GameState,
  color: Color,
  square: number,
): GameState['castling'] {
  const rights = state.castling[color];
  if (rankOf(square) !== homeRank(color)) return state.castling;
  const f = fileOf(square);
  if (rights.kingRookFile !== f && rights.queenRookFile !== f) return state.castling;
  return {
    ...state.castling,
    [color]: {
      kingRookFile: rights.kingRookFile === f ? null : rights.kingRookFile,
      queenRookFile: rights.queenRookFile === f ? null : rights.queenRookFile,
    },
  };
}

function hasInsufficientMaterial(board: readonly (Piece | null)[]): boolean {
  const minors: PieceType[] = [];
  for (const p of board) {
    if (!p || p.type === 'k') continue;
    if (p.type === 'n' || p.type === 'b') minors.push(p.type);
    else return false;
  }
  return minors.length <= 1;
}

function evaluateStatus(state: GameState): GameStatus {
  if (legalMoves(state, state.turn).length === 0) {
    // Powers and shield-breaks are both illegal in check, so mate is decided by moves alone
    // (T4, §2.4). Out of check, either one still counts as a turn — so it is not stalemate.
    if (inCheck(state, state.turn)) return { kind: 'checkmate', winner: opposite(state.turn) };
    if (
      shieldBreakActions(state, state.turn).length === 0 &&
      powerActions(state, state.turn).length === 0
    ) {
      return { kind: 'stalemate' };
    }
  }
  if (state.halfmove >= 100) return { kind: 'draw', reason: 'fifty-move' };
  if (Object.values(state.repetition).some((n) => n >= 3)) {
    return { kind: 'draw', reason: 'threefold' };
  }
  if (hasInsufficientMaterial(state.board)) return { kind: 'draw', reason: 'material' };
  return { kind: 'ongoing' };
}

/** Flip side, bump counters, charge the mover's clock, expire freezes. Shared by every
 *  turn-consuming action. Deliberately excludes repetition/status so perft runs at speed. */
function endTurn(
  state: GameState,
  opts: { resetHalfmove?: boolean; spentMs?: number } = {},
): GameState {
  const mover = state.turn;
  const ply = state.ply + 1;
  const clock = chargeClock(state, mover, opts.spentMs ?? 0);
  // Destined Death collects here rather than in any one action, because the mark does not care
  // how the turn was spent: a move, a shield-break and a power all bring the hour closer.
  const { board, graveyard, doomed } = collectTheDoomed(state, ply);
  return {
    ...state,
    board,
    graveyard,
    doomed,
    turn: opposite(mover),
    ply,
    fullmove: mover === 'b' ? state.fullmove + 1 : state.fullmove,
    halfmove: opts.resetHalfmove ? 0 : state.halfmove + 1,
    drawOfferedBy: null,
    clock,
    frozen: state.frozen.filter((f) => f.untilPly > ply),
  };
}

/** Take everything whose hour has come. Kings are never on the list — Destined Death cannot be
 *  laid on one — so this can never end a game by removing a crown. */
function collectTheDoomed(
  state: GameState,
  ply: number,
): Pick<GameState, 'board' | 'graveyard' | 'doomed'> {
  const due = state.doomed.filter((d) => d.diesAtPly <= ply);
  if (!due.length) return { board: state.board, graveyard: state.graveyard, doomed: state.doomed };

  const board = state.board.slice();
  let graveyard = state.graveyard;
  for (const mark of due) {
    const square = board.findIndex((p) => p?.id === mark.pieceId);
    if (square < 0) continue; // already taken by ordinary means; the mark simply lapses
    const victim = board[square]!;
    board[square] = null;
    graveyard = { ...graveyard, [victim.color]: [...graveyard[victim.color], victim.type] };
  }
  return {
    board,
    graveyard,
    doomed: state.doomed.filter((d) => d.diesAtPly > ply),
  };
}

/** Deduct the time burned, then pay the increment — including any second bought with Time
 *  Manipulation. A move that arrives after the flag is handled by the `flag` action. */
function chargeClock(state: GameState, mover: Color, spentMs: number): GameState['clock'] {
  const clock = state.clock;
  if (!clock) return null;
  const remaining = clock[mover].ms - spentMs;
  return {
    ...clock,
    [mover]: {
      ...clock[mover],
      ms: remaining + (remaining > 0 ? incrementFor(clock, mover) : 0),
    },
  };
}

/** Records the new position for threefold and evaluates the result (spec §2.5 steps 5–6). */
function settle(state: GameState): GameState {
  const key = positionKey(state);
  const repetition = { ...state.repetition, [key]: (state.repetition[key] ?? 0) + 1 };
  const withRep: GameState = { ...state, repetition };
  return { ...withRep, status: evaluateStatus(withRep) };
}

/** Applies an already-legal move. No legality check, no repetition/status bookkeeping. */
export function makeMove(state: GameState, match: MoveAction): GameState {
  const mover = state.board[match.from]!;
  const flags = match.flags ?? [];
  const isCastle = flags.includes('castleK') || flags.includes('castleQ');
  const capturedSquare = flags.includes('ep')
    ? sq(fileOf(match.to), rankOf(match.from))
    : match.to;
  const captured = isCastle ? null : state.board[capturedSquare];

  const board = boardAfter(state, match) as (Piece | null)[];
  let graveyard = state.graveyard;
  let frozen: readonly FrozenMarker[] = state.frozen;
  const burnedRooks: { color: Color; square: number }[] = [];

  if (captured) {
    // 1. Captured piece → graveyard.
    graveyard = {
      ...graveyard,
      [captured.color]: [...graveyard[captured.color], captured.type],
    };
    // 2/3. Poison, Martyr and Immolation never touch a capturing King (§2.4a King Immunity).
    if (mover.type !== 'k') {
      if (captured.ench === 'poison') {
        board[match.to] = null;
        graveyard = { ...graveyard, [mover.color]: [...graveyard[mover.color], mover.type] };
      } else if (captured.ench === 'martyr') {
        // Frozen through the mover's next turn: this ply is state.ply, its next turn is +2.
        frozen = [...frozen, { pieceId: mover.id, untilPly: state.ply + 3 }];
      }
    }
    // Immolation goes off for *anyone*, including a King, because the blast is not aimed at the
    // captor: it is the square catching fire. King Immunity still holds — the King is never
    // among the things it consumes, whether he lit it or was standing next to it.
    if (captured.ench === 'immolation') {
      for (const square of blastZone(captured.color, capturedSquare)) {
        const victim = board[square];
        if (!victim || victim.type === 'k') continue;
        board[square] = null;
        graveyard = { ...graveyard, [victim.color]: [...graveyard[victim.color], victim.type] };
        // A rook that burns on its home square takes its castling right with it, exactly as one
        // that is captured does. Missing this leaves a right pointing at an empty corner.
        if (victim.type === 'r') burnedRooks.push({ color: victim.color, square });
      }
    }
  }

  // 4. Promotion: `boardAfter` already swapped the type; mark the piece moved.
  const landed = board[match.to];
  if (landed) board[match.to] = { ...landed, moved: true };
  if (isCastle) {
    const rank = homeRank(mover.color);
    const rookDest = sq(flags.includes('castleK') ? 5 : 3, rank);
    const rook = board[rookDest];
    if (rook) board[rookDest] = { ...rook, moved: true };
  }

  let castling = state.castling;
  if (mover.type === 'k') {
    castling = { ...castling, [mover.color]: { kingRookFile: null, queenRookFile: null } };
  } else if (mover.type === 'r') {
    castling = dropCastleRightsFor({ ...state, castling }, mover.color, match.from);
  }
  if (captured && captured.type === 'r') {
    castling = dropCastleRightsFor({ ...state, castling }, captured.color, capturedSquare);
  }
  for (const rook of burnedRooks) {
    castling = dropCastleRightsFor({ ...state, castling }, rook.color, rook.square);
  }

  const ep = flags.includes('double')
    ? sq(fileOf(match.from), (rankOf(match.from) + rankOf(match.to)) / 2)
    : null;

  return endTurn(
    { ...state, board, castling, ep, graveyard, frozen },
    { resetHalfmove: mover.type === 'p' || captured != null, spentMs: match.spentMs },
  );
}

function applyMove(state: GameState, action: MoveAction): GameState | EngineError {
  const match = legalMoves(state, state.turn).find((m) => sameMove(m, action));
  if (!match) return err(`illegal move ${squareName(action.from)}-${squareName(action.to)}`);
  const moved = makeMove(state, { ...match, spentMs: action.spentMs });
  return settle({ ...moved, log: [...state.log, { ...match, spentMs: action.spentMs }] });
}

/** T2: a shield-break is not a capture. No Poison, no Martyr, no fifty-move reset, and the
 *  attacker does not move — the shield is simply destroyed, permanently. */
function applyShieldBreak(state: GameState, action: ShieldBreakAction): GameState | EngineError {
  const legal = shieldBreakActions(state, state.turn).some(
    (a) => a.from === action.from && a.target === action.target,
  );
  if (!legal) return err(`illegal shield-break on ${squareName(action.target)}`);

  const board = state.board.slice() as (Piece | null)[];
  const victim = board[action.target]!;
  board[action.target] = { ...victim, shieldBroken: true };

  return settle(
    endTurn({ ...state, board, ep: null, log: [...state.log, action] }, { spentMs: action.spentMs }),
  );
}

function applyPower(state: GameState, action: PowerAction): GameState | EngineError {
  const color = state.turn;
  const legal = powerActions(state, color).some(
    (p) => p.power === action.power && samePowerArgs(p.args, action.args),
  );
  if (!legal) return err(`illegal ${action.power} activation`);

  const board = state.board.slice() as (Piece | null)[];
  let graveyard = state.graveyard;
  let frozen = state.frozen;
  let doomed = state.doomed;
  let reserve = state.powers[color].reserve;
  let nextPieceId = state.nextPieceId;
  const args = action.args;

  switch (args.kind) {
    case 'teleport': {
      const piece = board[args.from]!;
      board[args.from] = null;
      board[args.to] = { ...piece, moved: true };
      break;
    }
    case 'relocate': {
      const kingSq = findKing(state, color);
      const king = board[kingSq]!;
      const friend = board[args.with]!;
      board[args.with] = { ...king, moved: true };
      board[kingSq] = { ...friend, moved: true };
      break;
    }
    case 'decree': {
      // Frozen through the opponent's next turn, which is the ply immediately after this one.
      const target = board[args.target]!;
      frozen = [...frozen, { pieceId: target.id, untilPly: state.ply + 2 }];
      break;
    }
    case 'doom': {
      // Three more of the victim's own turns, then it is gone. This ply is the caller's, so the
      // victim moves on ply+1, +3 and +5, and falls as ply+6 opens. It moves, defends and
      // captures normally throughout — Destined Death takes a piece, it does not still one.
      const target = board[args.target]!;
      doomed = [...doomed, { pieceId: target.id, diesAtPly: state.ply + 6 }];
      break;
    }
    case 'revive': {
      // Returns without any enchantment it once carried, and counts as already moved.
      board[args.to] = {
        id: nextPieceId++,
        color,
        type: args.piece,
        ench: null,
        shieldBroken: false,
        moved: true,
      };
      reserve -= REVIVE_COST[args.piece];
      const remaining = [...graveyard[color]];
      remaining.splice(remaining.indexOf(args.piece), 1);
      graveyard = { ...graveyard, [color]: remaining };
      break;
    }
  }

  let clock = state.clock;
  if (args.kind === 'chrono' && clock) {
    // With an increment, buy a permanent extra second per move; without one, a flat lump.
    clock =
      clock.control.incrementMs > 0
        ? {
            ...clock,
            [color]: {
              ...clock[color],
              bonusIncrementMs: clock[color].bonusIncrementMs + TIME_POWER_INCREMENT_MS,
            },
          }
        : { ...clock, [color]: { ...clock[color], ms: clock[color].ms + TIME_POWER_LUMP_MS } };
  }

  const powers = {
    ...state.powers,
    // Destined Death is never spent: the Dark Lord may call it again next turn, and the turn
    // after that. Every other King speaks once.
    [color]: { ...state.powers[color], used: !REPEATABLE.has(action.power), reserve },
  };

  return settle(
    endTurn({
      ...state,
      board,
      powers,
      graveyard,
      frozen,
      doomed,
      clock,
      nextPieceId,
      ep: null,
      log: [...state.log, action],
    }, { spentMs: action.spentMs }),
  );
}

export function applyAction(state: GameState, action: Action): GameState | EngineError {
  if (state.status.kind !== 'ongoing') return err('game is over');

  switch (action.type) {
    case 'move':
      return applyMove(state, action);

    case 'resign':
      return {
        ...state,
        status: { kind: 'resigned', winner: opposite(state.turn) },
        log: [...state.log, action],
      };

    case 'drawOffer':
      return { ...state, drawOfferedBy: state.turn, log: [...state.log, action] };

    case 'drawAccept':
      if (!state.drawOfferedBy || state.drawOfferedBy === state.turn) {
        return err('no draw offer to accept');
      }
      return {
        ...state,
        status: { kind: 'draw', reason: 'agreement' },
        log: [...state.log, action],
      };

    case 'flag': {
      // The mover's clock has run out. Charge the elapsed time, then confirm the flag.
      const charged = endTurn(state, { spentMs: action.spentMs });
      const loser = state.turn;
      if (!charged.clock || charged.clock[loser].ms > 0) return err('clock has not run out');
      return {
        ...state,
        clock: charged.clock,
        status: { kind: 'flagged', winner: opposite(loser) },
        log: [...state.log, action],
      };
    }

    case 'shieldBreak':
      return applyShieldBreak(state, action);

    case 'power':
      return applyPower(state, action);
  }
}

/** Every action the side to move may legally take (spec §2.5): a chess move, a shield-break,
 *  or a King power activation. */
export function legalActions(state: GameState): Action[] {
  if (state.status.kind !== 'ongoing') return [];
  return [
    ...legalMoves(state, state.turn),
    ...shieldBreakActions(state, state.turn),
    ...powerActions(state, state.turn),
  ];
}

export {
  inCheck,
  isFrozen,
  isShielded,
  legalMoves,
  positionKey,
  promotionRankOf,
  shieldBreakActions,
};
