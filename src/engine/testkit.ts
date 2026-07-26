import { initialState, parseSquare, positionKey } from './board';
import type {
  ClockState,
  Color,
  Enchantment,
  GameState,
  Piece,
  PieceType,
  PowerName,
} from './types';

export interface PositionOpts {
  turn?: Color;
  powers?: Partial<Record<Color, PowerName>>;
  reserve?: Partial<Record<Color, number>>;
  powerUsed?: Partial<Record<Color, boolean>>;
  graveyard?: Partial<Record<Color, PieceType[]>>;
  /** Squares whose occupants start frozen (Martyr/Decree semantics, M1). */
  frozen?: string[];
  ep?: string;
  castling?: boolean;
  /** Half-moves already played. Needed by anything with a "not before move N" gate — Destined
   *  Death is barred until after move ten, so a scenario testing it has to start late. */
  ply?: number;
  clock?: ClockState;
}

/** Builds a sparse test position: `{ e1: 'wk', d5: 'bq:taunt' }`. Castling rights are off
 *  unless asked for, so scenarios stay minimal. */
export function position(spec: Record<string, string>, opts: PositionOpts = {}): GameState {
  const base = initialState();
  const board: (Piece | null)[] = Array(64).fill(null);
  let id = 1;

  for (const [square, descriptor] of Object.entries(spec)) {
    const [code, ench] = descriptor.split(':');
    board[parseSquare(square)] = {
      id: id++,
      color: code[0] as Color,
      type: code[1] as PieceType,
      ench: (ench as Enchantment) ?? null,
      shieldBroken: false,
      moved: false,
    };
  }

  const noRights = { kingRookFile: null, queenRookFile: null };
  const frozen = (opts.frozen ?? []).map((square) => ({
    pieceId: board[parseSquare(square)]!.id,
    untilPly: 999,
  }));

  const built: GameState = {
    ...base,
    board,
    turn: opts.turn ?? 'w',
    ply: opts.ply ?? base.ply,
    castling: opts.castling ? base.castling : { w: noRights, b: noRights },
    ep: opts.ep ? parseSquare(opts.ep) : null,
    frozen,
    graveyard: {
      w: opts.graveyard?.w ?? [],
      b: opts.graveyard?.b ?? [],
    },
    powers: {
      w: {
        powers: [opts.powers?.w ?? 'teleport'],
        spent: opts.powerUsed?.w ? [opts.powers?.w ?? 'teleport'] : [],
        reserve: opts.reserve?.w ?? 0,
      },
      b: {
        powers: [opts.powers?.b ?? 'teleport'],
        spent: opts.powerUsed?.b ? [opts.powers?.b ?? 'teleport'] : [],
        reserve: opts.reserve?.b ?? 0,
      },
    },
    clock: opts.clock ?? null,
    nextPieceId: id,
    repetition: {},
  };
  return { ...built, repetition: { [positionKey(built)]: 1 } };
}

/** Convenience: does the legal move list contain from→to? */
export function hasMove(
  moves: { from: number; to: number; promo?: PieceType }[],
  from: string,
  to: string,
  promo?: PieceType,
): boolean {
  return moves.some(
    (m) =>
      m.from === parseSquare(from) &&
      m.to === parseSquare(to) &&
      (promo === undefined || m.promo === promo),
  );
}

export function at(state: GameState, square: string): Piece | null {
  return state.board[parseSquare(square)];
}
