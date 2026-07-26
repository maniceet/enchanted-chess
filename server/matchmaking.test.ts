import { describe, expect, it } from 'vitest';
import { Matchmaker } from './matchmaking';
import { Room } from './room';
import { parseSquare } from '../src/engine/board';
import { BUDGET, ENCH_COST } from '../src/engine/loadout';
import type { Seek } from '../src/shared/protocol';

const blitz: Seek = { mode: 'classic', control: '3+2' };
const slow: Seek = { mode: 'classic', control: '10+0' };
const random960: Seek = { mode: '960', control: '3+2' };

describe('Matchmaking', () => {
  it('holds the first seeker and pairs the second', () => {
    const mm = new Matchmaker();
    expect(mm.seek('ann', blitz, 0)).toBeNull();
    expect(mm.waiting(blitz)).toBe(1);

    const pairing = mm.seek('bo', blitz, 10, () => 0.1);
    expect(pairing).toEqual({ white: 'ann', black: 'bo', seek: blitz });
    expect(mm.waiting(blitz)).toBe(0);
  });

  it('keeps separate queues per time control and per mode', () => {
    const mm = new Matchmaker();
    mm.seek('ann', blitz, 0);
    expect(mm.seek('bo', slow, 0)).toBeNull();
    expect(mm.seek('cy', random960, 0)).toBeNull();
    expect(mm.waiting(blitz)).toBe(1);
    expect(mm.waiting(slow)).toBe(1);
    expect(mm.size()).toBe(3);
  });

  it('never pairs someone with themselves, even if they seek twice', () => {
    const mm = new Matchmaker();
    expect(mm.seek('ann', blitz, 0)).toBeNull();
    expect(mm.seek('ann', blitz, 1)).toBeNull();
    expect(mm.waiting(blitz)).toBe(1);
  });

  it('gives White to either side depending on the coin', () => {
    const mm = new Matchmaker();
    mm.seek('ann', blitz, 0);
    expect(mm.seek('bo', blitz, 1, () => 0.9)?.white).toBe('bo');
  });

  it('drops seekers who have waited too long', () => {
    const mm = new Matchmaker();
    mm.seek('ann', blitz, 0);
    mm.seek('bo', slow, 20_000);
    // At 40s, Ann has waited the full 40 and Bo only 20, so only Ann is stale.
    expect(mm.sweep(40_000, 30_000)).toEqual(['ann']);
    expect(mm.waiting(blitz)).toBe(0);
    expect(mm.waiting(slow)).toBe(1);
  });

  it('forgets a seeker who cancels', () => {
    const mm = new Matchmaker();
    mm.seek('ann', blitz, 0);
    mm.unseek('ann');
    expect(mm.size()).toBe(0);
  });
});

describe('A room', () => {
  const bothIn = () => {
    const room = new Room('g1', 'ann', 'bo', blitz);
    expect(room.submitLoadout('ann', { enchantments: { a2: 'poison' }, power: 'teleport' })).toBeNull();
    expect(room.phase).toBe('loadout');
    expect(room.submitLoadout('bo', { enchantments: { d7: 'taunt' }, power: 'revive' })).toBeNull();
    return room;
  };

  it('starts only once both loadouts are in, and applies them', () => {
    const room = bothIn();
    expect(room.phase).toBe('playing');
    expect(room.state!.board[parseSquare('a2')]!.ench).toBe('poison');
    expect(room.state!.board[parseSquare('d7')]!.ench).toBe('taunt');
    expect(room.state!.powers.b.power).toBe('revive');
    expect(room.state!.clock!.control.id).toBe('3+2');
  });

  it('refuses a loadout that breaks the budget', () => {
    const room = new Room('g2', 'ann', 'bo', blitz);
    // Derived from BUDGET rather than hard-coded. This fixture used to be two Poison pawns,
    // which was over the old budget of four and is comfortably *under* the current ten — so it
    // silently stopped testing anything the moment the number moved. Enough pawns to exceed
    // whatever the budget is, and it stays a real test through the next change too.
    const pawns = ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'];
    const needed = Math.floor(BUDGET / ENCH_COST.poison) + 1;
    const enchantments = Object.fromEntries(
      pawns.slice(0, needed).map((square) => [square, 'poison' as const]),
    );
    expect(needed * ENCH_COST.poison, 'the fixture really is over budget').toBeGreaterThan(BUDGET);
    expect(room.submitLoadout('ann', { enchantments, power: 'teleport' })).toMatch(/over budget/);
    expect(room.phase).toBe('loadout');
  });

  it('refuses a loadout from someone who is not seated', () => {
    const room = new Room('g3', 'ann', 'bo', blitz);
    expect(room.submitLoadout('cy', { enchantments: {}, power: 'teleport' })).toMatch(/not seated/);
  });

  it('enforces turn order and legality', () => {
    const room = bothIn();
    const e2e4 = { type: 'move' as const, from: parseSquare('e2'), to: parseSquare('e4') };

    expect(room.play('bo', e2e4)).toMatch(/not your turn/);
    expect(room.play('ann', e2e4)).toBeNull();
    expect(room.play('ann', { type: 'move', from: parseSquare('e4'), to: parseSquare('e5') })).toMatch(
      /not your turn/,
    );
    expect(room.play('bo', { type: 'move', from: parseSquare('a7'), to: parseSquare('a6') })).toBeNull();
  });

  it('rejects an illegal move with the engine’s own reason', () => {
    const room = bothIn();
    expect(room.play('ann', { type: 'move', from: parseSquare('e2'), to: parseSquare('e5') })).toMatch(
      /illegal move/,
    );
  });

  it('closes when the game ends', () => {
    const room = bothIn();
    expect(room.play('ann', { type: 'resign' })).toBeNull();
    expect(room.phase).toBe('over');
    expect(room.state!.status).toEqual({ kind: 'resigned', winner: 'b' });
  });

  it('deals a 960 back rank that both sides share', () => {
    const room = new Room('g4', 'ann', 'bo', random960, () => 0.42);
    expect(room.back).not.toBeNull();
    expect(room.back).toHaveLength(8);
    expect(room.back!.filter((p) => p === 'k')).toHaveLength(1);
  });
});
