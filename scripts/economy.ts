/** What the road actually pays a traveller over a lifetime, now that a beaten seat pays half.
 *
 *  The decay stops the first chair being farmed, which it had to. But halving is a geometric
 *  series, and a geometric series has a *ceiling*: a player who keeps dying at the same seat
 *  stops earning entirely, and if that ceiling sits below the price of the book they need in
 *  order to get further, the run economy has quietly soft-locked them. This prints the ceiling
 *  for players of several standards so the question is a number rather than a worry.
 *
 *    npx tsx scripts/economy.ts
 */
import { CAMPAIGN } from '../src/engine/ai';
import { MANA_CAP, MANA_START, PRICE, PURSE, SPELLBOOK } from '../src/ui/run';

const BOOK = SPELLBOOK.reduce((sum, e) => sum + PRICE[e], 0);
const CHEAPEST_TWO = [...SPELLBOOK.map((e) => PRICE[e])].sort((a, b) => a - b).slice(0, 2);

/** Spoils are offered on a seat's *first* fall only, so a traveller who plateaus at `depth`
 *  sees exactly `depth` of them in their entire life. Two ways to spend that: all into coin, or
 *  all into mana. Both are worth knowing, because they are the two ends of the real choice. */
const SPOIL_GOLD = 10; // the common purse; a Hoard is 25 but is not always on the table
const SPOIL_MANA = 1;

/** Total gold a traveller who always dies at `depth` will ever collect, decay included. */
function lifetime(depth: number): { total: number; attempts: number; perAttempt: number[] } {
  const beaten = new Map<string, number>();
  const perAttempt: number[] = [];
  let total = 0;

  // Once every seat in reach pays nothing, no further attempt can change anything.
  for (let attempt = 0; attempt < 40; attempt++) {
    let walk = 0;
    for (let i = 0; i < depth; i++) {
      const who = CAMPAIGN[i];
      const times = beaten.get(who) ?? 0;
      walk += Math.floor(PURSE[who] / 2 ** times);
      beaten.set(who, times + 1);
    }
    if (walk === 0) return { total, attempts: perAttempt.length, perAttempt };
    perAttempt.push(walk);
    total += walk;
  }
  return { total, attempts: perAttempt.length, perAttempt };
}

console.log(`\nThe whole book costs ${BOOK}. The two cheapest cost ${CHEAPEST_TWO[0] + CHEAPEST_TWO[1]}.\n`);
console.log(
  ['dies at', 'purses', 'w/spoils', 'mana', 'walks', 'per walk'].join('\t'),
);

for (let depth = 1; depth <= CAMPAIGN.length; depth++) {
  const { total, attempts, perAttempt } = lifetime(depth);
  const seat = depth === CAMPAIGN.length ? 'clears it' : `seat ${depth + 1}`;
  // Spoils land once per seat, ever. All-coin and all-mana are the two ends of that choice.
  const allCoin = total + depth * SPOIL_GOLD;
  const allMana = Math.min(MANA_CAP, MANA_START + depth * SPOIL_MANA);
  const verdict =
    allCoin >= BOOK ? 'can fill the book' : allCoin >= 30 ? 'a working book' : 'stuck';
  console.log(
    [
      seat.padEnd(9),
      String(total).padStart(6),
      String(allCoin).padStart(7),
      `${allMana}/${MANA_CAP}`.padStart(6),
      String(attempts).padStart(4),
      perAttempt.slice(0, 5).join(' → ') + (perAttempt.length > 5 ? ' → …' : ''),
      verdict,
    ].join('\t'),
  );
}
console.log('\nSpoils land on a seat\'s first fall only, so the middle two columns are\nthe same handful of choices spent two different ways.\n');
