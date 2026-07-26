import { describe, expect, it } from 'vitest';
import { position } from '../engine/testkit';
import { LESSON_TEXT, lessonFor, remember, type Lesson } from './tutorial';

/* The Innkeeper teaches the parts that are not chess. The rules he covers are the ones a player
 * can only learn by losing to them once, so the tests are mostly about *when* he speaks: on the
 * player's turn, with the situation actually on the board, and never twice. */
describe('what the Innkeeper notices', () => {
  const none: Lesson[] = [];

  it('warns about a shield before anything else on the board', () => {
    // Shielded: defended by the rook and standing in Black's own half.
    const state = position({ e1: 'wk', e8: 'bk', d7: 'bn:taunt', d8: 'br' });
    expect(lessonFor(state, 'w', none)).toBe('shield');
  });

  it('warns about Poison, and about Martyr, and about Outpost', () => {
    const poison = position({ e1: 'wk', e8: 'bk', d5: 'bp:poison' });
    expect(lessonFor(poison, 'w', none)).toBe('poison');

    const martyr = position({ e1: 'wk', e8: 'bk', d5: 'bn:martyr' });
    expect(lessonFor(martyr, 'w', none)).toBe('martyr');

    const outpost = position({ e1: 'wk', e8: 'bk', d5: 'bn:outpost' });
    expect(lessonFor(outpost, 'w', none)).toBe('outpost');
  });

  it('warns about a piece of yours under sentence ahead of anything else', () => {
    // Doom outranks a shield: the shield costs a tempo, the sentence costs the piece.
    const base = position({ e1: 'wk', e8: 'bk', d7: 'bn:taunt', d8: 'br', a1: 'wr' });
    const doomed = { ...base, doomed: [{ pieceId: base.board[0]!.id, diesAtPly: 99 }] };
    expect(lessonFor(doomed, 'w', none)).toBe('doom');
  });

  it('says nothing while it is not your turn', () => {
    // A lesson delivered while the opponent is still thinking is a lesson about a board that is
    // already changing.
    const state = position({ e1: 'wk', e8: 'bk', d5: 'bp:poison' }, { turn: 'b' });
    expect(lessonFor(state, 'w', none)).toBeNull();
  });

  it('never repeats itself', () => {
    const state = position({ e1: 'wk', e8: 'bk', d5: 'bp:poison' });
    expect(lessonFor(state, 'w', ['poison'])).toBeNull();
  });

  it('mentions the King’s words only once the game has a shape', () => {
    const opening = position({ e1: 'wk', e8: 'bk' }, { powers: { w: 'teleport' } });
    expect(lessonFor(opening, 'w', none), 'not on move one').toBeNull();
    const later = { ...opening, ply: 8 };
    expect(lessonFor(later, 'w', none)).toBe('power');
  });

  it('says nothing at all to a King who knows no words', () => {
    const silent = position({ e1: 'wk', e8: 'bk' });
    const mute = { ...silent, ply: 8, powers: { ...silent.powers, w: { powers: [], spent: [], reserve: 0 } } };
    expect(lessonFor(mute, 'w', none)).toBeNull();
  });

  it('has something to say for every lesson it can name', () => {
    // A lesson with no text is a bubble that opens empty, which is worse than silence.
    for (const lesson of Object.keys(LESSON_TEXT) as Lesson[]) {
      expect(LESSON_TEXT[lesson].length, lesson).toBeGreaterThan(20);
    }
  });

  it('remembers without duplicating', () => {
    expect(remember(['poison'], 'poison')).toEqual(['poison']);
    expect(remember(['poison'], 'shield')).toEqual(['poison', 'shield']);
  });
});
