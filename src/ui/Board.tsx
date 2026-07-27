import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FILES, fileOf, inOwnHalf, rankOf, squareName } from '../engine/board';
import { isFrozen } from '../engine/apply';
import { isShielded } from '../engine/movegen';
import { ENCH_TEXT } from '../engine/loadout';
import type { Enchantment, GameState, MoveAction, Piece } from '../engine/types';
import { EnchRune, PieceGlyph, PIECE_NAME, SHIELDING, type ShieldState } from './Pieces';
import { enchName } from './i18n';

export interface BoardProps {
  state: GameState;
  selected: number | null;
  targets: Map<number, MoveAction[]>;
  /** Squares holding a shielded enemy piece the selected piece may hammer (T2). */
  breakTargets: Set<number>;
  /** Squares holding an enemy piece the selected Archbishop may bind instead of taking. */
  bindTargets: Set<number>;
  /** Squares holding the Herald a selected Squire may change places with. */
  tradeTargets?: Set<number>;
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
  if (!piece || !SHIELDING.has(piece.ench ?? ('' as Enchantment))) return 'none';
  if (piece.shieldBroken) return 'broken';
  /* `isShielded` answers for both, and answers differently: Taunt has to be defended and at
   * home, the Aegis simply is. So an Aegis never shows the dormant crack — it is up or it is
   * spent, and there is no third state to draw. */
  return isShielded(state.board, square) ? 'active' : 'dormant';
}

function describe(state: GameState, square: number): string {
  const piece = state.board[square];
  if (!piece) return squareName(square);
  const name = `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${squareName(square)}`;
  // The chains say "bound"; the words say for how long (spec §4: chains + duration). It is
  // always one turn — every binding in the game expires at the end of its owner's next turn.
  const bound = isFrozen(state, piece) ? '\nBound: cannot move this turn. It still attacks and defends.' : '';
  if (!piece.ench) return name + bound;
  const shield = shieldStateOf(state, square);
  const shieldNote =
    piece.ench === 'shield'
      ? shield === 'broken'
        ? '\nShield: spent. This piece is now ordinary'
        : '\nShield: UP — it cannot be taken in one turn'
      : piece.ench === 'taunt'
      ? shield === 'active'
        ? '\nShield: UP (defended, in your own half)'
        : shield === 'broken'
          ? '\nShield: spent. This piece is now ordinary'
          : inOwnHalf(piece.color, square)
            ? '\nShield: down (undefended right now)'
            : '\nShield: asleep (past the middle, in enemy ground)'
      : '';
  return `${name}${bound}\n\n${enchName(piece.ench)}: ${ENCH_TEXT[piece.ench]}${shieldNote}`;
}

/* The same square in one line, for the name a screen reader actually reads out.
 *
 * `describe` is written for a tooltip: several lines, a blank line, then the full rules text of
 * whatever the piece is carrying. The accessible name was taking `.split('\n')[0]` of it, which
 * is the bare "White Pawn on a2" — so a Poison pawn, a Taunt piece with its shield up and a
 * piece bound by Martyr all announced themselves as ordinary pawns, and the entire layer this
 * game is built on was inaudible. There is no hover on a phone either, so for a touch screen
 * reader the information did not exist anywhere.
 *
 * This is deliberately terse. A label is heard on every square a finger passes over, so it names
 * the things that change what the piece *is* — its enchantment, whether the shield is currently
 * up, whether it may move at all — and leaves the rules text to the tooltip that has room. */
export function label(state: GameState, square: number): string {
  const piece = state.board[square];
  if (!piece) return squareName(square);
  const parts = [`${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${squareName(square)}`];
  if (piece.ench) {
    const shield = SHIELDING.has(piece.ench) ? shieldStateOf(state, square) : null;
    parts.push(
      shield === null
        ? enchName(piece.ench)
        : shield === 'active'
          ? `${enchName(piece.ench)}, shield up`
          : shield === 'broken'
            ? `${enchName(piece.ench)}, shield spent`
            : inOwnHalf(piece.color, square)
              ? `${enchName(piece.ench)}, shield down`
              : `${enchName(piece.ench)}, shield asleep`,
    );
  }
  if (isFrozen(state, piece)) parts.push('bound this turn');
  return parts.join(', ');
}

export function Board({
  state,
  selected,
  targets,
  breakTargets,
  bindTargets,
  tradeTargets,
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

  /* The two changes the slide cannot show, shown here.
   *
   * A capture removes its piece from the state, so by the time React renders there is nothing
   * left to animate — the victim simply stops existing between frames. So the previous board is
   * diffed against the new one, and a departed piece leaves a short-lived ghost fading on the
   * square it died on, underneath the capturer sliding in. Capped at three departures: one is a
   * capture, two is Poison, three is Immolation at full burn — anything more is not a move, it
   * is the review slider jumping, and a screenful of ghosts there would be noise.
   *
   * A promotion keeps the piece's id and changes its type, which the slide renders as an
   * unceremonious costume change. Those ids get a beat of crowning instead. */
  interface Ghost {
    id: number;
    square: number;
    piece: Piece;
  }
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([]);
  const [crowned, setCrowned] = useState<ReadonlySet<number>>(new Set());
  /* The Book of Immolation kills three pieces at once and looks, on the board, like an
   * ordinary capture that took some bystanders with it. The ghosts show *that* they died;
   * nothing showed *why*. These are the squares the fire took — everything that departed
   * except the burning pawn itself — and they scorch for a beat. */
  const [burned, setBurned] = useState<ReadonlySet<number>>(new Set());
  const prevBoardRef = useRef<GameState['board'] | null>(null);
  useEffect(() => {
    const prev = prevBoardRef.current;
    prevBoardRef.current = state.board;
    if (!prev || prev === state.board) return;
    const now = new Map<number, Piece>();
    for (const piece of state.board) if (piece) now.set(piece.id, piece);
    const departed: Ghost[] = [];
    const risen = new Set<number>();
    prev.forEach((piece, square) => {
      if (!piece) return;
      const cur = now.get(piece.id);
      if (!cur) departed.push({ id: piece.id, square, piece });
      else if (cur.type !== piece.type) risen.add(piece.id);
    });
    const timers: number[] = [];
    if (departed.length > 0 && departed.length <= 3) {
      setGhosts(departed);
      timers.push(window.setTimeout(() => setGhosts([]), 340));
    }
    const pyre = departed.find((d) => d.piece.ench === 'immolation');
    if (pyre && departed.length > 1) {
      setBurned(new Set(departed.filter((d) => d.id !== pyre.id).map((d) => d.square)));
      timers.push(window.setTimeout(() => setBurned(new Set()), 620));
    }
    if (risen.size > 0) {
      setCrowned(risen);
      timers.push(window.setTimeout(() => setCrowned(new Set()), 700));
    }
    return () => timers.forEach(clearTimeout);
  }, [state.board]);

  /* Pieces glide instead of teleporting, computed from the squares they stand on.
   *
   * The first version of this measured every `.piece-slot` with getBoundingClientRect on every
   * render, and each of those three words was a bug:
   *
   *   every render — no dependency array, so a drag (which re-renders per frame) forced 32
   *     synchronous reflows a frame, and the board juddered under the finger;
   *   getBoundingClientRect — viewport-relative, so *scrolling the page* changed every rect and
   *     the next render slid all thirty-two pieces to chase a scroll that was not a move;
   *   ...and it reports transformed positions, so a render landing inside the 150ms slide
   *     measured a piece mid-flight and animated again from there, compounding the jitter.
   *
   * A chessboard is a uniform grid and the engine already says which square each piece stands
   * on, so the delta is arithmetic: one clientWidth read for the cell size — a layout value,
   * immune to both scrolling and transforms — and no per-piece measurement at all. It runs only
   * when the board actually changes.
   *
   * `prefers-reduced-motion` is honoured in the stylesheet: the transition is 0ms there, so
   * this degrades to exactly the old teleport. */
  const boardRef = useRef<HTMLDivElement>(null);
  const placesRef = useRef<{ flipped: boolean; at: Map<number, number> } | null>(null);
  /* A piece the player carried there by hand is already where they put it; sliding it back to
   * its origin to re-play the move is the one animation a drag must never have. */
  const draggedRef = useRef(false);
  useEffect(() => {
    draggedRef.current = draggingFrom !== null;
  }, [draggingFrom]);

  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const at = new Map<number, number>();
    for (let square = 0; square < 64; square++) {
      const piece = state.board[square];
      if (piece) at.set(piece.id, square);
    }
    const prev = placesRef.current;
    placesRef.current = { flipped, at };
    // Layout effects run before passive ones in the same commit, so on the drop this still
    // reads the flag the lift set — and clears it, so an aborted drag cannot silence the
    // move that follows it.
    const dropped = draggedRef.current;
    draggedRef.current = false;
    // First paint, a board that turned round, or a piece just dropped by hand: in each case
    // everything is already where it belongs.
    if (!prev || prev.flipped !== flipped || dropped) return;

    const cell = root.clientWidth / 8;
    if (!cell) return;
    const dir = flipped ? -1 : 1;
    const moved: HTMLElement[] = [];
    for (const [id, to] of at) {
      const from = prev.at.get(id);
      if (from === undefined || from === to) continue;
      const el = root.querySelector<HTMLElement>(`.piece-slot[data-piece-id="${id}"]`);
      if (!el) continue;
      // Rank rises up the screen, so a rank gained is a downward offset to slide out of.
      const dx = ((from % 8) - (to % 8)) * cell * dir;
      const dy = ((to >> 3) - (from >> 3)) * cell * dir;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(el);
    }
    // A move shifts one piece, or two when a King castles. Anything more is the review slider
    // jumping or a scenario being loaded, and thirty-two pieces crossing the board at once is
    // not information, it is noise.
    if (moved.length === 0 || moved.length > 2) {
      for (const el of moved) {
        el.style.transition = '';
        el.style.transform = '';
      }
      return;
    }
    const frame = requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = '';
        el.style.transform = '';
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [state.board, flipped]);

  return (
    <div className="board-wrap">
      <div className="board" role="grid" aria-label="chess board" ref={boardRef}>
        {squares.map((s) => {
          const piece = state.board[s];
          const dark = (fileOf(s) + rankOf(s)) % 2 === 0;
          const isTarget = targets.has(s);
          const isBreak = breakTargets.has(s);
          const isBind = bindTargets.has(s);
          const isTrade = tradeTargets?.has(s) ?? false;
          const frozen = piece ? isFrozen(state, piece) : false;
          /* Spec §4 asks a held piece to show chains *and* how long it is held, and the number
           * is not decoration: a Decree or a Martyr's grip lasts one turn, an Archbishop's
           * binding lasts two, and the chains look identical. Counted in the victim's own
           * turns, the way the doom skull counts, because that is how a player counts. */
          const heldFor = frozen
            ? Math.max(
                1,
                Math.ceil(
                  ((state.frozen.find((f) => f.pieceId === piece!.id)?.untilPly ?? state.ply) -
                    state.ply) / 2,
                ),
              )
            : 0;
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
            isTrade ? 'sq-trade' : '',
            powerTargets.has(s) ? 'sq-power' : '',
            powerFlash.has(s) ? 'sq-power-fx' : '',
            lastMove && (lastMove.from === s || lastMove.to === s) ? 'sq-last' : '',
            checkedKing === s ? 'sq-check' : '',
            checkedKing === s && state.status.kind === 'checkmate' ? 'sq-fallen' : '',
            denySquare === s ? 'sq-deny' : '',
            shatterSquare === s ? 'sq-shatter' : '',
            burned.has(s) ? 'sq-burned' : '',
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
              aria-label={label(state, s)}
            >
              {isTrade && (
                /* Two pawns changing places, not a capture and not a step: the arrows say the
                   piece you are pointing at is coming back the other way. */
                <svg className="trade-mark" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9h12l-3-3 1.4-1.4L20 10l-5.6 5.4L13 14l3-3H4zM20 15H8l3 3-1.4 1.4L4 14l5.6-5.4L11 10l-3 3h12z" />
                </svg>
              )}
              {isBind && (
                /* A knot, not a hammer: a binding takes nothing and the mark should not read
                   like a strike. Same dark disc so the two affordances feel related. */
                <svg className="knot" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 6a4 4 0 0 1 0 8h10a4 4 0 0 1 0-8M7 10h10M6 17h12v2H6z" />
                </svg>
              )}
              {ghosts.map((g) =>
                g.square === s ? (
                  <div className="piece-ghost" key={`ghost-${g.id}`} aria-hidden="true">
                    <PieceGlyph
                      type={g.piece.type}
                      color={g.piece.color}
                      ench={g.piece.ench}
                      shield="none"
                    />
                  </div>
                ) : null,
              )}
              {piece && (
                <div
                  className={`piece-slot ${crowned.has(piece.id) ? 'slot-crowned' : ''}`}
                  data-piece-id={piece.id}
                >
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
                  {frozen && (
                    <span className="hold-mark" aria-hidden="true">
                      {heldFor}
                    </span>
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
