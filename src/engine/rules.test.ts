import { describe, expect, it } from 'vitest';
import { applyAction, isFrozen } from './apply';
import { initialState, parseSquare, squareName } from './board';
import { applyLoadout, carrierError, costOf, validateLoadout } from './loadout';
import { deserialize, parseFen, serialize, toFen } from './fen';
import {
  bindActions,
  inCheck,
  isAttacked,
  isShielded,
  legalMoves,
  shieldBreakActions,
  swapActions,
} from './movegen';
import { powerActions, powerUnavailableReason } from './powers';
import { TIME_CONTROLS, newClock } from './clock';
import { toSan } from './notation';
import { at, hasMove, position } from './testkit';
import { isError, type Action, type GameState, type PieceType, type PowerAction } from './types';

const ok = (r: GameState | { error: string }): GameState => {
  if (isError(r)) throw new Error(r.error);
  return r;
};

const move = (state: GameState, from: string, to: string, promo?: 'q' | 'r' | 'b' | 'n') =>
  applyAction(state, {
    type: 'move',
    from: parseSquare(from),
    to: parseSquare(to),
    ...(promo ? { promo } : {}),
  });

describe('T1 — Taunt shield is derived from live defense', () => {
  const base = {
    d5: 'bq:taunt',
    c6: 'bp',
    d1: 'wr',
    e1: 'wk',
    a8: 'bk',
  };

  it('is shielded while defended, and the capture is not offered as a move', () => {
    const state = position(base);
    expect(isShielded(state.board, parseSquare('d5'))).toBe(true);
    expect(hasMove(legalMoves(state), 'd1', 'd5')).toBe(false);
    expect(shieldBreakActions(state, 'w')).toHaveLength(1);
  });

  it('goes inactive the moment the last defender leaves, and returns when it comes back', () => {
    // Here the lone defender is a rook that can step away and back again.
    const state = position({ d5: 'bq:taunt', d8: 'br', d1: 'wr', e1: 'wk', a8: 'bk' }, { turn: 'b' });
    expect(isShielded(state.board, parseSquare('d5'))).toBe(true);

    const defenderLeft = ok(move(state, 'd8', 'h8'));
    expect(isShielded(defenderLeft.board, parseSquare('d5'))).toBe(false);
    expect(hasMove(legalMoves(defenderLeft), 'd1', 'd5')).toBe(true);

    const defenderBack = ok(move(ok(move(defenderLeft, 'e1', 'e2')), 'h8', 'd8'));
    expect(isShielded(defenderBack.board, parseSquare('d5'))).toBe(true);
  });

  it('stays broken forever once broken, even when defenders return', () => {
    const state = position(base);
    const broken = ok(
      applyAction(state, {
        type: 'shieldBreak',
        from: parseSquare('d1'),
        target: parseSquare('d5'),
      }),
    );
    expect(at(broken, 'd5')!.shieldBroken).toBe(true);
    expect(isShielded(broken.board, parseSquare('d5'))).toBe(false);
    expect(hasMove(legalMoves(broken, 'w'), 'd1', 'd5')).toBe(true);
  });

  it('a pin does not remove defense', () => {
    // The c6 pawn is pinned against its king by the white bishop, but still defends d5.
    const pinned = position({ d5: 'bq:taunt', c6: 'bp', b7: 'bk', f3: 'wb', d1: 'wr', e1: 'wk' });
    expect(isShielded(pinned.board, parseSquare('d5'))).toBe(true);
  });
});

describe('T2 — breaking a shield is not a capture', () => {
  it('leaves the attacker in place, the victim on the board, and the clock unreset', () => {
    const state = { ...position({ d5: 'bq:taunt', c6: 'bp', d1: 'wr', e1: 'wk', a8: 'bk' }), halfmove: 7 };
    const after = ok(
      applyAction(state, {
        type: 'shieldBreak',
        from: parseSquare('d1'),
        target: parseSquare('d5'),
      }),
    );
    expect(at(after, 'd1')!.type).toBe('r');
    expect(at(after, 'd5')!.type).toBe('q');
    expect(after.halfmove).toBe(8); // ticks on, never reset (T2)
    expect(after.graveyard.b).toHaveLength(0);
    expect(after.turn).toBe('b');
  });

  it('does not trigger Martyr on the shielded piece it neighbours', () => {
    const state = position({ d5: 'bq:taunt', c6: 'bp', d1: 'wr', e1: 'wk', a8: 'bk' });
    const after = ok(
      applyAction(state, {
        type: 'shieldBreak',
        from: parseSquare('d1'),
        target: parseSquare('d5'),
      }),
    );
    expect(after.frozen).toHaveLength(0);
  });
});

describe('T3 — mate detection with a shielded checker', () => {
  // White queen g2 checks h1 and is defended by the king on f3, so the rook on g8 can only
  // shield-break — which is illegal in check. The queen stands on White's own second rank,
  // so the half rule (T5) leaves the shield up.
  const mateSpec = { f3: 'wk', g2: 'wq:taunt', h1: 'bk', g8: 'br' };

  it('is checkmate when the only defence is capturing the shielded checker', () => {
    const state = position(mateSpec, { turn: 'b' });
    expect(legalMoves(state, 'b')).toHaveLength(0);
    const settled = ok(applyAction(position({ ...mateSpec, a4: 'wp' }), {
      type: 'move',
      from: parseSquare('a4'),
      to: parseSquare('a5'),
    }));
    expect(settled.status.kind).toBe('checkmate');
  });

  it('is not mate without the shield — the rook simply captures', () => {
    const state = position({ f3: 'wk', g2: 'wq', h1: 'bk', g8: 'br' }, { turn: 'b' });
    expect(hasMove(legalMoves(state, 'b'), 'g8', 'g2')).toBe(true);
  });

  it('is still mate when the capturing piece itself carries Taunt — there is no exception (T6)', () => {
    const state = position({ f3: 'wk', g2: 'wq:taunt', h1: 'bk', g8: 'br:taunt' }, { turn: 'b' });
    expect(hasMove(legalMoves(state, 'b'), 'g8', 'g2')).toBe(false);
    expect(legalMoves(state, 'b')).toHaveLength(0);
  });

  it('never lets the King capture a shielded piece — that is capture into check', () => {
    const state = position({ f3: 'wk', g2: 'wq:taunt', h1: 'bk' }, { turn: 'b' });
    expect(hasMove(legalMoves(state, 'b'), 'h1', 'g2')).toBe(false);
  });
});

describe('T4 — shield-break is illegal while your King is in check', () => {
  it('offers no shield-breaks in check', () => {
    const state = position({ f3: 'wk', g2: 'wq:taunt', h1: 'bk', g8: 'br' }, { turn: 'b' });
    expect(shieldBreakActions(state, 'b')).toHaveLength(0);
    const rejected = applyAction(state, {
      type: 'shieldBreak',
      from: parseSquare('g8'),
      target: parseSquare('g2'),
    });
    expect(isError(rejected)).toBe(true);
  });
});

describe('T5 — Taunt only shields in its owner’s own half', () => {
  it('a defended Taunt piece in the enemy half is captured normally', () => {
    // Black knight on d3 sits on White's third rank, defended by the pawn on e4. Deep in enemy
    // ground, the armour counts for nothing.
    const state = position({ d3: 'bn:taunt', e4: 'bp', d1: 'wr', e1: 'wk', a8: 'bk' });
    expect(isShielded(state.board, parseSquare('d3'))).toBe(false);
    expect(hasMove(legalMoves(state), 'd1', 'd3')).toBe(true);
    expect(shieldBreakActions(state, 'w')).toHaveLength(0);
  });

  it('a shielded piece still captures like anything else', () => {
    // Taunt is armour, not a truce. This came out of a played game: a shielded h7 pawn
    // declined a free recapture on g6, and the question was whether carrying a shield had
    // quietly disarmed it. It had not — the seat was simply searching shallow — but the
    // ruling is worth pinning, because "shielded" touching move generation at all is the
    // kind of thing that would only ever be noticed mid-duel.
    const state = position(
      { h7: 'bp:taunt', h8: 'br', g6: 'wp', e1: 'wk', a8: 'bk' },
      { turn: 'b' },
    );
    expect(isShielded(state.board, parseSquare('h7'))).toBe(true);
    expect(hasMove(legalMoves(state), 'h7', 'g6')).toBe(true);
  });

  it('the shield sleeps on crossing the middle and wakes on coming home', () => {
    // The knight starts on c6 in Black's half, defended by the b7 pawn, so it is shielded.
    const home = position({ c6: 'bn:taunt', b7: 'bp', h1: 'wk', a8: 'bk', h8: 'wr' }, { turn: 'b' });
    expect(isShielded(home.board, parseSquare('c6'))).toBe(true);

    // Nc6–d4 crosses into White's half. Still defended? No — but the point is the half: put a
    // defender on it and it is still unshielded.
    const away = position({ d4: 'bn:taunt', e5: 'bp', h1: 'wk', a8: 'bk', h8: 'wr' }, { turn: 'b' });
    expect(isShielded(away.board, parseSquare('d4'))).toBe(false);

    // Back over the middle to d5, still defended by the e6 pawn: the shield is up again.
    const back = position({ d5: 'bn:taunt', e6: 'bp', h1: 'wk', a8: 'bk', h8: 'wr' }, { turn: 'b' });
    expect(isShielded(back.board, parseSquare('d5'))).toBe(true);
  });

  it('rank 4 from your side is still your half, rank 5 is not', () => {
    const onFour = position({ d4: 'wn:taunt', c3: 'wp', e1: 'wk', a8: 'bk' });
    expect(isShielded(onFour.board, parseSquare('d4'))).toBe(true);
    const onFive = position({ d5: 'wn:taunt', c4: 'wp', e1: 'wk', a8: 'bk' });
    expect(isShielded(onFive.board, parseSquare('d5'))).toBe(false);
  });

  it('T6 — a Taunted attacker gets no exception, and is offered the shield-break like anyone else', () => {
    // The face-off the half rule creates: White knight on d4 (its own fourth rank, defended by
    // the c3 pawn, so shielded) attacks the Black knight on e6... which is on Black's own ground
    // and defended by d7, so shielded too. Neither can simply take the other.
    const state = position({
      d4: 'wn:taunt',
      c3: 'wp',
      e6: 'bn:taunt',
      d7: 'bp',
      e1: 'wk',
      a8: 'bk',
    });
    expect(isShielded(state.board, parseSquare('d4'))).toBe(true);
    expect(isShielded(state.board, parseSquare('e6'))).toBe(true);
    expect(hasMove(legalMoves(state), 'd4', 'e6')).toBe(false);
    expect(
      shieldBreakActions(state, 'w').some(
        (a) => a.from === parseSquare('d4') && a.target === parseSquare('e6'),
      ),
    ).toBe(true);
  });

  it('a shield broken abroad stays broken at home', () => {
    // Shields do not come back, and the half rule does not launder a spent one.
    const state = position({ d5: 'bq:taunt', c6: 'bp', d1: 'wr', e1: 'wk', a8: 'bk' });
    const broken = ok(
      applyAction(state, { type: 'shieldBreak', from: parseSquare('d1'), target: parseSquare('d5') }),
    );
    expect(isShielded(broken.board, parseSquare('d5'))).toBe(false);
    const wandered = ok(move(broken, 'd5', 'd7'));
    expect(isShielded(wandered.board, parseSquare('d7'))).toBe(false);
  });
});

describe('King Immunity (§2.4a)', () => {
  it('King captures an undefended Poison pawn and survives', () => {
    const state = position({ e4: 'wk', d5: 'bp:poison', a8: 'bk' });
    const after = ok(move(state, 'e4', 'd5'));
    expect(at(after, 'd5')!.type).toBe('k');
    expect(after.graveyard.w).toHaveLength(0);
    expect(after.graveyard.b).toEqual(['p']);
  });

  it('King captures an undefended Martyr piece and is not frozen', () => {
    const state = position({ e4: 'wk', d5: 'bn:martyr', a8: 'bk' });
    const after = ok(move(state, 'e4', 'd5'));
    expect(after.frozen).toHaveLength(0);
    expect(isFrozen(after, at(after, 'd5')!)).toBe(false);
  });

  it('but a non-King capturer dies to Poison', () => {
    const state = position({ c3: 'wn', d5: 'bp:poison', e1: 'wk', a8: 'bk' });
    const after = ok(move(state, 'c3', 'd5'));
    expect(at(after, 'd5')).toBeNull();
    expect(after.graveyard.w).toEqual(['n']);
  });

  it('and a non-King capturer is frozen by Martyr for exactly one turn', () => {
    const state = position({ c3: 'wn', d5: 'bn:martyr', e1: 'wk', a8: 'bk', h7: 'bp' });
    const captured = ok(move(state, 'c3', 'd5'));
    const knight = at(captured, 'd5')!;
    const blackReplied = ok(move(captured, 'a8', 'a7'));
    expect(isFrozen(blackReplied, knight)).toBe(true);
    expect(legalMoves(blackReplied, 'w').some((m) => m.from === parseSquare('d5'))).toBe(false);

    const later = ok(move(ok(move(blackReplied, 'e1', 'e2')), 'a7', 'a8'));
    expect(isFrozen(later, knight)).toBe(false);
    expect(legalMoves(later, 'w').some((m) => m.from === parseSquare('d5'))).toBe(true);
  });

  it('Decree cannot target the King', () => {
    const state = position({ e1: 'wk', e8: 'bk', d8: 'bq' }, { powers: { w: 'decree' } });
    const targets = powerActions(state, 'w').map(
      (a) => (a.args as { target: number }).target,
    );
    expect(targets).toContain(parseSquare('d8'));
    expect(targets).not.toContain(parseSquare('e8'));
  });
});

describe('M1 / M2 — frozen pieces', () => {
  it('a frozen piece still gives check and still defends', () => {
    const state = position({ e1: 'wk', e7: 'wr', e8: 'bk', d7: 'wp' }, { turn: 'b', frozen: ['e7'] });
    expect(legalMoves(state, 'b').every((m) => m.from === parseSquare('e8'))).toBe(true);
    // The frozen rook still defends d7, so the black king may not take it.
    expect(hasMove(legalMoves(state, 'b'), 'e8', 'd7')).toBe(false);
  });

  it('freezing the last mobile piece produces stalemate', () => {
    const spec = { a8: 'bk', c7: 'wq', h1: 'wk', b1: 'bn' };
    const frozenOpts = { turn: 'b' as const, frozen: ['b1'], powerUsed: { b: true } };
    const stalemated = ok(
      applyAction(position({ ...spec, h2: 'wp' }, { ...frozenOpts, turn: 'w' }), {
        type: 'move',
        from: parseSquare('h2'),
        to: parseSquare('h3'),
      }),
    );
    expect(stalemated.status.kind).toBe('stalemate');

    const mobile = position(spec, { turn: 'b', powerUsed: { b: true } });
    expect(legalMoves(mobile, 'b').length).toBeGreaterThan(0);
  });
});

describe('Passive enchantments', () => {
  it('Outpost cannot be captured by enemy pawns, but other pieces take it normally', () => {
    const state = position({ c4: 'wp', d5: 'bn:outpost', f3: 'wb', e1: 'wk', a8: 'bk' });
    expect(hasMove(legalMoves(state, 'w'), 'c4', 'd5')).toBe(false);
    expect(hasMove(legalMoves(state, 'w'), 'f3', 'd5')).toBe(true);
  });

  it('Outpost does not protect against a King capture', () => {
    const state = position({ e4: 'wk', d5: 'bn:outpost', a8: 'bk' });
    expect(hasMove(legalMoves(state, 'w'), 'e4', 'd5')).toBe(true);
  });

  it('Swift double-steps from anywhere and stays en-passant capturable', () => {
    const state = position({ e4: 'wp:swift', d6: 'bp', e1: 'wk', a8: 'bk' });
    expect(hasMove(legalMoves(state, 'w'), 'e4', 'e6')).toBe(true);
    const doubled = ok(move(state, 'e4', 'e6'));
    expect(doubled.ep).toBe(parseSquare('e5'));
    const takenEnPassant = ok(move(doubled, 'd6', 'e5'));
    expect(at(takenEnPassant, 'e6')).toBeNull();
    expect(at(takenEnPassant, 'e5')!.color).toBe('b');
  });

  it('an ordinary pawn still may not double-step twice', () => {
    const state = position({ e4: 'wp', e1: 'wk', a8: 'bk' });
    expect(hasMove(legalMoves(state, 'w'), 'e4', 'e6')).toBe(false);
  });

  it('Herald promotes on rank 7 with the normal choice', () => {
    const state = position({ e6: 'wp:herald', e1: 'wk', a8: 'bk' });
    const promos = legalMoves(state, 'w').filter((m) => m.to === parseSquare('e7'));
    expect(promos.map((m) => m.promo).sort()).toEqual(['b', 'n', 'q', 'r']);
    const promoted = ok(move(state, 'e6', 'e7', 'q'));
    expect(at(promoted, 'e7')).toMatchObject({ type: 'q', color: 'w' });
  });
});

describe('King powers', () => {
  it('every power is illegal while your King is in check', () => {
    for (const power of ['teleport', 'relocate', 'decree', 'revive'] as const) {
      const state = position(
        { e1: 'wk', e8: 'br', a8: 'bk', b1: 'wn' },
        { powers: { w: power }, reserve: { w: 4 }, graveyard: { w: ['p'] } },
      );
      expect(powerActions(state, 'w')).toHaveLength(0);
    }
  });

  it('Teleport can never land a piece adjacent to the enemy King', () => {
    const state = position({ e1: 'wk', b1: 'wn', e8: 'bk' }, { powers: { w: 'teleport' } });
    const adjacent = new Set(
      [-9, -8, -7, -1, 1, 7, 8, 9].map((d) => parseSquare('e8') + d),
    );
    const landings = powerActions(state, 'w').map((a) => (a.args as { to: number }).to);
    expect(landings.length).toBeGreaterThan(0);
    expect(landings.some((s) => adjacent.has(s))).toBe(false);
  });

  it('Relocate swaps the King with a friendly piece in its own half only', () => {
    const state = position(
      { e1: 'wk', b2: 'wn', b6: 'wr', e8: 'bk' },
      { powers: { w: 'relocate' } },
    );
    const partners = powerActions(state, 'w').map((a) => (a.args as { with: number }).with);
    expect(partners).toContain(parseSquare('b2'));
    expect(partners).not.toContain(parseSquare('b6'));

    const swapped = ok(
      applyAction(state, {
        type: 'power',
        power: 'relocate',
        args: { kind: 'relocate', with: parseSquare('b2') },
      }),
    );
    expect(at(swapped, 'b2')!.type).toBe('k');
    expect(at(swapped, 'e1')!.type).toBe('n');
    expect(swapped.powers.w.spent).toContain('relocate');
  });

  it('Decree freezes an enemy piece for exactly its next turn', () => {
    const state = position({ e1: 'wk', a8: 'bk', d8: 'bq' }, { powers: { w: 'decree' } });
    const decreed = ok(
      applyAction(state, {
        type: 'power',
        power: 'decree',
        args: { kind: 'decree', target: parseSquare('d8') },
      }),
    );
    expect(legalMoves(decreed, 'b').some((m) => m.from === parseSquare('d8'))).toBe(false);
    const nextBlackTurn = ok(move(ok(move(decreed, 'a8', 'a7')), 'e1', 'e2'));
    expect(legalMoves(nextBlackTurn, 'b').some((m) => m.from === parseSquare('d8'))).toBe(true);
  });

  it('Revive: graveyard only, own half, unattacked, reserve-priced, once per game', () => {
    const state = position(
      { e1: 'wk', e8: 'bk', h5: 'br' },
      { powers: { w: 'revive' }, reserve: { w: 3 }, graveyard: { w: ['p', 'n', 'r'] } },
    );
    const actions = powerActions(state, 'w') as PowerAction[];
    const kinds = new Set(actions.map((a) => (a.args as { piece: string }).piece));
    expect(kinds).toEqual(new Set(['p', 'n'])); // rook costs 5, above the 3 reserved
    const squares = actions.map((a) => (a.args as { to: number }).to);
    expect(squares.every((s) => s >> 3 <= 3)).toBe(true); // own half only
    expect(squares.some((s) => s >> 3 === 4)).toBe(false);
    expect(squares.map(squareName)).not.toContain('h1'); // attacked by the rook on h5

    const revived = ok(
      applyAction(state, {
        type: 'power',
        power: 'revive',
        args: { kind: 'revive', piece: 'n', to: parseSquare('b1') },
      }),
    );
    expect(at(revived, 'b1')).toMatchObject({ type: 'n', color: 'w', ench: null, moved: true });
    expect(revived.powers.w.reserve).toBe(0);
    expect(revived.graveyard.w).toEqual(['p', 'r']);
    expect(revived.powers.w.spent).toContain('revive');
    expect(powerActions(revived, 'w')).toHaveLength(0); // once per game
  });

  it('a revived pawn has already moved, so it cannot double-step', () => {
    const state = position(
      { e1: 'wk', e8: 'bk' },
      { powers: { w: 'revive' }, reserve: { w: 1 }, graveyard: { w: ['p'] } },
    );
    const revived = ok(
      applyAction(state, {
        type: 'power',
        power: 'revive',
        args: { kind: 'revive', piece: 'p', to: parseSquare('b2') },
      }),
    );
    const black = ok(move(revived, 'e8', 'd8'));
    expect(hasMove(legalMoves(black, 'w'), 'b2', 'b4')).toBe(false);
    expect(hasMove(legalMoves(black, 'w'), 'b2', 'b3')).toBe(true);
  });

  it('a revived piece comes back without the enchantment it carried', () => {
    const state = position(
      { e1: 'wk', e8: 'bk', d4: 'bp' },
      { powers: { w: 'revive' }, reserve: { w: 1 }, graveyard: { w: ['p'] } },
    );
    const revived = ok(
      applyAction(state, {
        type: 'power',
        power: 'revive',
        args: { kind: 'revive', piece: 'p', to: parseSquare('b2') },
      }),
    );
    expect(at(revived, 'b2')!.ench).toBeNull();
  });
});

describe('Clocks and Time Manipulation', () => {
  const timed = (id: '3+2' | '5+5' | '10+0') => newClock(TIME_CONTROLS[id]);

  it('charges the mover and pays the increment on every action', () => {
    const state = position({ e1: 'wk', e8: 'bk', a2: 'wp' }, { clock: timed('3+2') });
    const after = ok(
      applyAction(state, {
        type: 'move',
        from: parseSquare('a2'),
        to: parseSquare('a3'),
        spentMs: 5_000,
      }),
    );
    // 180s − 5s spent + 2s increment
    expect(after.clock!.w.ms).toBe(177_000);
    expect(after.clock!.b.ms).toBe(180_000);
  });

  it('buys a permanent extra second per move where there is an increment', () => {
    const state = position(
      { e1: 'wk', e8: 'bk', a2: 'wp' },
      { powers: { w: 'chrono' }, clock: timed('3+2') },
    );
    const bent = ok(
      applyAction(state, { type: 'power', power: 'chrono', args: { kind: 'chrono' }, spentMs: 1_000 }),
    );
    expect(bent.clock!.w.bonusIncrementMs).toBe(1_000);
    expect(bent.clock!.w.ms).toBe(180_000 - 1_000 + 2_000 + 1_000);
    expect(bent.powers.w.spent).toContain('chrono');

    const black = ok(applyAction(bent, { type: 'move', from: parseSquare('e8'), to: parseSquare('d8'), spentMs: 0 }));
    const later = ok(
      applyAction(black, { type: 'move', from: parseSquare('a2'), to: parseSquare('a3'), spentMs: 10_000 }),
    );
    expect(later.clock!.w.ms).toBe(bent.clock!.w.ms - 10_000 + 3_000); // 2s control + 1s bought
  });

  it('pays a flat 30 seconds where there is no increment', () => {
    const state = position(
      { e1: 'wk', e8: 'bk' },
      { powers: { w: 'chrono' }, clock: timed('10+0') },
    );
    const bent = ok(
      applyAction(state, { type: 'power', power: 'chrono', args: { kind: 'chrono' }, spentMs: 4_000 }),
    );
    expect(bent.clock!.w.ms).toBe(600_000 - 4_000 + 30_000);
    expect(bent.clock!.w.bonusIncrementMs).toBe(0);
  });

  it('is unusable without a clock, and never usable twice', () => {
    const untimed = position({ e1: 'wk', e8: 'bk' }, { powers: { w: 'chrono' } });
    expect(powerActions(untimed, 'w')).toHaveLength(0);
    expect(powerUnavailableReason(untimed, 'w')).toBe('no clock');

    const state = position({ e1: 'wk', e8: 'bk' }, { powers: { w: 'chrono' }, clock: timed('5+5') });
    const bent = ok(applyAction(state, { type: 'power', power: 'chrono', args: { kind: 'chrono' } }));
    expect(powerActions(bent, 'w')).toHaveLength(0);
  });

  it('is illegal while in check, like every other power', () => {
    const state = position(
      { e1: 'wk', e8: 'br', a8: 'bk' },
      { powers: { w: 'chrono' }, clock: timed('3+2') },
    );
    expect(powerActions(state, 'w')).toHaveLength(0);
    expect(isError(applyAction(state, { type: 'power', power: 'chrono', args: { kind: 'chrono' } }))).toBe(true);
  });

  it('flags the side that runs out of time', () => {
    const state = position({ e1: 'wk', e8: 'bk', a2: 'wp' }, { clock: timed('3+2') });
    const early = applyAction(state, { type: 'flag', spentMs: 1_000 });
    expect(isError(early)).toBe(true); // the clock has not run out yet

    const flagged = ok(applyAction(state, { type: 'flag', spentMs: 200_000 }));
    expect(flagged.status).toEqual({ kind: 'flagged', winner: 'b' });
    expect(flagged.clock!.w.ms).toBeLessThanOrEqual(0);
  });
});

describe('Serialization and replay', () => {
  /** Spec §7 acceptance: export → import → replay must reproduce the identical position. */
  it('an action log replays to a byte-identical state', () => {
    const start = applyLoadout(
      applyLoadout(initialState({ clock: newClock(TIME_CONTROLS['3+2']) }), 'w', {
        enchantments: { b2: 'taunt', c2: 'martyr' },
        power: 'revive',
      }),
      'b',
      { enchantments: { d7: 'taunt', e7: 'swift' }, power: 'chrono' },
    );

    const script: Action[] = [
      { type: 'move', from: parseSquare('e2'), to: parseSquare('e4'), spentMs: 3_000 },
      { type: 'move', from: parseSquare('e7'), to: parseSquare('e5'), spentMs: 1_500 },
      { type: 'move', from: parseSquare('g1'), to: parseSquare('f3'), spentMs: 900 },
      { type: 'move', from: parseSquare('b8'), to: parseSquare('c6'), spentMs: 400 },
      { type: 'power', power: 'chrono', args: { kind: 'chrono' }, spentMs: 200 },
    ];

    const play = (from: GameState) =>
      script.reduce<GameState>((state, action) => {
        // Black's power lands on its own turn; skip anything the engine rejects.
        const next = applyAction(state, action);
        return isError(next) ? state : next;
      }, from);

    const live = play(start);
    const revived = play(deserialize(serialize(start)));

    expect(serialize(revived)).toBe(serialize(live));
    expect(toFen(revived)).toBe(toFen(live));
    expect(revived.clock).toEqual(live.clock);
    expect(revived.log).toHaveLength(live.log.length);
  });

  it('a serialized mid-game state resumes exactly where it left off', () => {
    const state = position({ e1: 'wk', e8: 'bk', d4: 'wp:swift', c5: 'bp' });
    const advanced = ok(
      applyAction(state, { type: 'move', from: parseSquare('d4'), to: parseSquare('d6') }),
    );
    const round = deserialize(serialize(advanced));
    expect(toFen(round)).toBe(toFen(advanced));
    expect(legalMoves(round, 'b').length).toBe(legalMoves(advanced, 'b').length);
    expect(round.ep).toBe(advanced.ep);
  });
});

describe('Chess960 castling edge cases', () => {
  it('castles from an off-centre king file, landing king g1 / rook f1', () => {
    const state = parseFen('7k/8/8/8/8/8/8/1KR5 w C - 0 1');
    const castle = legalMoves(state, 'w').find((m) => m.flags?.includes('castleK'));
    expect(castle).toBeDefined();
    expect(squareName(castle!.to)).toBe('g1');
    const after = ok(applyAction(state, castle!));
    expect(at(after, 'g1')).toMatchObject({ type: 'k', color: 'w' });
    expect(at(after, 'f1')).toMatchObject({ type: 'r', color: 'w' });
    expect(at(after, 'b1')).toBeNull();
    expect(at(after, 'c1')).toBeNull();
    expect(after.castling.w).toEqual({ kingRookFile: null, queenRookFile: null });
  });

  it('handles the castle where the king does not actually move', () => {
    // King already stands on g1 with its rook on h1: only the rook travels.
    const state = parseFen('6kr/8/8/8/8/8/8/6KR w Hh - 0 1');
    const castle = legalMoves(state, 'w').find((m) => m.flags?.includes('castleK'));
    expect(castle).toBeDefined();
    expect(castle!.from).toBe(castle!.to);
    const after = ok(applyAction(state, castle!));
    expect(at(after, 'g1')).toMatchObject({ type: 'k' });
    expect(at(after, 'f1')).toMatchObject({ type: 'r' });
    expect(at(after, 'h1')).toBeNull();
  });

  it('refuses to castle through an attacked square', () => {
    // The black rook on e8 rakes the e-file, which the king must cross.
    const state = parseFen('4r3/8/8/8/8/8/8/1KR5 w C - 0 1');
    expect(legalMoves(state, 'w').some((m) => m.flags?.includes('castleK'))).toBe(false);
  });

  it('refuses to castle when a piece blocks the rook’s destination', () => {
    const state = parseFen('7k/8/8/8/8/8/8/1KR2N2 w C - 0 1');
    expect(legalMoves(state, 'w').some((m) => m.flags?.includes('castleK'))).toBe(false);
  });
});

describe('Draw counters', () => {
  it('declares a fifty-move draw on the hundredth quiet ply', () => {
    const state = { ...position({ e1: 'wk', e8: 'bk', a1: 'wr', h8: 'br' }), halfmove: 99 };
    const after = ok(
      applyAction(state, { type: 'move', from: parseSquare('a1'), to: parseSquare('a2') }),
    );
    expect(after.halfmove).toBe(100);
    expect(after.status).toEqual({ kind: 'draw', reason: 'fifty-move' });
  });

  it('a pawn move resets the fifty-move clock', () => {
    const state = { ...position({ e1: 'wk', e8: 'bk', b2: 'wp', h8: 'br' }), halfmove: 99 };
    const after = ok(
      applyAction(state, { type: 'move', from: parseSquare('b2'), to: parseSquare('b3') }),
    );
    expect(after.halfmove).toBe(0);
    expect(after.status.kind).toBe('ongoing');
  });

  it('declares a draw when a position repeats three times', () => {
    let state = position({ e1: 'wk', e8: 'bk', a1: 'wr', h8: 'br' });
    const shuffle: [string, string][] = [
      ['a1', 'b1'],
      ['h8', 'g8'],
      ['b1', 'a1'],
      ['g8', 'h8'],
    ];
    // Two full cycles bring the start position back for the third time.
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [from, to] of shuffle) {
        state = ok(applyAction(state, { type: 'move', from: parseSquare(from), to: parseSquare(to) }));
      }
    }
    expect(state.status).toEqual({ kind: 'draw', reason: 'threefold' });
  });
});

describe('Teleport may not strand a pawn on its crowning rank', () => {
  const landingsFor = (state: GameState, from: string) =>
    powerActions(state, 'w')
      .filter(
        (a) => a.args.kind === 'teleport' && (a.args as { from: number }).from === parseSquare(from),
      )
      .map((a) => (a.args as { to: number }).to);

  it('offers a pawn no square on the eighth rank', () => {
    // Arriving there would leave it with no forward move and no capture, for the rest of the
    // game: teleport is a move, not a promotion. Letting it crown instead would make the power
    // a free queen, which is why the square is simply not offered.
    const state = position({ e1: 'wk', a8: 'bk', b2: 'wp' }, { powers: { w: 'teleport' } });
    const eighth = landingsFor(state, 'b2').filter((to) => to >> 3 === 7);
    expect(eighth).toHaveLength(0);
    expect(landingsFor(state, 'b2').length).toBeGreaterThan(0);
  });

  it('offers a Herald pawn no square on the seventh either, since that is where it crowns', () => {
    const state = position({ e1: 'wk', a8: 'bk', b2: 'wp:herald' }, { powers: { w: 'teleport' } });
    const late = landingsFor(state, 'b2').filter((to) => to >> 3 >= 6);
    expect(late).toHaveLength(0);
  });

  it('still lets a knight land on the last rank', () => {
    const state = position({ e1: 'wk', a8: 'bk', b1: 'wn' }, { powers: { w: 'teleport' } });
    expect(landingsFor(state, 'b1').filter((to) => to >> 3 === 7).length).toBeGreaterThan(0);
  });
});

describe('Teleport may not deliver check', () => {
  it('excludes every landing square that would check the enemy king', () => {
    const state = position({ e1: 'wk', e8: 'bk', a1: 'wr' }, { powers: { w: 'teleport' } });
    const landings = powerActions(state, 'w')
      .filter((a) => a.args.kind === 'teleport' && (a.args as { from: number }).from === parseSquare('a1'))
      .map((a) => (a.args as { to: number }).to);

    // The rook could reach e-file and 8th-rank squares, but those would give check.
    expect(landings).not.toContain(parseSquare('e4'));
    expect(landings).not.toContain(parseSquare('a8'));
    expect(landings).toContain(parseSquare('b3'));
    expect(landings.length).toBeGreaterThan(0);
  });

  it('still allows a quiet relocation of the same piece', () => {
    const state = position({ e1: 'wk', e8: 'bk', a1: 'wr' }, { powers: { w: 'teleport' } });
    const quiet = powerActions(state, 'w').find(
      (a) => a.args.kind === 'teleport' && (a.args as { to: number }).to === parseSquare('c3'),
    );
    expect(quiet).toBeDefined();
    const after = ok(applyAction(state, quiet!));
    expect(at(after, 'c3')).toMatchObject({ type: 'r', color: 'w' });
    expect(inCheck(after, 'b')).toBe(false);
  });
});

describe('Relocate may not deliver check', () => {
  it('refuses a swap that would place the piece on a checking square', () => {
    // The swap sends the partner piece onto the king's square. Swapping with the a1 rook would
    // land it on d1, checking the black king down the open d-file, so it is not offered.
    const state = position({ d1: 'wk', a1: 'wr', h2: 'wp', d8: 'bk' }, { powers: { w: 'relocate' } });
    const partners = powerActions(state, 'w').map((a) => (a.args as { with: number }).with);
    expect(partners).not.toContain(parseSquare('a1'));
    expect(partners).toContain(parseSquare('h2'));
  });
});

describe('Revive may not deliver check', () => {
  it('drops the checking squares from the landing zone', () => {
    const state = position(
      { e1: 'wk', e8: 'bk', h4: 'wp' },
      { powers: { w: 'revive' }, reserve: { w: 3 }, graveyard: { w: ['n'] } },
    );
    const squares = powerActions(state, 'w')
      .filter((a) => a.args.kind === 'revive')
      .map((a) => (a.args as { to: number }).to);

    // A knight on d6 or f6 would check the king on e8, so neither is offered.
    expect(squares).not.toContain(parseSquare('d6'));
    expect(squares).not.toContain(parseSquare('f6'));
    expect(squares.length).toBeGreaterThan(0);
  });
});

describe('Carrier errors are shown to a player, so they read as prose', () => {
  it('names the enchantment and the carriers in words, not in piece letters', () => {
    // This string is rendered verbatim in the loadout builder next to a greyed-out card.
    // It leaked `swift` and `p` for a while, which reads as a bug rather than a rule.
    expect(carrierError('swift', 'n')).toBe('Swift may only be carried by pawns');
    expect(carrierError('outpost', 'r')).toBe(
      'Outpost may only be carried by pawns, knights and bishops',
    );
    expect(carrierError('taunt', 'k')).toBe('The King bows to no enchantment');
  });

  it('says nothing when the carrier is legal', () => {
    expect(carrierError('swift', 'p')).toBeNull();
    // A Dragon is never shielded — the raise sheds Taunt and the loadout refuses to sell it,
    // in agreement. The error doubles as the builder's explanation of the rule.
    expect(carrierError('taunt', 'd')).not.toBeNull();
    expect(carrierError('martyr', 'd')).toBeNull();
  });
});

/** The Book of Immolation: a pawn that burns the ground in front of it when it dies.
 *
 *  It costs the same four points as Poison and does something deliberately different. Poison is
 *  an assassin: it kills exactly whoever touched it. Immolation is area denial: it clears the
 *  three squares the carrier could itself have moved to, indiscriminately, and the piece that
 *  took it survives standing in the crater. */
describe('Immolation', () => {
  it('burns the three squares in front of the carrier, and spares the captor', () => {
    // Black's immolation pawn on d5 faces d4. Its blast is c4, d4, e4.
    const state = position(
      {
        d5: 'bp:immolation',
        c4: 'wb', // takes on the diagonal, so it arrives from inside the blast and survives
        d4: 'wr',
        e4: 'bb', // his own bishop. The fire does not check whose men are standing in it.
        c6: 'wp', // behind the blast, from White's side. Untouched.
        e1: 'wk',
        h8: 'bk',
      },
      { turn: 'w' },
    );

    const after = ok(move(state, 'c4', 'd5'));
    // The bishop took it and lives, standing where the pawn stood.
    expect(at(after, 'd5')!.type).toBe('b');
    expect(at(after, 'd5')!.color).toBe('w');
    expect(at(after, 'c4')).toBe(null);
    // Everything in the blast is gone, both colours.
    expect(at(after, 'd4')).toBe(null);
    expect(at(after, 'e4')).toBe(null);
    // Outside it, nothing moved.
    expect(at(after, 'c6')!.type).toBe('p');
    expect(after.graveyard.w).toContain('r');
    expect(after.graveyard.b).toContain('b');
  });

  it('never burns a King, on either side', () => {
    // White's immolation pawn on d4 faces d5: the blast is c5, d5, e5.
    const state = position(
      { d4: 'wp:immolation', c5: 'bk', e5: 'bq', e1: 'wk', a8: 'br' },
      { turn: 'b' },
    );
    const after = ok(move(state, 'e5', 'd4'));
    expect(at(after, 'c5')!.type).toBe('k'); // the King stands in the fire and does not burn
    expect(at(after, 'd4')!.type).toBe('q'); // the captor survives in the crater
  });

  it('goes off when a King is the one who took it', () => {
    // King Immunity stops the blast reaching a King, not a King from setting one off: the
    // square catches fire regardless of who struck it. The King takes on the diagonal from e4.
    const state = position(
      { d5: 'bp:immolation', e4: 'wk', c4: 'wr', h8: 'bk' },
      { turn: 'w' },
    );
    const after = ok(move(state, 'e4', 'd5'));
    expect(at(after, 'd5')!.type).toBe('k');
    expect(at(after, 'c4')).toBe(null); // his own rook, burned by his own capture
  });

  it('burns nothing when the carrier dies on the far rank', () => {
    // A black immolation pawn on a1 has no rank in front of it. No blast, no crash.
    const state = position({ a1: 'bp:immolation', b2: 'wb', e1: 'wk', h8: 'bk' }, { turn: 'w' });
    const after = ok(move(state, 'b2', 'a1'));
    expect(at(after, 'a1')!.type).toBe('b');
  });

  it('costs four points, and only a pawn may carry it', () => {
    expect(costOf('immolation', 'p')).toBe(4);
    expect(carrierError('immolation', 'n')).toBe('Immolation may only be carried by pawns');
  });
});

/** Destined Death — the Dark Lord's power.
 *
 *  Mark an enemy piece and it dies three of its owner's turns later. It moves, defends and
 *  captures normally until then: the mark takes a piece, it does not still one.
 *
 *  Two rules arrived after playtesting and both are load-bearing: it is spent by being used,
 *  like every other King's word, and it may not be spoken until after move ten. Every scenario
 *  here therefore starts at `ply: LATE` — a sentence passed on move two is a free piece against
 *  an opponent who has not yet developed anything worth marking. */
describe('Destined Death', () => {
  /** Comfortably past the gate: `DOOM_FROM_MOVE` is counted in whole moves, ply in half ones. */
  const LATE = 24;
  const doom = (state: GameState, target: string) =>
    applyAction(state, {
      type: 'power',
      power: 'doom',
      args: { kind: 'doom', target: parseSquare(target) },
    } as PowerAction);

  const wait = (state: GameState, from: string, to: string) => ok(move(state, from, to));

  it('takes the piece three of its owner’s turns later, not before', () => {
    const state = position(
      { e1: 'wk', h1: 'wr', e8: 'bk', a8: 'br', h8: 'bn' },
      { powers: { w: 'doom' }, ply: LATE },
    );
    let s = ok(doom(state, 'h8'));
    expect(at(s, 'h8')!.type, 'still there the moment it is marked').toBe('n');

    // Black moves, White moves, Black moves, White moves, Black moves — then it falls.
    s = wait(s, 'a8', 'b8'); // black 1
    expect(at(s, 'h8'), 'alive after its first turn').not.toBe(null);
    s = wait(s, 'h1', 'g1');
    s = wait(s, 'b8', 'a8'); // black 2
    expect(at(s, 'h8'), 'alive after its second turn').not.toBe(null);
    s = wait(s, 'g1', 'h1');
    s = wait(s, 'a8', 'b8'); // black 3
    expect(at(s, 'h8'), 'gone after its third').toBe(null);
    expect(s.graveyard.b).toContain('n');
  });

  it('lets the marked piece move and capture normally while it waits', () => {
    const state = position(
      { e1: 'wk', e8: 'bk', h8: 'bn', f4: 'wp' },
      { powers: { w: 'doom' }, ply: LATE },
    );
    let s = ok(doom(state, 'h8'));
    s = wait(s, 'h8', 'g6');
    expect(at(s, 'g6')!.type, 'the mark rides the piece, not the square').toBe('n');
    s = wait(s, 'e1', 'e2');
    s = wait(s, 'g6', 'f4');
    expect(at(s, 'f4')!.color, 'and it still captures').toBe('b');
    expect(s.graveyard.w).toContain('p');
  });

  it('never offers the King, on either side', () => {
    const state = position({ e1: 'wk', e8: 'bk', a8: 'br' }, { powers: { w: 'doom' }, ply: LATE });
    const targets = powerActions(state, 'w').map((a) => (a.args as { target: number }).target);
    expect(targets).not.toContain(parseSquare('e8'));
    expect(targets).toContain(parseSquare('a8'));
    expect(isError(doom(state, 'e8')), 'and refuses it outright').toBe(true);
  });

  it('is spent by being spoken, like every other King’s word', () => {
    // It used to be repeatable, which made Wittex less an opponent than a timer: mark, wait,
    // mark again, and a player meeting him for the first time could not be taught the rule fast
    // enough to answer it.
    const state = position(
      { e1: 'wk', e8: 'bk', a8: 'br', h8: 'bn' },
      { powers: { w: 'doom' }, ply: LATE },
    );
    const s = ok(doom(state, 'a8'));
    expect(s.powers.w.spent, 'spent').toContain('doom');
    expect(powerActions(s, 'w'), 'and offers nothing further').toHaveLength(0);
  });

  it('may not be spoken until after move ten, on either side', () => {
    const early = position({ e1: 'wk', e8: 'bk', a8: 'br' }, { powers: { w: 'doom' }, ply: 0 });
    expect(powerActions(early, 'w'), 'nothing on the table yet').toHaveLength(0);
    expect(isError(doom(early, 'a8')), 'and refused if asked for directly').toBe(true);
    expect(powerUnavailableReason(early, 'w')).toBe('not until move 11');

    const late = position({ e1: 'wk', e8: 'bk', a8: 'br' }, { powers: { w: 'doom' }, ply: LATE });
    expect(powerActions(late, 'w').length, 'and available once the game has a shape').toBeGreaterThan(0);
  });

  it('does not offer the same piece twice', () => {
    const state = position({ e1: 'wk', e8: 'bk', a8: 'br' }, { powers: { w: 'doom' }, ply: LATE });
    const s = ok(doom(state, 'a8'));
    const after = ok(move(s, 'e8', 'd8'));
    expect(powerActions(after, 'w').length, 'the only target is already marked').toBe(0);
  });

  it('lapses quietly when the piece is taken by ordinary means first', () => {
    // The black king shuffles on the a-file, well clear of the rook's rank and file, so the
    // only thing under discussion is the knight and what stands on its square afterwards.
    const state = position(
      { e1: 'wk', a5: 'bk', h8: 'bn', h1: 'wr' },
      { powers: { w: 'doom' }, ply: LATE },
    );
    let s = ok(doom(state, 'h8'));
    s = wait(s, 'a5', 'a6');
    s = wait(s, 'h1', 'h8'); // rook takes the marked knight
    expect(at(s, 'h8')!.color).toBe('w');
    // Play past the hour; the white rook standing there must not be collected in its place.
    s = wait(s, 'a6', 'a5');
    s = wait(s, 'h8', 'h7');
    s = wait(s, 'a5', 'a6');
    expect(at(s, 'h7')!.color, 'the mark died with its owner').toBe('w');
    expect(s.doomed, 'and the sentence is cleared away').toHaveLength(0);
  });
});

/** The chronicle is the export format as well as the reading experience, so every power has to
 *  say what it actually did. Destined Death fell through to the `chrono` fallback and logged
 *  `⚡doom(time)` — a record of a death sentence with no name on it. */
describe('Power notation names its target', () => {
  it('records the square Destined Death was laid on', () => {
    const state = position({ e1: 'wk', e8: 'bk', h8: 'br' }, { powers: { w: 'doom' } });
    const san = toSan(state, {
      type: 'power',
      power: 'doom',
      args: { kind: 'doom', target: parseSquare('h8') },
    });
    expect(san).toBe('⚡doom(†h8)');
    expect(san).not.toContain('time');
  });
});

/*  The Archbishop. He walks the diagonals like a bishop, and instead of arriving on a piece he
 *  can stop it where it stands: a Martyr freeze, laid on purpose and as often as he likes. */
describe('The Archbishop binds instead of taking', () => {
  it('reaches exactly as far as a bishop, and no further', () => {
    // A blocker on the diagonal hides everything behind it, same as any bishop.
    const state = position(
      { d4: 'wa', f6: 'bn', g7: 'br', e1: 'wk', a8: 'bk' },
      { turn: 'w' },
    );
    const targets = bindActions(state).map((b) => squareName(b.target));
    expect(targets).toContain('f6');
    expect(targets).not.toContain('g7');
  });

  it('leaves the binder where it stands and takes nothing', () => {
    const state = position({ d4: 'wa', f6: 'bn', e1: 'wk', a8: 'bk' }, { turn: 'w' });
    const after = ok(applyAction(state, { type: 'bind', from: parseSquare('d4'), target: parseSquare('f6') }));
    expect(after.board[parseSquare('d4')]!.type).toBe('a');
    expect(after.board[parseSquare('f6')]!.type).toBe('n');
    expect(after.graveyard.b).toEqual([]);
  });

  it('freezes the piece for exactly its owner’s next turn (M1 semantics)', () => {
    const state = position({ d4: 'wa', f6: 'bn', e1: 'wk', a8: 'bk' }, { turn: 'w' });
    const after = ok(applyAction(state, { type: 'bind', from: parseSquare('d4'), target: parseSquare('f6') }));
    const knight = after.board[parseSquare('f6')]!;
    expect(isFrozen(after, knight)).toBe(true);
    expect(hasMove(legalMoves(after), 'f6', 'e4')).toBe(false);
  });

  it('does not stop the bound piece defending — it restricts movement only', () => {
    // The knight on f6 is frozen but still covers d5, so the King may not step there.
    const state = position({ d4: 'wa', f6: 'bn', e1: 'wk', a8: 'bk' }, { turn: 'w' });
    const after = ok(applyAction(state, { type: 'bind', from: parseSquare('d4'), target: parseSquare('f6') }));
    expect(isAttacked(after.board, parseSquare('d5'), 'b')).toBe(true);
  });

  it('may not bind a King — he bows to nothing, same as Decree', () => {
    const state = position({ d4: 'wa', g7: 'bk', e1: 'wk' }, { turn: 'w' });
    expect(bindActions(state).map((b) => squareName(b.target))).not.toContain('g7');
  });

  it('may not bind while its own King is in check (the T4 principle)', () => {
    // Black rook on e8 checks the white king on e1; a binding does not answer that.
    const state = position({ d4: 'wa', f6: 'bn', e1: 'wk', e8: 'br', a8: 'bk' }, { turn: 'w' });
    expect(inCheck(state, 'w')).toBe(true);
    expect(bindActions(state)).toHaveLength(0);
  });

  it('does not offer a second binding on a piece already bound', () => {
    // The spare pawn exists so Black has a legal move that is not the frozen knight and not
    // the king walking onto the Archbishop's own diagonal.
    const state = position({ d4: 'wa', f6: 'bn', h7: 'bp', e1: 'wk', a8: 'bk' }, { turn: 'w' });
    const after = ok(applyAction(state, { type: 'bind', from: parseSquare('d4'), target: parseSquare('f6') }));
    const black = ok(applyAction(after, { type: 'move', from: parseSquare('h7'), to: parseSquare('h6') }));
    expect(bindActions(black, 'w').map((b) => squareName(b.target))).not.toContain('f6');
  });
});

/** The Squire — a pawn whose only move is to change places with a Herald.
 *
 *  Herald on its own is the weakest thing on the shelf: crowning a rank early is worth little
 *  when the pawn still has six ranks to walk. The Squire is the delivery mechanism. A Herald
 *  stuck behind its own army and a Squire that has walked to the seventh rank are, together, a
 *  queen — and that is the whole reason both exist. */
describe('The Squire', () => {
  const swap = (state: GameState, from: string, to: string, promo?: PieceType) =>
    applyAction(state, {
      type: 'swap',
      from: parseSquare(from),
      to: parseSquare(to),
      ...(promo ? { promo } : {}),
    } as Action);

  it('changes places with a friendly Herald', () => {
    const s = position({ e1: 'wk', e8: 'bk', a2: 'wp:squire', b3: 'wp:herald' });
    const after = ok(swap(s, 'a2', 'b3'));
    expect(at(after, 'b3')!.ench, 'the squire took the herald’s square').toBe('squire');
    expect(at(after, 'a2')!.ench, 'and the herald took his').toBe('herald');
  });

  it('crowns the Herald when the trade lands it on the seventh rank', () => {
    // The point of the pair: the squire has walked to the seventh, the herald has not, and one
    // turn turns the herald into a queen without it ever making the walk.
    const s = position({ e1: 'wk', e8: 'bk', a7: 'wp:squire', b2: 'wp:herald' });
    const after = ok(swap(s, 'a7', 'b2', 'q'));
    expect(at(after, 'b2')!.ench, 'the squire is where the herald was').toBe('squire');
    const crowned = at(after, 'a7')!;
    expect(crowned.type, 'and the herald arrived crowned').toBe('q');
    expect(crowned.ench, 'the enchantment is spent with the promotion').toBe(null);
  });

  it('insists on being told what the Herald becomes', () => {
    const s = position({ e1: 'wk', e8: 'bk', a7: 'wp:squire', b2: 'wp:herald' });
    expect(isError(swap(s, 'a7', 'b2')), 'no piece named').toBe(true);
  });

  it('refuses a crown when the trade does not earn one', () => {
    const s = position({ e1: 'wk', e8: 'bk', a2: 'wp:squire', b3: 'wp:herald' });
    expect(isError(swap(s, 'a2', 'b3', 'q'))).toBe(true);
  });

  it('offers nothing when there is no Herald to trade with', () => {
    const s = position({ e1: 'wk', e8: 'bk', a2: 'wp:squire' });
    expect(swapActions(s, 'w')).toHaveLength(0);
  });

  it('will not trade with the enemy’s Herald', () => {
    const s = position({ e1: 'wk', e8: 'bk', a2: 'wp:squire', b7: 'bp:herald' });
    expect(swapActions(s, 'w')).toHaveLength(0);
  });

  it('cannot answer a check, because a trade moves no occupancy', () => {
    // Worth stating as a rule rather than discovered at a board: both squares are occupied
    // before and after, so a trade can neither block the checking line nor take the piece on
    // it. The same invariant is why a trade can never expose its own King either — there is no
    // king-safety filter in `swapActions` because there is provably nothing for one to catch.
    const s = position({ e1: 'wk', e8: 'bk', a2: 'wp:squire', b3: 'wp:herald', e7: 'br' });
    expect(inCheck(s, 'w'), 'the rook has the file').toBe(true);
    expect(swapActions(s, 'w'), 'nothing offered').toHaveLength(0);
    expect(isError(swap(s, 'a2', 'b3')), 'and refused if asked for directly').toBe(true);
  });

  it('is refused at the builder without a Herald in the army', () => {
    const board = initialState({});
    const check = validateLoadout(board, 'w', {
      enchantments: { a2: 'squire' },
      power: 'teleport',
    });
    expect(check.ok).toBe(false);
    expect(check.errors.join(' ')).toMatch(/needs a Herald/);

    const paired = validateLoadout(board, 'w', {
      enchantments: { a2: 'squire', b2: 'herald' },
      power: 'teleport',
    });
    expect(paired.ok, 'and allowed with one').toBe(true);
  });
});
