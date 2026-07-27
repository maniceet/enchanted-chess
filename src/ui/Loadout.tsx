import { useState } from 'react';
import { parseSquare, squareName } from '../engine/board';
import {
  BUDGET,
  CARRIER_MULTIPLIER,
  ENCH_COST,
  ENCH_TEXT,
  ENCHANTMENTS,
  POWER_NAMES,
  POWER_TEXT,
  carrierError,
  costOf,
  validateLoadout,
  type Loadout,
} from '../engine/loadout';
import type { Color, Enchantment, GameState, PowerName } from '../engine/types';
import { ENCH_NAME, EnchRune, ManaMeter, PieceGlyph, PIECE_NAME } from './Pieces';
import { play } from './sound';

const ALL_POWERS: PowerName[] = ['teleport', 'relocate', 'decree', 'revive', 'chrono'];
/** Everything a King can be given, from the engine's own list, including the one nobody is
 *  offered by default: Destined Death belongs to Wittex, and a traveller only holds it because
 *  the road handed them the Dark Word. Grantable, never in the standard set. */
const EVERY_POWER: PowerName[] = POWER_NAMES;
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
  const offeredPowers = powers ? EVERY_POWER.filter((p) => powers.includes(p)) : ALL_POWERS;
  /** A King may carry up to three words. Three rather than all of them because the choice is
   *  the point: holding every word is the same as holding none, since nothing is given up. */
  const MAX_WORDS = 3;
  const chosen: PowerName[] = loadout.powers ? [...loadout.powers] : [loadout.power];
  const toggleWord = (word: PowerName) => {
    const has = chosen.includes(word);
    // Never empty: a King with no words at all is the silent-King state, which the road grants
    // and the builder must not be able to produce by unticking the last box.
    const next = has
      ? chosen.filter((w) => w !== word)
      : [...chosen, word].slice(-MAX_WORDS);
    if (!next.length) return;
    play('power');
    onChange({ ...loadout, powers: next, power: next[0] });
  };

  const assign = (square: string, ench: Enchantment | null) => {
    // The road's enchantment is not a slot (see the locked panel below): anything bought on
    // that square is overwritten by the engine at the first move, so refuse it at the source.
    if (state.board[parseSquare(square)]?.ench) return;
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
          {/* Points only read as *held* when something is actually holding them: Revive is
              paid for out of what you did not spend, and without a Revive in the King's words
              every unspent point is simply free. Passing the reserve unconditionally made the
              whole meter look reserved before a single choice had been made. */}
          <ManaMeter
            spent={check.spent}
            total={budget}
            reserved={chosen.includes('revive') ? check.reserve : 0}
          />
          <span className="budget-label">
            used · {check.reserve} reserved
            {/* Any of the three words may be Revive; this read only the first. */}
            {chosen.includes('revive') ? ' for Revive' : ''}
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
                const bought = loadout.enchantments[name] ?? null;
                /* What the road put there, as opposed to what the player bought. Venom picks a
                 * pawn for you and Fortification picks a rook, so this is the only place the
                 * player can find out *which* — and they need to know while choosing, because a
                 * Poison pawn is worth building around. */
                const given = piece.ench ?? null;
                // Given first: the engine applies the road's enchantment after the player's, so
                // if both somehow name this square, the gift is what the game will play.
                const ench = given ?? bought;
                const isKing = piece.type === 'k';
                return (
                  <button
                    type="button"
                    key={name}
                    className={`loadout-cell ${selected === name ? 'is-selected' : ''} ${
                      ench ? 'has-ench' : ''
                    } ${!bought && given ? 'is-given' : ''} ${isKing ? 'is-king' : ''}`}
                    title={!bought && given ? `${name}: given by the road` : undefined}
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
                  Your King carries{' '}
                  <strong className="hint-strong">
                    {chosen.map((w) => POWER_NAME[w]).join(', ')}
                  </strong>
                  . Click the King to change {chosen.length === 1 ? 'it' : 'them'}.
                </p>
              )}
              <p className="muted immunity">“The King bows to no enchantment.”</p>
            </div>
          )}

          {/* The power picker only opens when the King is actually selected. */}
          {selectedPiece?.type === 'k' && (
            <div className="panel">
              <h3>King’s words, choose up to three</h3>
              <p className="muted">
                Each is spoken once, and spending one leaves the others. Which of the three a
                position wants is the decision — carrying all of them would not be one.
              </p>
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
                  const active = chosen.includes(power);
                  const full = chosen.length >= MAX_WORDS && !active;
                  const needsReserve = power === 'revive';
                  return (
                    <button
                      type="button"
                      key={power}
                      className={`power-card ${active ? 'is-active' : ''} ${full ? 'is-full' : ''}`}
                      disabled={full}
                      title={full ? `Three already chosen. Drop one first.` : undefined}
                      onClick={() => toggleWord(power)}
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

          {/* A piece the road already enchanted — the Venom pawn, a fortified rook — is not a
              slot, it is a gift. One enchantment per piece is the law of the game, and the
              engine applies the road's after the player's, so anything bought here would be
              silently overwritten at the first move: points spent on nothing. Locked, and said
              so, rather than allowed and wasted. */}
          {selected && selectedPiece && selectedPiece.type !== 'k' && selectedPiece.ench && (
            <div className="panel">
              <h3>
                {PIECE_NAME[selectedPiece.type]} on {selected}
                <span className="mult"> · given by the road</span>
              </h3>
              <p className="muted">
                <EnchRune
                  ench={selectedPiece.ench}
                  shield={selectedPiece.ench === 'taunt' ? 'dormant' : undefined}
                />{' '}
                This {PIECE_NAME[selectedPiece.type].toLowerCase()} already carries{' '}
                <strong className="hint-strong">{ENCH_NAME[selectedPiece.ench]}</strong>.
              </p>
              <p className="ench-why">
                One enchantment per piece — what the road gives cannot be traded away or written
                over. Build around it.
              </p>
            </div>
          )}

          {selected && selectedPiece && selectedPiece.type !== 'k' && !selectedPiece.ench && (
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
              King’s words: <strong>{chosen.map((w) => POWER_NAME[w]).join(' · ')}</strong>
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
