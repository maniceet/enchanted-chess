/* The Innkeeper's table — the set-piece drills, rendered.
 *
 * Everything that decides is in drills.ts; this file only shows. One rule of interaction worth
 * stating: an action that is legal but is not the step's goal is *reverted*, not accepted. A
 * set piece is a sentence with one verb, and letting the player wander the position until it no
 * longer demonstrates anything would quietly break the only thing the screen is for. The
 * Innkeeper repeats himself instead, which is very much in character.
 */

import { useMemo, useState } from 'react';
import { applyAction, legalActions } from '../engine/apply';
import { isError } from '../engine/types';
import type { Action, GameState, MoveAction } from '../engine/types';
import { Board } from './Board';
import { DRILLS, loadDrilled, rememberDrilled, type Drill } from './drills';
import { EnchRune } from './Pieces';
import { play } from './sound';
import { enchName } from './i18n';

export function DrillsPage({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(loadDrilled);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [stepIx, setStepIx] = useState(0);
  const [state, setState] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [praise, setPraise] = useState<string | null>(null);
  const [deny, setDeny] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [shatter, setShatter] = useState<number | null>(null);

  const step = drill?.steps[stepIx] ?? null;
  const finished = drill !== null && stepIx >= drill.steps.length;

  const open = (next: Drill) => {
    play('select');
    setDrill(next);
    setStepIx(0);
    setState(next.start());
    setSelected(null);
    setPraise(null);
    setDeny(null);
    setLastMove(null);
  };

  const legal = useMemo(() => (state ? legalActions(state) : []), [state]);

  /** Everything the selected piece may do, shaped the way Board wants it. */
  const targets = useMemo(() => {
    const map = new Map<number, MoveAction[]>();
    if (selected === null) return map;
    for (const a of legal) {
      if (a.type === 'move' && a.from === selected) {
        map.set(a.to, [...(map.get(a.to) ?? []), a]);
      }

    }
    return map;
  }, [legal, selected]);

  /* The Squire's trade gets the same mark here as it does in a game — arrows, not a move dot.
   * A tutorial that draws a move differently from the board it is teaching is teaching the
   * wrong board, and this one was drawing a swap as an ordinary destination. */
  const tradeTargets = useMemo(() => {
    const set = new Set<number>();
    if (selected === null) return set;
    for (const a of legal) if (a.type === 'swap' && a.from === selected) set.add(a.to);
    return set;
  }, [legal, selected]);

  const breakTargets = useMemo(() => {
    const set = new Set<number>();
    if (selected === null) return set;
    for (const a of legal) if (a.type === 'shieldBreak' && a.from === selected) set.add(a.target);
    return set;
  }, [legal, selected]);

  const attempt = (action: Action) => {
    if (!state || !step || !drill) return;
    const after = applyAction(state, action);
    if (isError(after)) {
      setDeny(action.type === 'move' || action.type === 'swap' ? action.to : null);
      play('illegal');
      return;
    }
    if (!step.done(state, action, after)) {
      // Legal, but not the lesson. The position stays as set; the Innkeeper says it again.
      setDeny(action.type === 'move' || action.type === 'swap' ? action.to : selected);
      play('illegal');
      setSelected(null);
      return;
    }
    play(action.type === 'shieldBreak' ? 'capture' : 'move');
    if (action.type === 'shieldBreak') {
      // The same shatter the game shows: the drill is where the rule is being taught, so this
      // is the one place the effect must never be missing.
      setShatter(action.target);
      window.setTimeout(() => setShatter(null), 600);
    }
    const settled = step.reply ? (applyAction(after, step.reply) as GameState) : after;
    setState(isError(settled) ? after : settled);
    setLastMove(
      action.type === 'move' || action.type === 'swap'
        ? { from: action.from, to: action.to }
        : action.type === 'shieldBreak'
          ? { from: action.from, to: action.target }
          : null,
    );
    setPraise(step.praise);
    setSelected(null);
    setDeny(null);
    const next = stepIx + 1;
    setStepIx(next);
    if (next >= drill.steps.length) setDone(rememberDrilled(done, drill.id));
  };

  const onSquare = (square: number) => {
    if (!state || finished) return;
    setDeny(null);
    if (selected !== null) {
      const viaMove = targets.get(square)?.[0];
      if (viaMove) {
        // The drill auto-crowns a queen: a promotion picker teaches nothing here and the
        // Herald's praise line already names the choice as the player's in a real game.
        const promoted =
          viaMove.type === 'move' && needsPromo(viaMove, state)
            ? { ...viaMove, promo: 'q' as const }
            : viaMove;
        attempt(promoted);
        return;
      }
      if (breakTargets.has(square)) {
        attempt({ type: 'shieldBreak', from: selected, target: square });
        return;
      }
      if (tradeTargets.has(square)) {
        const trade = legal.find(
          (a) => a.type === 'swap' && a.from === selected && a.to === square,
        );
        if (trade) attempt(trade);
        return;
      }
    }
    const piece = state.board[square];
    if (piece && piece.color === state.turn) {
      play('select');
      setSelected(square === selected ? null : square);
      return;
    }
    setSelected(null);
  };

  return (
    <div className="drills">
      <header className="screen-head">
        <div>
          <h2 className="screen-title">The Innkeeper’s table</h2>
          <p className="screen-sub">
            One small board per enchantment. He sets the pieces; you make the move that shows
            you what the rule feels like.
          </p>
        </div>
      </header>

      {!drill && (
        <div className="drill-list">
          {DRILLS.map((d) => (
            <button type="button" key={d.id} className="drill-card" onClick={() => open(d)}>
              <EnchRune ench={d.id} shield={d.id === 'taunt' ? 'dormant' : undefined} />
              <span className="drill-text">
                <span className="drill-name">
                  {d.title}
                  {done.includes(d.id) && <span className="drill-done"> ✓</span>}
                </span>
                <span className="drill-ench">{enchName(d.id)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {drill && state && (
        <div className="drill-stage">
          <p className="drill-say">
            {finished ? (praise ?? 'Done.') : praise ? `${praise} — ${step?.say ?? ''}` : step?.say}
          </p>
          <Board
            state={state}
            selected={selected}
            targets={targets}
            breakTargets={breakTargets}
            bindTargets={new Set()}
            tradeTargets={tradeTargets}
            powerTargets={new Set()}
            powerFlash={new Set()}
            lastMove={lastMove}
            checkedKing={null}
            denySquare={deny}
            shatterSquare={shatter}
            hoverSquare={null}
            draggingFrom={null}
            flipped={false}
            onSquare={onSquare}
            /* Deliberately inert. `onLift` fires on pointer-down and `onSquare` on click, so
               routing both into the same handler selected a piece on press and immediately
               deselected it on release — only press-and-hold "worked". The drills are
               click-to-move only; the game screen is where dragging lives. */
            onLift={() => {}}
          />
          <div className="drill-actions">
            <button type="button" onClick={() => open(drill)}>
              Set the pieces again
            </button>
            <button type="button" onClick={() => setDrill(null)}>
              {finished ? 'Back to the table' : 'Another lesson'}
            </button>
          </div>
        </div>
      )}

      <footer className="screen-foot">
        <button type="button" onClick={drill ? () => setDrill(null) : onBack}>
          Back
        </button>
      </footer>
    </div>
  );
}

/** A pawn move that the engine will only accept with a promotion choice attached. */
function needsPromo(action: MoveAction, state: GameState): boolean {
  const piece = state.board[action.from];
  if (!piece || piece.type !== 'p') return false;
  const rank = Math.floor(action.to / 8);
  const crown = piece.ench === 'herald' ? (piece.color === 'w' ? 6 : 1) : piece.color === 'w' ? 7 : 0;
  return rank === crown;
}
