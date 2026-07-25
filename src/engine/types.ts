// Core engine types. Pure TS — no DOM, no browser APIs. Runs in Node and the browser
// unchanged (spec §3.1). Enchantment fields are present from day one so the vanilla-chess
// slice and the enchanted layer share one state shape.

export type Color = 'w' | 'b';

/** 'd' is the Dragon: a knight's leap or a bishop's diagonal, the Dragonlord's cavalry. */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'd';

export type Enchantment =
  | 'taunt'
  | 'martyr'
  | 'outpost'
  | 'swift'
  | 'herald'
  | 'poison'
  | 'immolation';

export type PowerName =
  | 'teleport'
  | 'relocate'
  | 'decree'
  | 'revive'
  | 'chrono'
  /** Destined Death. Dark Lord Wittex alone: mark an enemy piece and it dies three of its
   *  owner's turns later. The only power in the game that may be called more than once. */
  | 'doom';

export type TimeControlId = '3+2' | '5+5' | '10+0' | 'untimed';

export interface TimeControl {
  readonly id: Exclude<TimeControlId, 'untimed'>;
  readonly label: string;
  readonly initialMs: number;
  readonly incrementMs: number;
}

export interface PlayerClock {
  readonly ms: number;
  /** Extra increment bought with the Time Manipulation power. */
  readonly bonusIncrementMs: number;
}

export interface ClockState {
  readonly control: TimeControl;
  readonly w: PlayerClock;
  readonly b: PlayerClock;
}

/** Pieces are immutable value objects with a stable id, so enchantment state can never
 *  drift from the piece it belongs to (spec §3.2). Mutating means replacing. */
export interface Piece {
  readonly id: number;
  readonly color: Color;
  readonly type: PieceType;
  /** At most one enchantment per piece, ever. Never transfers, never added mid-game. */
  readonly ench: Enchantment | null;
  /** Taunt only: a broken shield is gone permanently (T1). */
  readonly shieldBroken: boolean;
  readonly moved: boolean;
}

/** Castling rights stored as the rook's *origin file* rather than a boolean, so Chess960
 *  needs no separate representation. null = right lost. */
export interface CastleRights {
  readonly kingRookFile: number | null;
  readonly queenRookFile: number | null;
}

export interface PowerState {
  readonly power: PowerName;
  readonly used: boolean;
  /** Unspent loadout budget. Only Revive consumes it. */
  readonly reserve: number;
}

export interface FrozenMarker {
  readonly pieceId: number;
  /** Ply index at which the freeze expires (piece may move again from this ply on). */
  readonly untilPly: number;
}

/** A piece Destined Death has been laid on. It moves, defends and captures as normal until the
 *  ply arrives, and then it is simply gone: nothing can lift the mark, and running does not
 *  help, because the mark is on the piece and not on the square. */
export interface DoomMarker {
  readonly pieceId: number;
  /** Ply index at which the piece is removed from the board. */
  readonly diesAtPly: number;
}

export type MoveFlag = 'double' | 'ep' | 'castleK' | 'castleQ' | 'promo';

/** Milliseconds the mover burned on this turn. Absent (or 0) in untimed play; the action log
 *  stays a faithful replay either way. */
interface Timed {
  readonly spentMs?: number;
}

export interface MoveAction extends Timed {
  readonly type: 'move';
  readonly from: number;
  readonly to: number;
  readonly promo?: PieceType;
  readonly flags?: readonly MoveFlag[];
}

export interface ShieldBreakAction extends Timed {
  readonly type: 'shieldBreak';
  readonly from: number;
  readonly target: number;
}

export interface PowerAction extends Timed {
  readonly type: 'power';
  readonly power: PowerName;
  readonly args: PowerArgs;
}

/** Dispatched when the side to move runs out of time. */
export interface FlagAction extends Timed {
  readonly type: 'flag';
}

export type PowerArgs =
  | { readonly kind: 'teleport'; readonly from: number; readonly to: number }
  | { readonly kind: 'relocate'; readonly with: number }
  | { readonly kind: 'decree'; readonly target: number }
  | { readonly kind: 'revive'; readonly piece: PieceType; readonly to: number }
  | { readonly kind: 'doom'; readonly target: number }
  | { readonly kind: 'chrono' };

export interface ResignAction {
  readonly type: 'resign';
}

export interface DrawAction {
  readonly type: 'drawOffer' | 'drawAccept';
}

export type Action =
  | MoveAction
  | ShieldBreakAction
  | PowerAction
  | FlagAction
  | ResignAction
  | DrawAction;

export type GameStatus =
  | { readonly kind: 'ongoing' }
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'stalemate' }
  | { readonly kind: 'draw'; readonly reason: 'fifty-move' | 'threefold' | 'material' | 'agreement' }
  | { readonly kind: 'resigned'; readonly winner: Color }
  | { readonly kind: 'flagged'; readonly winner: Color };

export interface GameState {
  /** 64 squares, index = rank * 8 + file. Index 0 = a1, index 63 = h8. */
  readonly board: readonly (Piece | null)[];
  readonly turn: Color;
  readonly castling: Readonly<Record<Color, CastleRights>>;
  /** File the kings started on. Constant for a game; 960 mirrors both sides. */
  readonly kingStartFile: number;
  /** En-passant target square (the square a double-stepping pawn passed over), or null. */
  readonly ep: number | null;
  readonly halfmove: number;
  readonly fullmove: number;
  readonly ply: number;
  readonly frozen: readonly FrozenMarker[];
  /** Pieces under Destined Death, with the ply each one falls on. */
  readonly doomed: readonly DoomMarker[];
  readonly powers: Readonly<Record<Color, PowerState>>;
  readonly graveyard: Readonly<Record<Color, readonly PieceType[]>>;
  /** Position-key → occurrence count, for threefold repetition. */
  readonly repetition: Readonly<Record<string, number>>;
  /** null in untimed play (v1 hotseat default). */
  readonly clock: ClockState | null;
  readonly status: GameStatus;
  readonly log: readonly Action[];
  readonly nextPieceId: number;
  readonly drawOfferedBy: Color | null;
}

export interface EngineError {
  readonly error: string;
}

export const isError = (r: unknown): r is EngineError =>
  typeof r === 'object' && r !== null && 'error' in r;
