import { describe, expect, it } from 'vitest';
import { applyAction } from './apply';
import { chooseAction, HOUSE, innkeeperLoadout, raiseDragons, type House } from './ai';
import { findKing, initialState, random960Back } from './board';
import { applyLoadout, BUDGET, validateLoadout } from './loadout';
import { inCheck, legalMoves, shieldBreakActions } from './movegen';
import { powerActions } from './powers';
import { isError, type Action, type Color, type GameState } from './types';

/** Automated playtesting. Rather than clicking through games by hand, the house plays itself
 *  hundreds of times and every position is checked against the invariants the rules imply.
 *  Anything the engine can reach, this will reach eventually. */

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Things that must be true of every position the engine can produce. */
function assertSane(state: GameState, where: string): void {
  expect(state.board, where).toHaveLength(64);

  for (const color of ['w', 'b'] as Color[]) {
    const kings = state.board.filter((p) => p?.type === 'k' && p.color === color);
    expect(kings, `${where}: ${color} kings`).toHaveLength(1);
    expect(findKing(state, color), `${where}: ${color} king found`).toBeGreaterThanOrEqual(0);
  }

  // Piece ids are unique, so frozen markers and enchantments can never point at two pieces.
  const ids = state.board.filter(Boolean).map((p) => p!.id);
  expect(new Set(ids).size, `${where}: duplicate piece ids`).toBe(ids.length);

  // No pawn may sit on a promotion rank: promotion is mandatory on arrival.
  for (let square = 0; square < 64; square++) {
    const piece = state.board[square];
    if (piece?.type !== 'p') continue;
    const rank = square >> 3;
    expect(rank, `${where}: pawn stranded on the last rank`).not.toBe(piece.color === 'w' ? 7 : 0);
  }

  // A side that is not to move may never be in check: that would mean an illegal move stood.
  expect(inCheck(state, state.turn === 'w' ? 'b' : 'w'), `${where}: opponent left in check`).toBe(
    false,
  );

  // Clock bookkeeping stays coherent.
  expect(state.halfmove, `${where}: halfmove`).toBeGreaterThanOrEqual(0);
  expect(state.fullmove, `${where}: fullmove`).toBeGreaterThanOrEqual(1);
}

interface GameReport {
  plies: number;
  status: GameState['status']['kind'];
  usedPower: boolean;
  brokeShield: boolean;
  promoted: boolean;
}

function playOut(
  white: House,
  black: House,
  rng: () => number,
  options: { back?: ReturnType<typeof random960Back>; maxPlies?: number } = {},
): GameReport {
  const base = initialState(options.back ? { back: options.back } : {});
  const loadouts = {
    w: innkeeperLoadout(base, 'w', { rng }),
    b: innkeeperLoadout(base, 'b', { rng }),
  };
  // The loadout generator must never overspend, whoever is asking.
  for (const color of ['w', 'b'] as Color[]) {
    const check = validateLoadout(base, color, loadouts[color]);
    expect(check.ok, `loadout for ${color}: ${check.errors.join('; ')}`).toBe(true);
    expect(check.spent).toBeLessThanOrEqual(BUDGET);
  }

  let state = applyLoadout(applyLoadout(base, 'w', loadouts.w), 'b', loadouts.b);
  for (const [color, who] of [['w', white], ['b', black]] as [Color, House][]) {
    const rider = HOUSE[who].dragons;
    if (rider) state = raiseDragons(state, color, rider);
  }

  const report: GameReport = {
    plies: 0,
    status: 'ongoing',
    usedPower: false,
    brokeShield: false,
    promoted: false,
  };
  const maxPlies = options.maxPlies ?? 160;

  while (state.status.kind === 'ongoing' && report.plies < maxPlies) {
    const seat = HOUSE[state.turn === 'w' ? white : black];
    // The harness is here to exercise the rules, not to measure strength, so the deep seats
    // are capped. Their armies and enchantments are untouched.
    const choice = chooseAction(state, {
      depth: Math.min(seat.depth, 3),
      sample: Math.min(seat.sample, 8),
      random: seat.random,
      budgetMs: 60,
      rng,
    });

    // A living position must always offer something to do.
    const anything =
      legalMoves(state, state.turn).length +
      shieldBreakActions(state, state.turn).length +
      powerActions(state, state.turn).length;
    expect(anything, 'ongoing game with no legal action').toBeGreaterThan(0);
    expect(choice, 'engine returned nothing while the game was live').not.toBeNull();

    const action: Action = choice!.action;
    if (action.type === 'power') report.usedPower = true;
    if (action.type === 'shieldBreak') report.brokeShield = true;
    if (action.type === 'move' && action.promo) report.promoted = true;

    const next = applyAction(state, action);
    expect(isError(next), `engine rejected its own action: ${JSON.stringify(action)}`).toBe(false);
    state = next as GameState;
    report.plies++;
    assertSane(state, `${white} vs ${black} at ply ${report.plies}`);
  }

  report.status = state.status.kind;
  return report;
}

describe('Self play', () => {
  it('plays a full slate of matchups without ever breaking a rule', () => {
    const pairs: [House, House][] = [
      ['drunkard', 'drunkard'],
      ['drunkard', 'innkeeper'],
      ['innkeeper', 'wit'],
      ['wit', 'ardax'],
      ['ardax', 'kyrax'],
      ['kyrax', 'wit'],
    ];
    for (const [white, black] of pairs) {
      const report = playOut(white, black, seeded(pairs.indexOf([white, black] as never) + 41));
      expect(report.plies).toBeGreaterThan(0);
    }
  }, 120_000);

  it('survives a run of random games from Chess960 starts', () => {
    for (let game = 0; game < 6; game++) {
      const rng = seeded(1000 + game);
      const report = playOut('drunkard', 'innkeeper', rng, {
        back: random960Back(rng),
        maxPlies: 120,
      });
      expect(report.plies).toBeGreaterThan(0);
    }
  }, 120_000);

  it('exercises the enchanted layer over many games, not just the vanilla moves', () => {
    // Two random movers are the widest net for *variety* — they will try powers and
    // shield-breaks a real player never would — so this is where the coverage assertions live.
    const totals = { usedPower: 0, brokeShield: 0, promoted: 0 };
    for (let game = 0; game < 14; game++) {
      const report = playOut('drunkard', 'drunkard', seeded(500 + game), { maxPlies: 200 });
      if (report.usedPower) totals.usedPower++;
      if (report.brokeShield) totals.brokeShield++;
      if (report.promoted) totals.promoted++;
    }
    expect(totals.usedPower, 'no King power was ever activated').toBeGreaterThan(0);
    expect(totals.promoted, 'no pawn ever promoted').toBeGreaterThan(0);
  }, 180_000);

  it('reaches real results when a seat is actually trying to win', () => {
    // Deliberately *not* asserted on random-vs-random. Two random movers almost never mate, so
    // "at least one of these fourteen finished" is a claim about one particular shuffle of the
    // rng: any engine change reorders the random choices, draws a different fourteen games, and
    // the test flips with no bug involved. It failed exactly that way once. A searching seat
    // against a random one converts nearly every time, which is the property actually worth
    // guarding: that games end.
    let finished = 0;
    for (let game = 0; game < 6; game++) {
      const report = playOut('innkeeper', 'drunkard', seeded(900 + game), { maxPlies: 200 });
      if (report.status !== 'ongoing') finished++;
    }
    expect(finished, 'no game reached a result even with a searching seat').toBeGreaterThan(3);
  }, 180_000);
});
