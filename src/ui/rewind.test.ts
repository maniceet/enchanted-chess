import { describe, expect, it } from 'vitest';
import { describeHead, headIndex, jumpHead, stepHead } from './rewind';

/* A game with four plies played: history is [opening, p1, p2, p3, p4], length 5, last index 4. */
const LEN = 5;

describe('the review head', () => {
  it('starts at the live board and steps back from the end', () => {
    expect(stepHead(null, -1, LEN)).toBe(3);
    expect(stepHead(3, -1, LEN)).toBe(2);
  });

  it('stops at the opening rather than walking off the front', () => {
    expect(stepHead(0, -1, LEN)).toBe(0);
  });

  it('returns to the live board when it walks off the end', () => {
    // Reaching the newest stored position *is* the live board: pinning it would leave the
    // viewer one move behind the moment the opponent replied.
    expect(stepHead(3, 1, LEN)).toBe(null);
    expect(stepHead(null, 1, LEN)).toBe(null);
  });

  it('has nowhere to go before a move has been played', () => {
    expect(stepHead(null, -1, 1)).toBe(null);
    expect(stepHead(null, -1, 0)).toBe(null);
  });

  it('jumps to the position a chronicle entry produced', () => {
    expect(jumpHead(1, LEN)).toBe(1);
    expect(jumpHead(3, LEN)).toBe(3);
  });

  it('treats a jump to the last ply as a return to the game', () => {
    expect(jumpHead(4, LEN)).toBe(null);
    expect(jumpHead(9, LEN)).toBe(null);
  });

  it('clamps a pinned head when undo shortens the history beneath it', () => {
    expect(headIndex(3, LEN)).toBe(3);
    expect(headIndex(3, 2)).toBe(1);
    expect(headIndex(null, LEN)).toBe(4);
    expect(headIndex(null, 0)).toBe(0);
  });

  it('names the position under the head', () => {
    expect(describeHead(0)).toBe('the opening position');
    expect(describeHead(1)).toBe('move 1, White');
    expect(describeHead(2)).toBe('move 1, Black');
    expect(describeHead(3)).toBe('move 2, White');
  });
});
