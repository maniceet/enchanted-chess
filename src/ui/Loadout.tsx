import { useState } from 'react';
import { parseSquare, squareName } from '../engine/board';
import {
  BUDGET,
  CARRIER_MULTIPLIER,
  ENCH_COST,
  ENCH_TEXT,
  ENCHANTMENTS,
  POWER_TEXT,
  carrierError,
  costOf,
  validateLoadout,
  type Loadout,
} from '../engine/loadout';
import type { Color, Enchantment, GameState, PowerName } from '../engine/types';
import { ENCH_NAME, EnchRune, PieceGlyph, PIECE_NAME } from './Pieces';
import { play } from './sound';

const ALL_POWERS: PowerName[] = ['teleport', 'relocate', 'decree', 'revive', 'chrono'];
const POWER_NAME: Record<PowerName, string> = {
  teleport: 'Teleport',
  relocate: 'Relocate',
  decree: 'Decree',
  revive: 'Revive',
  doom: 'Destined Death',
  chrono: 'Time Manipulation',
};

export interface LoadoutProps {
  state: GameState;
  color: Color;
  loadout: Loadout;
  onChange: (next: Loadout) => void;
  onDone: () => void;
  onBack: () => void;
  doneLabel?: string;
  subtitle?: string;
  heading?: string;
  /** Enchantments this side may spend on. Omitted means everything, which is what online play
   *  and the sorting chest want: a stranger has not earned anything off you. On the road it is
   *  whatever the Sorcerer has taught, and the rest are shown locked rather than hidden, so a
   *  player can see what is worth saving for. */
  book?: readonly Enchantment[];
  /** Points to spend. Four in a duel; on the road it is the traveller's mana. */
  budget?: number;
  /** Powers the King may choose. Omitted means all of them; an empty list means the King has
   *  no Divine Call yet and simply moves. */
  powers?: readonly PowerName[];
}

export function LoadoutBuilder({
  state,
  color,
  loadout,
  onChange,
  onDone,
  onBack,
  doneLabel,
  subtitle,
  heading,
  book,
  budget = BUDGET,
  powers,
}: LoadoutProps) {
  const rows = color === 'w' ? [1, 0] : [6, 7];
  const [selected, setSelected] = useState<string | null>(null);
  const check = validateLoadout(state, color, loadout, budget);
  const selectedPiece = selected ? state.board[parseSquare(selected)] : null;
  const knows = (ench: Enchantment) => !book || book.includes(ench);
  const offeredPowers = powers ? ALL_POWERS.filter((p) => powers.includes(p)) : ALL_POWERS;

  const assign = (square: string, ench: Enchantment | null) => {
    const next = { ...loadout.enchantments };
    if (ench) next[square] = ench;
    else delete next[square];
    play(ench ? 'power' : 'select');
    onChange({ ...loadout, enchantments: next });
  };

  return (
    <div className="loadout">
      <header className="screen-head">
        <div>
          <h2 className="screen-title">
            {heading ?? `${color === 'w' ? 'White' : 'Black'}: choose your enchantments`}
          </h2>
          <p className="screen-sub">
            {subtitle ??
              `${budget} ${budget === 1 ? 'point' : 'points'}. One enchantment per piece. Everything you pick is shown to your opponent before the first move. That is the Open Board.`}
          </p>
        </div>
        <div className={`budget ${check.spent > budget ? 'budget-over' : ''}`}>
          <span className="budget-num">
            {check.spent}/{budget}
          </span>
          <span className="budget-label">
            used · {check.reserve} reserved
            {loadout.power === 'revive' ? ' for Revive' : ''}
          </span>
        </div>
      </header>

      <div className="loadout-body">
        <div className="loadout-board">
          {rows.map((rank) => (
            <div className="loadout-row" key={rank}>
              {Array.from({ length: 8 }, (_, file) => {
                const index = rank * 8 + file;
                const name = squareName(index);
                const piece = state.board[index];
                if (!piece) return <div className="loadout-cell empty" key={name} />;
                const ench = loadout.enchantments[name] ?? null;
                const isKing = piece.type === 'k';
                return (
                  <button
                    type="button"
                    key={name}
                    className={`loadout-cell ${selected === name ? 'is-selected' : ''} ${
                      ench ? 'has-ench' : ''
                    } ${isKing ? 'is-king' : ''}`}
                    onClick={() => {
                      play('select');
                      setSelected(name === selected ? null : name);
                    }}
                  >
                    <PieceGlyph
                      type={piece.type}
                      color={color}
                      ench={ench}
                      shield={ench === 'taunt' ? 'dormant' : 'none'}
                    />
                    {ench && <EnchRune ench={ench} shield={ench === 'taunt' ? 'dormant' : undefined} />}
                    <span className="cell-square">{name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="loadout-panel">
          {!selected && (
            <div className="panel">
              <h3>Pick a piece</h3>
              <p className="muted">
                Click any piece above to enchant it.
              </p>
              {offeredPowers.length === 0 ? (
                <p className="muted">
                  Your King carries <strong className="hint-strong">no power</strong> yet. Beat
                  Princess Rolain and he learns the Divine Call.
                </p>
              ) : (
                <p className="muted">
                  Your King already carries{' '}
                  <strong className="hint-strong">{POWER_NAME[loadout.power]}</strong>. Click the
                  King to change it.
                </p>
              )}
              <p className="muted immunity">“The King bows to no enchantment.”</p>
            </div>
          )}

          {/* The power picker only opens when the King is actually selected. */}
          {selectedPiece?.type === 'k' && (
            <div className="panel">
              <h3>King’s power, choose exactly one</h3>
              <p className="muted immunity">
                The King can never be enchanted, is immune to Poison and Martyr, and cannot be
                named by Decree.
              </p>
              {offeredPowers.length === 0 && (
                <p className="ench-why">
                  Your King has no Divine Call yet. Beat Princess Rolain and he learns to speak
                  once a game; until then he only moves, like everyone else.
                </p>
              )}
              <div className="power-cards">
                {offeredPowers.map((power) => {
                  const active = loadout.power === power;
                  const needsReserve = power === 'revive';
                  return (
                    <button
                      type="button"
                      key={power}
                      className={`power-card ${active ? 'is-active' : ''}`}
                      onClick={() => {
                        play('power');
                        onChange({ ...loadout, power });
                      }}
                    >
                      <span className="power-name">{POWER_NAME[power]}</span>
                      <span className="power-text">{POWER_TEXT[power]}</span>
                      {needsReserve && (
                        <span className={`power-reserve ${check.reserve < 1 ? 'is-bad' : ''}`}>
                          reserve now: {check.reserve} point{check.reserve === 1 ? '' : 's'}
                          {check.reserve < 1 ? '. Leave points unspent to use it' : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selected && selectedPiece && selectedPiece.type !== 'k' && (
            <div className="panel">
              <h3>
                {PIECE_NAME[selectedPiece.type]} on {selected}
                <span className="mult"> ×{CARRIER_MULTIPLIER[selectedPiece.type]} carrier</span>
              </h3>
              <ul className="ench-list">
                {ENCHANTMENTS.map((ench) => {
                  const unlearned = !knows(ench);
                  const illegal = carrierError(ench, selectedPiece.type);
                  const cost = costOf(ench, selectedPiece.type);
                  const current = loadout.enchantments[selected] ?? null;
                  const spentWithout = check.spent - (current ? costOf(current, selectedPiece.type) : 0);
                  const unaffordable = !illegal && spentWithout + cost > budget;
                  const disabled = unlearned || Boolean(illegal) || unaffordable;
                  const active = current === ench;
                  return (
                    <li key={ench}>
                      <button
                        type="button"
                        className={`ench-row ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''} ${unlearned ? 'is-unlearned' : ''}`}
                        disabled={disabled && !active}
                        onClick={() => assign(selected, active ? null : ench)}
                      >
                        <EnchRune ench={ench} shield={ench === 'taunt' ? 'dormant' : undefined} />
                        <span className="ench-main">
                          <span className="ench-title">
                            {ENCH_NAME[ench]}
                            <span className="ench-cost">
                              {ENCH_COST[ench]} × {CARRIER_MULTIPLIER[selectedPiece.type]} ={' '}
                              <strong>{cost}</strong>
                            </span>
                          </span>
                          <span className="ench-text">{ENCH_TEXT[ench]}</span>
                          {unlearned && (
                            <span className="ench-why">
                              The Sorcerer has not taught you this one yet.
                            </span>
                          )}
                          {illegal && !unlearned && <span className="ench-why">{illegal}</span>}
                          {unaffordable && !illegal && !unlearned && (
                            <span className="ench-why">
                              costs {cost}, only {budget - spentWithout} left
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <footer className="screen-foot">
        <button type="button" onClick={onBack}>
          Back
        </button>
        <span className="power-chosen">
          {offeredPowers.length === 0 ? (
            <>
              King’s power: <strong>none yet</strong>
            </>
          ) : (
            <>
              King’s power: <strong>{POWER_NAME[loadout.power]}</strong>
            </>
          )}
        </span>
        <button type="button" className="primary" onClick={onDone} disabled={!check.ok}>
          {doneLabel ?? (color === 'w' ? 'Black’s turn to build →' : 'Reveal both loadouts →')}
        </button>
      </footer>
    </div>
  );
}
