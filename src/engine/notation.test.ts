import { describe, expect, it } from 'vitest';
import { parseSquare } from './board';
import { toSan } from './notation';
import { position } from './testkit';
import type { Action } from './types';

/* Every action the game can take has to be sayable.
 *
 * The chronicle is also the export format, so a mis-rendered action is not a cosmetic slip: it
 * is what gets written to the file the player keeps. A flag — the clock running out — was the
 * one member of the Action union `toSan` did not name, and a cast at the end of the function
 * sent it into the move renderer, where `from` and `to` are undefined and both resolve to
 * square zero. Every game that has ever ended on time closed with the move "a1a1".
 *
 * The cast is gone, so an unnamed action is now a compile error rather than nonsense in the
 * log. These are the runtime half: each kind of turn says the right thing. */
describe('every action the chronicle can be handed', () => {
  const board = position(
    { e1: 'wk', e8: 'bk', d1: 'wr', d7: 'bp:taunt', d8: 'br', b2: 'wa', a2: 'wp:squire', g2: 'wp:herald' },
    { ply: 20 },
  );

  it('names a clock running out, rather than inventing a move', () => {
    const said = toSan(board, { type: 'flag' });
    expect(said).toBe('⏱');
    expect(said, 'the old fall-through rendered square zero twice').not.toContain('a1');
  });

  it('keeps the marks that separate a turn from a move', () => {
    expect(toSan(board, { type: 'resign' })).toBe('resign');
    expect(toSan(board, { type: 'drawOffer' })).toBe('(=)');
    expect(toSan(board, { type: 'drawAccept' })).toBe('½-½');
    expect(toSan(board, { type: 'shieldBreak', from: parseSquare('d1'), target: parseSquare('d7') })).toBe('⊘d7');
    expect(toSan(board, { type: 'bind', from: parseSquare('b2'), target: parseSquare('d7') })).toBe('⛨d7');
    expect(toSan(board, { type: 'power', power: 'chrono', args: { kind: 'chrono' } })).toBe('⚡chrono(time)');
  });

  it('says an ordinary move the ordinary way', () => {
    expect(toSan(board, { type: 'move', from: parseSquare('d1'), to: parseSquare('d4') })).toBe('Rd4');
  });

  it('never renders any action as an empty or square-zero string', () => {
    // A sweep rather than a list, so a new action type that slips past review still trips here.
    const every: Action[] = [
      { type: 'move', from: parseSquare('d1'), to: parseSquare('d4') },
      { type: 'shieldBreak', from: parseSquare('d1'), target: parseSquare('d7') },
      { type: 'bind', from: parseSquare('b2'), target: parseSquare('d7') },
      { type: 'power', power: 'chrono', args: { kind: 'chrono' } },
      { type: 'flag' },
      { type: 'resign' },
      { type: 'drawOffer' },
      { type: 'drawAccept' },
    ];
    for (const action of every) {
      const said = toSan(board, action);
      expect(said.length, action.type).toBeGreaterThan(0);
      expect(said, `${action.type} fell through to the move renderer`).not.toBe('a1a1');
    }
  });
});
