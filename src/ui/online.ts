import type { Loadout } from '../engine/loadout';
import type { Action, Color, GameState, PieceType, TimeControlId } from '../engine/types';
import {
  PROTOCOL_VERSION,
  decode,
  encode,
  type ClientMessage,
  type Mode,
  type ServerMessage,
} from '../shared/protocol';

/** The client half of online play. It owns one socket, reconnects when the connection drops,
 *  and hands the app a plain snapshot to render. The server is the only board: this file never
 *  decides a rule, it only relays intent and shows what came back. */

export type OnlineStatus =
  | 'offline'
  | 'connecting'
  | 'idle'
  | 'seeking'
  | 'loadout'
  | 'playing'
  | 'over'
  | 'abandoned';

export interface OnlineSnapshot {
  status: OnlineStatus;
  you: Color | null;
  opponent: string | null;
  gameId: string | null;
  mode: Mode;
  control: TimeControlId;
  back: PieceType[] | null;
  loadouts: { white: Loadout | null; black: Loadout | null };
  youReady: boolean;
  theyReady: boolean;
  state: GameState | null;
  waiting: number;
  error: string | null;
}

const blank: OnlineSnapshot = {
  status: 'offline',
  you: null,
  opponent: null,
  gameId: null,
  mode: 'classic',
  control: '3+2',
  back: null,
  loadouts: { white: null, black: null },
  youReady: false,
  theyReady: false,
  state: null,
  waiting: 0,
  error: null,
};

function socketUrl(): string {
  // Set VITE_WS_URL when the game and the server live on different hosts.
  const override = (import.meta as { env?: Record<string, string> }).env?.VITE_WS_URL;
  if (override) return override;
  const secure = location.protocol === 'https:';
  // In dev the site is on Vite's port and the server on its own, so default to 8080 there.
  const host = location.port === '5183' ? `${location.hostname}:8080` : location.host;
  return `${secure ? 'wss' : 'ws'}://${host}/ws`;
}

export class OnlineClient {
  private socket: WebSocket | null = null;
  private snapshot: OnlineSnapshot = { ...blank };
  private listeners = new Set<(snapshot: OnlineSnapshot) => void>();
  private retry: number | null = null;
  private wanted: { mode: Mode; control: TimeControlId } | null = null;

  subscribe(listener: (snapshot: OnlineSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  get current(): OnlineSnapshot {
    return this.snapshot;
  }

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.update({ status: 'connecting', error: null });

    const socket = new WebSocket(socketUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.send({ t: 'hello', version: PROTOCOL_VERSION });
      // A reconnect mid-search should put us back in the queue where we were.
      if (this.wanted) this.send({ t: 'seek', seek: this.wanted });
    };

    socket.onmessage = (event) => {
      const message = decode<ServerMessage>(String(event.data));
      if (message) this.receive(message);
    };

    socket.onclose = () => {
      this.socket = null;
      this.update({ status: 'offline' });
      this.scheduleRetry();
    };

    socket.onerror = () => {
      this.update({ error: 'could not reach the tavern' });
    };
  }

  disconnect(): void {
    this.wanted = null;
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close();
    this.socket = null;
    this.snapshot = { ...blank };
    this.emit();
  }

  seek(mode: Mode, control: TimeControlId): void {
    this.wanted = { mode, control };
    this.update({ status: 'seeking', mode, control, error: null });
    this.connect();
    this.send({ t: 'seek', seek: { mode, control } });
  }

  cancelSeek(): void {
    this.wanted = null;
    this.send({ t: 'unseek' });
    this.update({ status: 'idle', waiting: 0 });
  }

  submitLoadout(loadout: Loadout): void {
    this.send({ t: 'loadout', loadout });
    this.update({ youReady: true });
  }

  play(action: Action): void {
    this.send({ t: 'action', action });
  }

  leave(): void {
    this.send({ t: 'leave' });
    this.wanted = null;
    this.update({ ...blank, status: this.socket ? 'idle' : 'offline' });
  }

  /* -- internals --------------------------------------------------------- */

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encode(message));
  }

  private scheduleRetry(): void {
    if (this.retry !== null || !this.wanted) return;
    this.retry = window.setTimeout(() => {
      this.retry = null;
      this.connect();
    }, 2000);
  }

  private receive(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        this.update({ status: this.wanted ? 'seeking' : 'idle', error: null });
        return;
      case 'seeking':
        this.update({ status: this.wanted ? 'seeking' : 'idle', waiting: message.waiting });
        return;
      case 'matched':
        this.wanted = null;
        this.update({
          status: 'loadout',
          gameId: message.gameId,
          you: message.you,
          opponent: message.opponent,
          mode: message.mode,
          control: message.control,
          youReady: false,
          theyReady: false,
          state: null,
          error: null,
        });
        return;
      case 'phase':
        this.update({
          youReady: message.youReady,
          theyReady: message.theyReady,
          status: message.phase === 'over' ? 'over' : this.snapshot.status,
        });
        return;
      case 'reveal':
        this.update({
          back: message.back,
          loadouts: { white: message.white, black: message.black },
        });
        return;
      case 'state':
        this.update({
          state: message.state,
          status: message.state.status.kind === 'ongoing' ? 'playing' : 'over',
        });
        return;
      case 'opponentLeft':
        this.update({ status: 'abandoned' });
        return;
      case 'error':
        this.update({ error: message.message });
        return;
      default:
        return;
    }
  }

  private update(patch: Partial<OnlineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export const online = new OnlineClient();
