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
import { ENCH_NAME } from './Pieces';
import { play } from './sound';

export function DrillsPage({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(loadDrilled);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [stepIx, setStepIx] = useState(0);
  const [state, setState] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [praise, setPraise] = useState<string | null>(null);
  const [deny, setDeny] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);

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
      // A swap renders as an ordinary destination: the drill text carries the difference.
      if (a.type === 'swap' && a.from === selected) {
        map.set(a.to, [...(map.get(a.to) ?? []), a as unknown as MoveAction]);
      }
    }
    return map;
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
              <span className="drill-name">
                {d.title}
                {done.includes(d.id) && <span className="drill-done"> ✓</span>}
              </span>
              <span className="drill-ench">{ENCH_NAME[d.id]}</span>
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
            powerTargets={new Set()}
            powerFlash={new Set()}
            lastMove={lastMove}
            checkedKing={null}
            denySquare={deny}
            hoverSquare={null}
            draggingFrom={null}
            flipped={false}
            onSquare={onSquare}
            onLift={(square) => onSquare(square)}
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
