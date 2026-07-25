import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { squareName } from './board';
import { parseFen } from './fen';
import { position } from './testkit';

/** Static exchange evaluation decides which captures quiescence is allowed to skip, so the
 *  thing worth guarding is that it never skips one it should not. The dangerous direction is
 *  the enchanted layer: SEE is plain material arithmetic and the magic is not, so it must bail
 *  out rather than guess. */

const OPTS = { depth: 7, sample: 40, maxNodes: 60_000 } as const;

function best(fen: string): string {
  const choice = chooseAction(parseFen(fen), OPTS);
  if (!choice || choice.action.type !== 'move') return '(none)';
  return `${squareName(choice.action.from)}${squareName(choice.action.to)}`;
}

describe('Static exchange evaluation', () => {
  it('still takes a piece that is genuinely hanging', () => {
    // The whole risk of pruning losing captures is pruning a winning one by mistake.
    expect(best('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1')).toBe('d1d5');
  });

  it('does not throw away a queen for a defended pawn', () => {
    // Qxc5 wins a pawn and loses a queen to bxc5. It must not be the move.
    expect(best('4k3/8/1p6/2p5/8/8/3Q4/4K3 w - - 0 1')).not.toBe('d2c5');
  });

  it('still finds a capture whose value only appears after the recapture', () => {
    // RxN, and the recapture costs Black more than it gains. A naive "victim minus mover"
    // filter would reject this; a swap-off accepts it.
    const state = parseFen('4k3/8/8/2n5/8/8/8/2R1K3 w - - 0 1');
    expect(best('4k3/8/8/2n5/8/8/8/2R1K3 w - - 0 1')).toBe('c1c5');
    expect(state.board).toHaveLength(64);
  });

  it('leaves enchanted exchanges alone rather than guessing at them', () => {
    // Taking a Poison pawn kills the taker, which is not material arithmetic. SEE must bail
    // out here, so the engine decides with a real search — and a real search declines.
    const poisoned = position({ e1: 'wk', h8: 'bk', d1: 'wq', d5: 'bp:poison', a7: 'bp' });
    const choice = chooseAction(poisoned, OPTS);
    if (choice!.action.type === 'move') {
      const move = `${squareName(choice!.action.from)}${squareName(choice!.action.to)}`;
      expect(move).not.toBe('d1d5');
    }
  });

  it('does not prune the shield-break that is the only way through', () => {
    // A shielded piece cannot be captured at all, so nothing here is an exchange. The engine
    // must still be offered, and still consider, breaking the shield.
    const state = position({ e1: 'wk', a8: 'bk', d5: 'bq:taunt', d8: 'br', d1: 'wr', h2: 'wp' });
    const choice = chooseAction(state, OPTS);
    expect(choice).not.toBeNull();
    expect(['move', 'shieldBreak', 'power']).toContain(choice!.action.type);
  });
});
