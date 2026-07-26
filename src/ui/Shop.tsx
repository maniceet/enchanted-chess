import { ENCH_TEXT } from '../engine/loadout';
import type { Enchantment } from '../engine/types';
import { ENCH_NAME, EnchRune } from './Pieces';
import { play } from './sound';
import { PRICE, SPELLBOOK, canAfford, type RunState } from './run';

/** The Sorcerer's back room. He opens it the first time the Innkeeper falls, and after that he
 *  is always in, because he is paid in the coin of other people's defeats.
 *
 *  Everything here is permanent. Enchantments bought stay bought through every failed run, and
 *  that is the only thing that carries: the road itself resets to the bottom every time. */

interface ShopProps {
  run: RunState;
  onBuy: (ench: Enchantment) => void;
  onBack: () => void;
}

const FLAVOUR: Record<Enchantment, string> = {
  squire: 'He carries the arms. He does not wear the crown.',
  taunt: 'Steel for standing in.',
  martyr: 'A death that costs them a turn.',
  outpost: 'No pawn will touch it.',
  swift: 'Two ranks, always, not just the first.',
  herald: 'A crown one rank early.',
  poison: 'Whatever eats this dies of it.',
  immolation: 'It takes the ground with it.',
};

export function Shop({ run, onBuy, onBack }: ShopProps) {
  const spent = run.taught.length;

  return (
    <div className="shop">
      <div className="shop-topbar">
        <span className="coin-pill">
          <span className="coin-mark">◈</span>
          {run.gold}
        </span>
      </div>

      <div className="shop-panel">
        <div className="shop-banner">The Sorcerer</div>
        <p className="shop-sub">Spend what the road paid you</p>

        <div className="shop-grid">
          {SPELLBOOK.map((ench) => {
            const owned = run.taught.includes(ench);
            const affordable = canAfford(run, ench);
            const state = owned ? 'owned' : affordable ? 'open' : 'dear';
            return (
              <button
                type="button"
                key={ench}
                className={`shop-card shop-${state}`}
                disabled={!affordable}
                onClick={() => {
                  if (!affordable) return;
                  play('power');
                  onBuy(ench);
                }}
                title={ENCH_TEXT[ench]}
              >
                <span className="shop-tile">
                  <EnchRune ench={ench} shield={ench === 'taunt' ? 'active' : undefined} />
                </span>
                <span className="shop-name">{ENCH_NAME[ench]}</span>
                <span className="shop-flavour">{FLAVOUR[ench]}</span>
                <span className={`shop-price ${owned ? 'shop-price-owned' : ''}`}>
                  {owned ? 'learned' : `${PRICE[ench]} ◈`}
                </span>
              </button>
            );
          })}
        </div>

        <p className="shop-foot">
          {spent === SPELLBOOK.length
            ? 'The book is full. Everything he knows, you know.'
            : `${spent}/${SPELLBOOK.length} learned. What you buy here survives every defeat; the road does not.`}
        </p>
      </div>

      <div className="menu-actions">
        <button type="button" onClick={onBack}>
          ← Back to the inn
        </button>
      </div>
    </div>
  );
}
