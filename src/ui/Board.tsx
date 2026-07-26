import { useLayoutEffect, useRef } from 'react';
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
  /** Squares a King power *just* acted on, lit briefly so the turn does not pass in silence. */
  powerFlash: ReadonlySet<number>;
  lastMove: { from: number; to: number } | null;
  checkedKing: number | null;
  denySquare: number | null;
  /** Square currently under a dragged piece, for the hover ring. */
  hoverSquare: number | null;
  /** Square whose shield just took a blow — flashes the shatter ring (T2 made visible). */
  shatterSquare?: number | null;
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
  powerFlash,
  lastMove,
  checkedKing,
  denySquare,
  hoverSquare,
  shatterSquare = null,
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

  /* Pieces glide instead of teleporting: classic FLIP, keyed by the engine's stable piece id.
   *
   * After every render, each `.piece-slot` is measured; one that now stands somewhere else is
   * snapped back to where it was (transform, no transition) and released on the next frame, so
   * the browser animates it to rest. This is layout-blind on purpose — it needs no knowledge
   * of moves, so castling slides both King and rook, an engine reply slides the enemy piece,
   * and flipping the board glides all thirty-two at once.
   *
   * Drag-and-drop stays snappy for free: the lifted square renders empty, so the dragged
   * piece's slot is absent from the previous measurement and there is nothing to slide it
   * from. A piece the player carried by hand lands where they put it, dead.
   *
   * `prefers-reduced-motion` is honoured in the stylesheet: the transition is 0ms there, so
   * this effect degrades to exactly the old teleport. */
  const boardRef = useRef<HTMLDivElement>(null);
  const slotRects = useRef(new Map<number, { left: number; top: number }>());
  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const seen = new Map<number, { left: number; top: number }>();
    for (const el of root.querySelectorAll<HTMLElement>('.piece-slot')) {
      const id = Number(el.dataset.pieceId);
      const rect = el.getBoundingClientRect();
      seen.set(id, { left: rect.left, top: rect.top });
      const prev = slotRects.current.get(id);
      if (!prev) continue;
      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (dx === 0 && dy === 0) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.transform = '';
      });
    }
    slotRects.current = seen;
  });

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="chess board" ref={boardRef}>
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
            powerFlash.has(s) ? 'sq-power-fx' : '',
            lastMove && (lastMove.from === s || lastMove.to === s) ? 'sq-last' : '',
            checkedKing === s ? 'sq-check' : '',
            denySquare === s ? 'sq-deny' : '',
            shatterSquare === s ? 'sq-shatter' : '',
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
                <div className="piece-slot" data-piece-id={piece.id}>
                  <PieceGlyph
                    type={piece.type}
                    color={piece.color}
                    ench={piece.ench}
                    shield={shield}
                    frozen={frozen}
                  />
                  {piece.ench && shield !== 'broken' && (
                    <EnchRune ench={piece.ench} shield={shield} />
                  )}
                  {doomIn && (
                    /* The Open Board runs to the death sentence too: a marked piece and the
                       number of turns it has left are both on the table, always. Inside the
                       slot so the skull slides with the piece it is sentencing. */
                    <span className="doom-mark" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path
                          fillRule="evenodd"
                          d="M12 2.4c-4.3 0-7.8 3.2-7.8 7.3 0 2.4 1.2 4.2 2.6 5.3v3.5c0 .9.7 1.6 1.6 1.6h1.3v-2.5h1.5v2.5h1.6v-2.5h1.5v2.5h1.3c.9 0 1.6-.7 1.6-1.6V15c1.4-1.1 2.6-2.9 2.6-5.3 0-4.1-3.5-7.3-7.8-7.3ZM8.9 8.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6.2 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 13.1l1.1 2.3h-2.2Z"
                        />
                      </svg>
                      <em>{Math.max(0, Math.ceil((doomIn.diesAtPly - state.ply) / 2))}</em>
                    </span>
                  )}
                </div>
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
