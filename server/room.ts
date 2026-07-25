import { applyAction } from '../src/engine/apply';
import { initialState, random960Back } from '../src/engine/board';
import { TIME_CONTROLS, newClock } from '../src/engine/clock';
import { applyLoadout, emptyLoadout, validateLoadout, type Loadout } from '../src/engine/loadout';
import { isError, type Action, type Color, type GameState, type PieceType } from '../src/engine/types';
import type { RoomPhase, Seek } from '../src/shared/protocol';

/** One game between two people. The server holds the only real board: clients send intent and
 *  are told what happened. Every rule lives in the shared engine, so an online game and a
 *  hotseat game cannot drift apart. */

export interface RoomSeat {
  id: string;
  color: Color;
  loadout: Loadout | null;
}

export class Room {
  readonly id: string;
  readonly seek: Seek;
  readonly back: PieceType[] | null;
  readonly seats: Record<Color, RoomSeat>;
  phase: RoomPhase = 'loadout';
  state: GameState | null = null;
  /** When the side to move started thinking, in epoch ms. The server needs its own copy of
   *  this: `spentMs` arrives with a client's move, which is no use at all for the player who
   *  never sends one. */
  turnStartedAt = 0;

  constructor(id: string, white: string, black: string, seek: Seek, rand: () => number = Math.random) {
    this.id = id;
    this.seek = seek;
    this.back = seek.mode === '960' ? random960Back(rand) : null;
    this.seats = {
      w: { id: white, color: 'w', loadout: null },
      b: { id: black, color: 'b', loadout: null },
    };
  }

  seatOf(playerId: string): RoomSeat | null {
    if (this.seats.w.id === playerId) return this.seats.w;
    if (this.seats.b.id === playerId) return this.seats.b;
    return null;
  }

  opponentOf(playerId: string): RoomSeat | null {
    const seat = this.seatOf(playerId);
    return seat ? this.seats[seat.color === 'w' ? 'b' : 'w'] : null;
  }

  /** Records a loadout. The board is only built once both have been submitted and validated. */
  submitLoadout(playerId: string, loadout: Loadout): string | null {
    if (this.phase !== 'loadout') return 'the loadout phase is over';
    const seat = this.seatOf(playerId);
    if (!seat) return 'you are not seated at this board';

    const base = this.freshBoard();
    const check = validateLoadout(base, seat.color, loadout);
    if (!check.ok) return `invalid loadout: ${check.errors.join('; ')}`;

    seat.loadout = loadout;
    if (this.seats.w.loadout && this.seats.b.loadout) this.begin();
    return null;
  }

  /** A player who leaves before moving forfeits nothing; an empty seat just stops the game. */
  abandon(): void {
    this.phase = 'over';
  }

  play(playerId: string, action: Action): string | null {
    if (this.phase !== 'playing' || !this.state) return 'the game is not running';
    const seat = this.seatOf(playerId);
    if (!seat) return 'you are not seated at this board';
    if (this.state.turn !== seat.color) return 'it is not your turn';

    const next = applyAction(this.state, action);
    if (isError(next)) return next.error;

    this.state = next;
    this.turnStartedAt = Date.now();
    if (next.status.kind !== 'ongoing') this.phase = 'over';
    return null;
  }

  /** Flag-fall, decided by the server.
   *
   *  The client also watches its own clock, and in hotseat that is the whole story. Online it
   *  is not: the browser that must volunteer the loss is exactly the one that may have been
   *  backgrounded (where timers are throttled to a crawl), or left open on a stalled game, or
   *  simply told not to. Either way the opponent waits forever for a move that will never come.
   *  So the server keeps its own turn clock and calls this on a sweep.
   *
   *  Returns true when the room ended because of it. */
  checkFlag(now: number = Date.now()): boolean {
    if (this.phase !== 'playing' || !this.state?.clock) return false;
    const mover = this.state.turn;
    const spentMs = Math.max(0, now - this.turnStartedAt);
    if (this.state.clock[mover].ms - spentMs > 0) return false;

    const next = applyAction(this.state, { type: 'flag', spentMs });
    if (isError(next)) return false;
    this.state = next;
    this.phase = 'over';
    return true;
  }

  private freshBoard(): GameState {
    const control = this.seek.control === 'untimed' ? null : TIME_CONTROLS[this.seek.control];
    return initialState({
      ...(this.back ? { back: this.back } : {}),
      clock: control ? newClock(control) : null,
    });
  }

  private begin(): void {
    const white = this.seats.w.loadout ?? emptyLoadout();
    const black = this.seats.b.loadout ?? emptyLoadout();
    this.state = applyLoadout(applyLoadout(this.freshBoard(), 'w', white), 'b', black);
    this.phase = 'playing';
    this.turnStartedAt = Date.now();
  }
}
