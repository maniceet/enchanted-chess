import { afterAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createApp } from './index';
import { parseSquare } from '../src/engine/board';
import { encode, PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '../src/shared/protocol';

/** End to end over real sockets: two travellers queue up, get paired, build their armies and
 *  play. The server is the only board, so anything it refuses never happened. */

const app = createApp();
const port = 8123 + Math.floor(Math.random() * 400);
await new Promise<void>((resolve) => app.http.listen(port, resolve));
afterAll(async () => app.stop());

/** A tiny client that remembers everything the server said. */
class Traveller {
  socket: WebSocket;
  inbox: ServerMessage[] = [];

  constructor() {
    this.socket = new WebSocket(`ws://localhost:${port}/ws`);
    this.socket.on('message', (raw) => this.inbox.push(JSON.parse(String(raw))));
  }

  async ready(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve) => this.socket.once('open', () => resolve()));
  }

  send(message: ClientMessage): void {
    this.socket.send(encode(message));
  }

  /** Waits for the next message of a kind, so tests never race the network. */
  // Generous on purpose: these are real sockets, and a three second deadline is the kind of
  // thing that turns a busy machine into a red suite for no reason. Nothing here is testing
  // latency, only that the message eventually arrives.
  async waitFor<T extends ServerMessage['t']>(kind: T, ms = 15_000): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + ms;
    for (;;) {
      const found = this.inbox.find((m) => m.t === kind);
      if (found) return found as Extract<ServerMessage, { t: T }>;
      if (Date.now() > deadline) throw new Error(`no ${kind} arrived; saw ${this.inbox.map((m) => m.t).join(', ')}`);
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  close(): void {
    this.socket.close();
  }
}

describe('Online play', () => {
  it('pairs two seekers, takes both loadouts, and plays a real game', async () => {
    const ann = new Traveller();
    const bo = new Traveller();
    await Promise.all([ann.ready(), bo.ready()]);

    ann.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Ann' });
    bo.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Bo' });
    await ann.waitFor('welcome');
    await bo.waitFor('welcome');

    ann.send({ t: 'seek', seek: { mode: 'classic', control: '3+2' } });
    await ann.waitFor('seeking');
    bo.send({ t: 'seek', seek: { mode: 'classic', control: '3+2' } });

    const annMatch = await ann.waitFor('matched');
    const boMatch = await bo.waitFor('matched');
    expect(annMatch.gameId).toBe(boMatch.gameId);
    expect(annMatch.you).not.toBe(boMatch.you);
    expect(annMatch.opponent).toBe('Bo');

    const white = annMatch.you === 'w' ? ann : bo;
    const black = annMatch.you === 'w' ? bo : ann;

    white.send({ t: 'loadout', loadout: { enchantments: { a2: 'poison' }, power: 'teleport' } });
    black.send({ t: 'loadout', loadout: { enchantments: { d7: 'taunt' }, power: 'revive' } });

    const reveal = await white.waitFor('reveal');
    expect(reveal.white.enchantments).toEqual({ a2: 'poison' });
    expect(reveal.black.enchantments).toEqual({ d7: 'taunt' });

    const opening = await black.waitFor('state');
    expect(opening.state.turn).toBe('w');
    expect(opening.state.board[parseSquare('a2')]!.ench).toBe('poison');

    // Black may not move first, and the server says so.
    black.send({ t: 'action', action: { type: 'move', from: parseSquare('e7'), to: parseSquare('e5') } });
    expect((await black.waitFor('error')).message).toMatch(/not your turn/);

    white.inbox.length = 0;
    black.inbox.length = 0;
    white.send({ t: 'action', action: { type: 'move', from: parseSquare('e2'), to: parseSquare('e4') } });

    const afterWhite = await black.waitFor('state');
    expect(afterWhite.state.turn).toBe('b');
    expect(afterWhite.state.board[parseSquare('e4')]!.type).toBe('p');

    ann.close();
    bo.close();
  }, 20_000);

  it('flags a player who simply stops moving, and tells them both', async () => {
    // The scenario the server has to own: a client that is *connected* but silent. A
    // backgrounded tab has its timers throttled, so the browser that is supposed to volunteer
    // its own loss may never notice, and the opponent would otherwise wait forever. The sweep
    // is driven here with a `now` far in the future rather than by waiting three real minutes,
    // which is the only way a test like this ever gets run.
    const ann = new Traveller();
    const bo = new Traveller();
    await Promise.all([ann.ready(), bo.ready()]);
    ann.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Ann' });
    bo.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Bo' });
    await ann.waitFor('welcome');
    await bo.waitFor('welcome');

    ann.send({ t: 'seek', seek: { mode: 'classic', control: '3+2' } });
    await ann.waitFor('seeking');
    bo.send({ t: 'seek', seek: { mode: 'classic', control: '3+2' } });
    const annMatch = await ann.waitFor('matched');
    await bo.waitFor('matched');

    const white = annMatch.you === 'w' ? ann : bo;
    const black = annMatch.you === 'w' ? bo : ann;
    white.send({ t: 'loadout', loadout: { enchantments: {}, power: 'teleport' } });
    black.send({ t: 'loadout', loadout: { enchantments: {}, power: 'teleport' } });
    await white.waitFor('state');
    await black.waitFor('state');

    // Nobody moves. Ten minutes later, on a three minute clock, White is out of time.
    white.inbox.length = 0;
    black.inbox.length = 0;
    expect(app.sweepClocks(Date.now() + 10 * 60_000)).toBe(1);

    // Both seats hear about it, not just the one that ran out.
    const forWhite = await white.waitFor('state');
    const forBlack = await black.waitFor('state');
    expect(forWhite.state.status).toEqual({ kind: 'flagged', winner: 'b' });
    expect(forBlack.state.status).toEqual({ kind: 'flagged', winner: 'b' });

    // And the room is closed, so a second sweep finds nothing left to flag.
    expect(app.sweepClocks(Date.now() + 20 * 60_000)).toBe(0);

    ann.close();
    bo.close();
  });

  it('leaves an untimed game alone however long nobody moves', async () => {
    const ann = new Traveller();
    const bo = new Traveller();
    await Promise.all([ann.ready(), bo.ready()]);
    ann.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Ann' });
    bo.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Bo' });
    await ann.waitFor('welcome');
    await bo.waitFor('welcome');

    ann.send({ t: 'seek', seek: { mode: 'classic', control: 'untimed' } });
    await ann.waitFor('seeking');
    bo.send({ t: 'seek', seek: { mode: 'classic', control: 'untimed' } });
    const annMatch = await ann.waitFor('matched');
    await bo.waitFor('matched');

    const white = annMatch.you === 'w' ? ann : bo;
    const black = annMatch.you === 'w' ? bo : ann;
    white.send({ t: 'loadout', loadout: { enchantments: {}, power: 'teleport' } });
    black.send({ t: 'loadout', loadout: { enchantments: {}, power: 'teleport' } });
    await white.waitFor('state');

    expect(app.sweepClocks(Date.now() + 24 * 60 * 60_000)).toBe(0);

    ann.close();
    bo.close();
  });

  it('refuses an illegal move and resends the true position', async () => {
    const ann = new Traveller();
    const bo = new Traveller();
    await Promise.all([ann.ready(), bo.ready()]);
    ann.send({ t: 'hello', version: PROTOCOL_VERSION });
    bo.send({ t: 'hello', version: PROTOCOL_VERSION });
    ann.send({ t: 'seek', seek: { mode: 'classic', control: 'untimed' } });
    await ann.waitFor('seeking');
    bo.send({ t: 'seek', seek: { mode: 'classic', control: 'untimed' } });

    const match = await ann.waitFor('matched');
    const white = match.you === 'w' ? ann : bo;
    white.send({ t: 'loadout', loadout: { enchantments: {}, power: 'teleport' } });
    (match.you === 'w' ? bo : ann).send({ t: 'loadout', loadout: { enchantments: {}, power: 'teleport' } });
    await white.waitFor('state');

    white.inbox.length = 0;
    white.send({ t: 'action', action: { type: 'move', from: parseSquare('e2'), to: parseSquare('e5') } });
    expect((await white.waitFor('error')).message).toMatch(/illegal move/);
    // The server hands back the position, so a confused client cannot stay confused.
    expect((await white.waitFor('state')).state.turn).toBe('w');

    ann.close();
    bo.close();
  }, 20_000);

  it('tells the other seat when someone walks out', async () => {
    const ann = new Traveller();
    const bo = new Traveller();
    await Promise.all([ann.ready(), bo.ready()]);
    ann.send({ t: 'hello', version: PROTOCOL_VERSION });
    bo.send({ t: 'hello', version: PROTOCOL_VERSION });
    ann.send({ t: 'seek', seek: { mode: '960', control: 'untimed' } });
    await ann.waitFor('seeking');
    bo.send({ t: 'seek', seek: { mode: '960', control: 'untimed' } });
    await bo.waitFor('matched');

    ann.close();
    expect((await bo.waitFor('opponentLeft')).gameId).toBeTruthy();
    bo.close();
  }, 20_000);

  it('turns away a client speaking the wrong protocol', async () => {
    const old = new Traveller();
    await old.ready();
    old.send({ t: 'hello', version: PROTOCOL_VERSION + 99 });
    expect((await old.waitFor('error')).message).toMatch(/out of date/);
    old.close();
  }, 20_000);
});

describe('Standing up to the open internet', () => {
  it('refuses a message that is absurdly large', async () => {
    const noisy = new Traveller();
    await noisy.ready();
    noisy.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'x'.repeat(40_000) });
    expect((await noisy.waitFor('error')).message).toMatch(/too large/);
    noisy.close();
  }, 20_000);

  it('cuts off a client that floods the socket', async () => {
    const flood = new Traveller();
    await flood.ready();
    for (let i = 0; i < 400; i++) flood.send({ t: 'ping' });
    expect((await flood.waitFor('error')).message).toMatch(/slow down/);
    flood.close();
  }, 20_000);

  it('keeps names to a sane length', async () => {
    const long = new Traveller();
    await long.ready();
    long.send({ t: 'hello', version: PROTOCOL_VERSION, name: 'Bartholomew the Extremely Verbose' });
    expect((await long.waitFor('welcome')).name.length).toBeLessThanOrEqual(24);
    long.close();
  }, 20_000);
});
