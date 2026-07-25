import { describe, expect, it } from 'vitest';
import { Room } from './room';
import { emptyLoadout } from '../src/engine/loadout';

/** The server owns the clock. The client also watches its own, and in hotseat that is enough,
 *  but online the browser that must volunteer the loss is exactly the one that may have been
 *  backgrounded, closed on a stalled game, or told not to. */
describe('Room.checkFlag', () => {
  const seated = () => {
    const room = new Room('r1', 'white-id', 'black-id', { mode: 'classic', control: '3+2' });
    room.submitLoadout('white-id', emptyLoadout());
    room.submitLoadout('black-id', emptyLoadout());
    return room;
  };

  it('does nothing while there is time on the clock', () => {
    const room = seated();
    expect(room.phase).toBe('playing');
    expect(room.checkFlag(room.turnStartedAt + 1_000)).toBe(false);
    expect(room.phase).toBe('playing');
  });

  it('ends the game when the side to move runs out, without them sending anything', () => {
    const room = seated();
    const mover = room.state!.turn;
    // Well past a three minute clock, and the mover has sent no action at all.
    expect(room.checkFlag(room.turnStartedAt + 200_000)).toBe(true);
    expect(room.phase).toBe('over');
    expect(room.state!.status).toEqual({
      kind: 'flagged',
      winner: mover === 'w' ? 'b' : 'w',
    });
  });

  it('is idempotent: a finished room does not flag twice', () => {
    const room = seated();
    expect(room.checkFlag(room.turnStartedAt + 200_000)).toBe(true);
    expect(room.checkFlag(room.turnStartedAt + 400_000)).toBe(false);
  });

  it('leaves an untimed room alone forever', () => {
    const room = new Room('r2', 'w', 'b', { mode: 'classic', control: 'untimed' });
    room.submitLoadout('w', emptyLoadout());
    room.submitLoadout('b', emptyLoadout());
    expect(room.checkFlag(room.turnStartedAt + 10_000_000)).toBe(false);
    expect(room.phase).toBe('playing');
  });

  it('restarts the turn clock after every move, so the count is per turn', () => {
    const room = seated();
    const before = room.turnStartedAt;
    room.play('white-id', { type: 'move', from: 12, to: 28 });
    expect(room.turnStartedAt).toBeGreaterThanOrEqual(before);
    // Black has a full clock again from here, so a short pause is not a flag.
    expect(room.checkFlag(room.turnStartedAt + 1_000)).toBe(false);
  });
});
