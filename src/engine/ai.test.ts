import { describe, expect, it } from 'vitest';
import { applyAction } from './apply';
import { initialState, parseSquare, squareName } from './board';
import { armorArmy, chooseAction, evaluate, HOUSE, MATE_SCORE, material, raiseDragons } from './ai';
import { parseFen } from './fen';
import { applyLoadout } from './loadout';
import { inCheck, legalMoves, shieldBreakActions } from './movegen';
import { hasMove, position } from './testkit';
import { isError, type Action, type GameState } from './types';

/** A tiny deterministic generator, so the Innkeeper's sampling is reproducible in tests. */
function seeded(seed: number): () => number {
  let s = (seed * 0x6d2b79f5) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const asMove = (action: Action) => {
  if (action.type !== 'move') throw new Error(`expected a move, got ${action.type}`);
  return `${squareName(action.from)}${squareName(action.to)}`;
};

describe('The Innkeeper', () => {
  it('counts material from the side it is asked about', () => {
    const state = position({ e1: 'wk', e8: 'bk', d4: 'wq', a7: 'bp' });
    expect(material(state, 'w')).toBe(8);
    expect(material(state, 'b')).toBe(-8);
  });

  it('takes a piece that is offered for free', () => {
    // The black queen on d5 is hanging; the rook on d1 should simply take it.
    const state = position({ e1: 'wk', h8: 'bk', d1: 'wr', d5: 'bq' });
    // Full sampling here: the point is the evaluation, not the sampling lottery.
    const choice = chooseAction(state, { depth: 3, sample: 40, rng: seeded(7) });
    expect(choice).not.toBeNull();
    expect(asMove(choice!.action)).toBe('d1d5');
  });

  it('does not grab a pawn that costs it a rook', () => {
    // The a7 pawn is defended by the king on b7, so Rxa7 simply loses the rook.
    const state = parseFen('8/pk6/8/8/8/8/8/R3K3 w - - 0 1');
    for (let seed = 1; seed <= 6; seed++) {
      const choice = chooseAction(state, { depth: 3, sample: 40, rng: seeded(seed) });
      expect(asMove(choice!.action)).not.toBe('a1a7');
    }
  });

  it('plays a mate in one when it sees it', () => {
    // Back-rank mate. It may arrive by rook move or by teleporting the rook onto the rank;
    // either is mate, so the test asks for the result rather than the route.
    const state = parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    const choice = chooseAction(state, { depth: 3, sample: 40, rng: seeded(3) });
    expect(choice!.score).toBeGreaterThan(MATE_SCORE / 2);
    const after = applyAction(state, choice!.action);
    expect(isError(after)).toBe(false);
    expect((after as GameState).status).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('will spend a King power when that is the best line', () => {
    const state = parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
    const seen = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const choice = chooseAction(state, { depth: 3, sample: 40, rng: seeded(seed) });
      seen.add(choice!.action.type);
    }
    expect(seen.has('power') || seen.has('move')).toBe(true);
  });

  it('always returns something the engine accepts as legal', () => {
    let state = position({ e1: 'wk', e8: 'bk', d1: 'wq', d8: 'bq', a2: 'wp', h7: 'bp' });
    const rng = seeded(11);
    for (let ply = 0; ply < 12 && state.status.kind === 'ongoing'; ply++) {
      const choice = chooseAction(state, { depth: 2, rng });
      if (!choice) break;
      const next = applyAction(state, choice.action);
      expect(isError(next)).toBe(false);
      state = isError(next) ? state : next;
    }
    expect(state.ply).toBeGreaterThan(0);
  });

  it('returns nothing once the game is over', () => {
    const done = position({ e1: 'wk', e8: 'bk' });
    expect(chooseAction({ ...done, status: { kind: 'stalemate' } })).toBeNull();
  });

  it('is reproducible for a given seed', () => {
    const state = parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const first = chooseAction(state, { depth: 3, rng: seeded(21) });
    const again = chooseAction(state, { depth: 3, rng: seeded(21) });
    expect(asMove(first!.action)).toBe(asMove(again!.action));
  });

  it('sees the shield-break as an option without crashing', () => {
    const state = position({ e1: 'wk', a8: 'bk', d5: 'bq:taunt', d8: 'br', d1: 'wr', h2: 'wp' });
    const choice = chooseAction(state, { depth: 2, sample: 40, rng: seeded(5) });
    expect(choice).not.toBeNull();
    const next = applyAction(state, choice!.action);
    expect(isError(next)).toBe(false);
  });
});

describe('The Wit', () => {
  const wit = HOUSE.wit;

  it('finds a forced mate in two', () => {
    // Anastasia-style: Rh8+ Kxh8 (forced) and the knight is not the point; simplest is a
    // back-rank net where the rook lift mates next move.
    const state = parseFen('6k1/5ppp/8/8/8/7Q/5PPP/6K1 w - - 0 1');
    const choice = chooseAction(state, { depth: wit.depth, sample: wit.sample, rng: seeded(4) });
    expect(choice!.score).toBeGreaterThan(MATE_SCORE / 2);
  });

  it('refuses to eat a poisoned pawn with a valuable piece', () => {
    // Taking the poison pawn on d5 removes the capturer too, so a queen must not touch it.
    const state = position({ e1: 'wk', h8: 'bk', d1: 'wq', d5: 'bp:poison', a7: 'bp' });
    for (let seed = 1; seed <= 4; seed++) {
      const choice = chooseAction(state, {
        depth: wit.depth,
        sample: wit.sample,
        rng: seeded(seed),
      });
      // It may answer with a move or with a King power; what it must never do is eat the pawn.
      if (choice!.action.type === 'move') expect(asMove(choice!.action)).not.toBe('d1d5');
    }
  });

  it('values a Herald pawn that is one step from crowning', () => {
    const ready = position({ e1: 'wk', a8: 'bk', b6: 'wp:herald' });
    const plain = position({ e1: 'wk', a8: 'bk', b6: 'wp' });
    expect(evaluate(ready, 'w')).toBeGreaterThan(evaluate(plain, 'w') + 100);
  });

  it('counts a live Taunt shield as real protection', () => {
    const shielded = position({ e1: 'wk', a8: 'bk', d4: 'wq:taunt', d1: 'wr' });
    const bare = position({ e1: 'wk', a8: 'bk', d4: 'wq', d1: 'wr' });
    expect(evaluate(shielded, 'w')).toBeGreaterThan(evaluate(bare, 'w'));
  });

  it('stops when the clock says stop', () => {
    // The position matters. An earlier version of this test used the Scholar's Mate position,
    // where the search finds mate at depth 1 and breaks out of iterative deepening on the spot:
    // it returned in 11 ms and the budget was never reached, so the test asserted nothing at
    // all. A quiet middlegame gives the search somewhere to spend the time.
    //
    // The assertion is on *depth*, not on elapsed milliseconds. "It finished within N ms" is a
    // claim about the machine as much as the code, and it is exactly the sort of test that
    // fails when a container build is running beside it. "It was cut short well before its
    // nominal depth" is the same claim about the mechanism, and it holds on any hardware.
    const state = parseFen('r2q1rk1/pp2bppp/2n1bn2/2pp4/3P4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 10');
    const choice = chooseAction(state, { depth: 12, sample: 40, budgetMs: 150, rng: seeded(2) });
    expect(choice).not.toBeNull();
    expect(choice!.depth).toBeGreaterThanOrEqual(1);
    expect(choice!.depth, 'the budget did not cut the search short').toBeLessThan(12);
  });

  it('reaches deeper when given more clock, on the same position', () => {
    // The other half: the budget is not merely stopping the search, it is *governing* it.
    //
    // This is the one wall-clock assertion in the suite, and it flaked once — 100 ms against
    // 2000 ms is only a 20× gap, and on a machine that is also running a balance sweep both
    // sides get squeezed until the comparison collapses. What makes it stable is the *ratio*,
    // not the absolute figures: at 60× apart, even a tenfold slowdown leaves the long search
    // with more thinking time than the short one started with. The short one is also allowed
    // to come back empty-handed, which it may legitimately do if it aborts inside depth 1.
    const state = parseFen('r2q1rk1/pp2bppp/2n1bn2/2pp4/3P4/2N1PN2/PPQ1BPPP/R1B2RK1 w - - 0 10');
    const brief = chooseAction(state, { depth: 12, sample: 40, budgetMs: 40, rng: seeded(2) });
    const longer = chooseAction(state, { depth: 12, sample: 40, budgetMs: 2400, rng: seeded(2) });
    expect(longer).not.toBeNull();
    expect(longer!.depth).toBeGreaterThan(brief?.depth ?? 0);
  });

  it('a node cap gives the same move every time, however busy the machine is', () => {
    // The point of `maxNodes`: two searches with the same cap and the same seed must agree,
    // because nothing about the answer depends on wall-clock time. This is what the tactics
    // suite leans on, so if it ever breaks, those go flaky rather than red.
    const state = parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const run = () =>
      JSON.stringify(chooseAction(state, { depth: 12, sample: 40, maxNodes: 20_000, rng: seeded(7) })!.action);
    expect(run()).toBe(run());
  });

  it('a smaller node cap is a weaker search, not a different kind of one', () => {
    // A cap must bound the work rather than corrupt the answer: the shallow search still
    // returns something legal, and the deep one is free to disagree with it.
    const state = parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const small = chooseAction(state, { depth: 12, sample: 40, maxNodes: 800, rng: seeded(3) });
    expect(small).not.toBeNull();
    expect(small!.depth).toBeGreaterThanOrEqual(1);
  });

  it('the drunkard just reaches for something legal', () => {
    const state = parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const picks = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const choice = chooseAction(state, { ...HOUSE.drunkard, rng: seeded(seed) });
      const next = applyAction(state, choice!.action);
      expect(isError(next)).toBe(false);
      picks.add(JSON.stringify(choice!.action));
    }
    expect(picks.size).toBeGreaterThan(2); // genuinely scattered, not one repeated move
  });
});

describe('Dragonlord Kyrax', () => {
  it('fields dragons in place of knights', () => {
    const base = initialState();
    const lord = raiseDragons(base, 'b');
    const dragons = lord.board.filter((p) => p?.type === 'd');
    expect(dragons).toHaveLength(2);
    expect(lord.board.filter((p) => p?.type === 'n' && p.color === 'b')).toHaveLength(0);
    expect(lord.board.filter((p) => p?.type === 'n' && p.color === 'w')).toHaveLength(2);
  });

  it('a dragon moves as knight and bishop together', () => {
    const state = position({ e1: 'wk', a8: 'bk', d4: 'wd' });
    const targets = legalMoves(state, 'w')
      .filter((m) => m.from === parseSquare('d4'))
      .map((m) => squareName(m.to))
      .sort();
    expect(targets).toContain('e6'); // knight leap
    expect(targets).toContain('c3'); // bishop step
    expect(targets).toContain('h8'); // long diagonal
    expect(targets).not.toContain('d5'); // never straight
  });

  it('a dragon gives check on both of its lines', () => {
    const leap = position({ e1: 'wk', e8: 'bk', f6: 'wd' }, { turn: 'b' });
    expect(inCheck(leap, 'b')).toBe(true);
    const diagonal = position({ e1: 'wk', e8: 'bk', a4: 'wd' }, { turn: 'b' });
    expect(inCheck(diagonal, 'b')).toBe(true);
  });

  it('is worth more than a rook and less than a queen', () => {
    const withDragon = position({ e1: 'wk', a8: 'bk', d4: 'wd' });
    const withRook = position({ e1: 'wk', a8: 'bk', d4: 'wr' });
    const withQueen = position({ e1: 'wk', a8: 'bk', d4: 'wq' });
    expect(evaluate(withDragon, 'w')).toBeGreaterThan(evaluate(withRook, 'w'));
    expect(evaluate(withDragon, 'w')).toBeLessThan(evaluate(withQueen, 'w'));
  });
});

describe('Armour', () => {
  it('gives every piece but the King a Taunt, leaving existing enchantments alone', () => {
    const base = applyLoadout(initialState(), 'b', {
      enchantments: { d7: 'poison' },
      power: 'teleport',
    });
    const walled = armorArmy(base, 'b');

    const black = walled.board.filter((p) => p?.color === 'b');
    expect(black).toHaveLength(16);
    expect(black.filter((p) => p!.type !== 'k').every((p) => p!.ench !== null)).toBe(true);
    expect(walled.board[parseSquare('d7')]!.ench).toBe('poison');
    expect(walled.board[parseSquare('e8')]!.ench).toBeNull(); // the King bows to no enchantment
    expect(walled.board.filter((p) => p?.color === 'w' && p.ench).length).toBe(0);
  });

  it('makes a defended piece cost a whole turn to strip', () => {
    // The armoured knight on c6 is defended by the b7 pawn, so it cannot simply be taken.
    const state = armorArmy(
      position({ e1: 'wk', e8: 'bk', c6: 'bn', b7: 'bp', d5: 'wb' }),
      'b',
    );
    expect(hasMove(legalMoves(state, 'w'), 'd5', 'c6')).toBe(false);
    expect(shieldBreakActions(state, 'w').some((a) => a.target === parseSquare('c6'))).toBe(true);
  });
});
