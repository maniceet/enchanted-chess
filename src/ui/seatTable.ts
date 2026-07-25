import { TranspositionTable, seatRegime, type InnkeeperOptions } from '../engine/ai';

/** One transposition table, kept alive between moves.
 *
 *  A search that starts from an empty table throws away everything it learned about the
 *  position it is still sitting in, and re-derives it from scratch on the next move. Every
 *  harness in `scripts/` passes a table across turns; the shipped game did not, because the
 *  table cannot ride along in a worker message. So it lives in module scope instead, and both
 *  the worker and the inline fallback pull from here — which also means the two paths cannot
 *  drift into being different opponents.
 *
 *  It is reset whenever the seat changes. Entries are hash-verified, so a stale *position* can
 *  never be misread, but the seats do not share an evaluation function: the teaching seats
 *  score with `positional` and the deep ones with the full `evaluate`. A score one of them
 *  cached is a lie to the other, and the hash cannot tell them apart.
 */

let table: TranspositionTable | undefined;
let regime = '';

/** What makes two searches comparable enough to share a table. Anything here that changes how
 *  a position is *scored* or how wide it is looked at belongs in the signature. */
function signatureOf(options: InnkeeperOptions): string {
  const regime = seatRegime(options);
  return [
    regime.depth,
    regime.sample,
    // Which evaluation scored the entry. Resolved through `seatRegime` rather than read off
    // `options`, because it defaults to whether the seat is wide: a bare `options.magic` is
    // `undefined` for every shipped seat and would collapse the two regimes into one.
    regime.magic ? 'magic' : 'flat',
    options.random ? 'random' : '',
    options.passedPawns === false ? 'flat' : '',
    options.seePruning ? 'see' : '',
  ].join('|');
}

/** The options a seat should actually search with: its own, plus a table that remembers. */
export function withSeatTable(options: InnkeeperOptions): InnkeeperOptions {
  const signature = signatureOf(options);
  if (!table || signature !== regime) {
    table = new TranspositionTable();
    regime = signature;
  }
  return { ...options, table };
}

/** For tests, and for anywhere a genuinely clean search is wanted. */
export function forgetSeatTable(): void {
  table = undefined;
  regime = '';
}
