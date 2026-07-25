import type { PointerEvent as ReactPointerEvent } from 'react';
import { FILES, fileOf, inOwnHalf, rankOf, squareName } from '../engine/board';
import { isFrozen } from '../engine/apply';
import { isShielded } from '../engine/movegen';
import { ENCH_TEXT } from '../engine/loadout';
import type { GameState, MoveAction } from '../engine/types';
import { ENCH_NAME, EnchRune, PieceGlyph, PIECE_NAME, type ShieldState } from './Pieces';

export interface BoardProps {
  state: GameState;
  selected: number | null;
  targets: Map<number, MoveAction[]>;
  /** Squares holding a shielded enemy piece the selected piece may hammer (T2). */
  breakTargets: Set<number>;
  /** Squares holding an enemy piece the selected Archbishop may bind instead of taking. */
  bindTargets: Set<number>;
  /** Squares a pending King power may act on. */
  powerTargets: Set<number>;
  lastMove: { from: number; to: number } | null;
  checkedKing: number | null;
  denySquare: number | null;
  /** Square currently under a dragged piece, for the hover ring. */
  hoverSquare: number | null;
  /** The square a piece has been lifted from — it renders empty while dragging. */
  draggingFrom: number | null;
  flipped: boolean;
  onSquare: (square: number) => void;
  onLift: (square: number, event: ReactPointerEvent) => void;
}

export function shieldStateOf(state: GameState, square: number): ShieldState {
  const piece = state.board[square];
  if (!piece || piece.ench !== 'taunt') return 'none';
  if (piece.shieldBroken) return 'broken';
  return isShielded(state.board, square) ? 'active' : 'dormant';
}

function describe(state: GameState, square: number): string {
  const piece = state.board[square];
  if (!piece) return squareName(square);
  const name = `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${squareName(square)}`;
  if (!piece.ench) return name;
  const shield = shieldStateOf(state, square);
  const shieldNote =
    piece.ench === 'taunt'
      ? shield === 'active'
        ? '\nShield: UP (defended, in your own half)'
        : shield === 'broken'
          ? '\nShield: spent. This piece is now ordinary'
          : inOwnHalf(piece.color, square)
            ? '\nShield: down (undefended right now)'
            : '\nShield: asleep (past the middle, in enemy ground)'
      : '';
  return `${name}\n\n${ENCH_NAME[piece.ench]}: ${ENCH_TEXT[piece.ench]}${shieldNote}`;
}

export function Board({
  state,
  selected,
  targets,
  breakTargets,
  bindTargets,
  powerTargets,
  lastMove,
  checkedKing,
  denySquare,
  hoverSquare,
  draggingFrom,
  flipped,
  onSquare,
  onLift,
}: BoardProps) {
  const order: number[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) order.push(rank * 8 + file);
  }
  const squares = flipped ? [...order].reverse() : order;

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="chess board">
        {squares.map((s) => {
          const piece = state.board[s];
          const dark = (fileOf(s) + rankOf(s)) % 2 === 0;
          const isTarget = targets.has(s);
          const isBreak = breakTargets.has(s);
          const isBind = bindTargets.has(s);
          const frozen = piece ? isFrozen(state, piece) : false;
          // Turns the piece has left before Destined Death collects it. Counted in the victim's
          // own moves, which is how the rule is stated and how a player counts.
          const doomIn = piece
            ? state.doomed.find((d) => d.pieceId === piece.id)
            : undefined;
          const shield = shieldStateOf(state, s);
          const classes = [
            'sq',
            dark ? 'sq-dark' : 'sq-light',
            selected === s ? 'sq-selected' : '',
            isTarget ? (piece ? 'sq-capture' : 'sq-move') : '',
            isBreak ? 'sq-break' : '',
            isBind ? 'sq-bind' : '',
            powerTargets.has(s) ? 'sq-power' : '',
            lastMove && (lastMove.from === s || lastMove.to === s) ? 'sq-last' : '',
            checkedKing === s ? 'sq-check' : '',
            denySquare === s ? 'sq-deny' : '',
            hoverSquare === s ? 'sq-hover' : '',
            draggingFrom === s ? 'sq-lifted' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={s}
              type="button"
              className={classes}
              data-square={s}
              onPointerDown={(e) => onLift(s, e)}
              onClick={() => onSquare(s)}
              title={describe(state, s)}
              aria-label={describe(state, s).split('\n')[0]}
            >
              {isBind && (
                /* A knot, not a hammer: a binding takes nothing and the mark should not read
                   like a strike. Same dark disc so the two affordances feel related. */
                <svg className="knot" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 6a4 4 0 0 1 0 8h10a4 4 0 0 1 0-8M7 10h10M6 17h12v2H6z" />
                </svg>
              )}
              {piece && (
                <PieceGlyph
                  type={piece.type}
                  color={piece.color}
                  ench={piece.ench}
                  shield={shield}
                  frozen={frozen}
                />
              )}
              {piece?.ench && shield !== 'broken' && (
                <EnchRune ench={piece.ench} shield={shield} />
              )}
              {doomIn && (
                /* The Open Board runs to the death sentence too: a marked piece and the number
                   of turns it has left are both on the table, always. */
                <span className="doom-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2.2 21 12l-9 9.8L3 12z" />
                  </svg>
                  <em>{Math.max(0, Math.ceil((doomIn.diesAtPly - state.ply) / 2))}</em>
                </span>
              )}
              {isTarget && <span className="hint" />}
              {isBreak && (
                <svg className="hammer" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13.6 2.4 21 9.8l-3.2 3.2-2.6-2.6-2.1 2.1 2.2 2.2-6.6 6.6a2 2 0 0 1-2.8-2.8l6.6-6.6-2.2-2.2 2.1-2.1 2.6 2.6z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      <div className="coords coords-file">
        {(flipped ? [...FILES].reverse() : [...FILES]).map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
      <div className="coords coords-rank">
        {(flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map((r) => (
          <span key={r}>{r}</span>
        ))}
      </div>
    </div>
  );
}
