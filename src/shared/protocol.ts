import type { Loadout } from '../engine/loadout';
import type { Action, Color, GameState, PieceType, TimeControlId } from '../engine/types';

/** The wire protocol, shared by the browser and the server so both sides speak from one file.
 *  The server is authoritative: clients send intent, the server sends the resulting state. */

export const PROTOCOL_VERSION = 1;

export type Mode = 'classic' | '960';

export interface Seek {
  mode: Mode;
  control: TimeControlId;
}

/** What a client can say. */
export type ClientMessage =
  | { t: 'hello'; version: number; guestId?: string; name?: string }
  | { t: 'seek'; seek: Seek }
  | { t: 'unseek' }
  | { t: 'loadout'; loadout: Loadout }
  | { t: 'action'; action: Action }
  | { t: 'rematch' }
  | { t: 'leave' }
  | { t: 'ping' };

/** What the server can say. */
export type ServerMessage =
  | { t: 'welcome'; guestId: string; name: string; version: number }
  | { t: 'seeking'; waiting: number }
  | { t: 'matched'; gameId: string; you: Color; opponent: string; mode: Mode; control: TimeControlId }
  | { t: 'phase'; gameId: string; phase: RoomPhase; youReady: boolean; theyReady: boolean }
  | { t: 'reveal'; gameId: string; white: Loadout; black: Loadout; back: PieceType[] | null }
  | { t: 'state'; gameId: string; state: GameState }
  | { t: 'opponentLeft'; gameId: string }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export type RoomPhase = 'loadout' | 'reveal' | 'playing' | 'over';

export function encode(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message);
}

export function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
