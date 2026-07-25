import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import { Matchmaker } from './matchmaking';
import { Room } from './room';
import {
  PROTOCOL_VERSION,
  decode,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '../src/shared/protocol';

/** One process: it serves the built site and runs the games. That keeps deployment to a single
 *  container behind a single domain, which is all this needs for a long while. */

const STATIC_DIR = process.env.STATIC_DIR ?? join(process.cwd(), 'dist');
const SEEK_TIMEOUT_MS = 3 * 60_000;

/** Facing the open internet, so: cap what a message may be, cap how fast they may arrive, and
 *  only accept sockets from origins we actually serve. */
/** The app refuses anything over this politely; the socket layer drops anything over twice
 *  this without ceremony, so a hostile client cannot make us buffer megabytes. */
const MAX_MESSAGE_BYTES = 32 * 1024;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 240; // twenty a second sustained is far more than playing needs
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

interface Client {
  id: string;
  name: string;
  socket: WebSocket;
  roomId: string | null;
  alive: boolean;
  /** Sliding window for the rate limit. */
  window: { since: number; count: number };
}

const clients = new Map<string, Client>();
const rooms = new Map<string, Room>();
const matchmaker = new Matchmaker();

const TAVERN_NAMES = [
  'Traveller',
  'Wanderer',
  'Pilgrim',
  'Stranger',
  'Outrider',
  'Wayfarer',
  'Sellsword',
  'Cartographer',
];

const nameFor = (): string =>
  `${TAVERN_NAMES[Math.floor(Math.random() * TAVERN_NAMES.length)]} ${Math.floor(
    100 + Math.random() * 900,
  )}`;

function send(client: Client | undefined, message: ServerMessage): void {
  if (!client || client.socket.readyState !== client.socket.OPEN) return;
  client.socket.send(encode(message));
}

function fail(client: Client, message: string): void {
  send(client, { t: 'error', message });
}

/** Tells both seats what the board looks like now. */
function broadcastState(room: Room): void {
  if (!room.state) return;
  for (const color of ['w', 'b'] as const) {
    send(clients.get(room.seats[color].id), { t: 'state', gameId: room.id, state: room.state });
  }
}

function broadcastPhase(room: Room): void {
  for (const color of ['w', 'b'] as const) {
    const seat = room.seats[color];
    const other = room.seats[color === 'w' ? 'b' : 'w'];
    send(clients.get(seat.id), {
      t: 'phase',
      gameId: room.id,
      phase: room.phase,
      youReady: seat.loadout != null,
      theyReady: other.loadout != null,
    });
  }
}

function startGame(white: string, black: string, seek: Parameters<Matchmaker['seek']>[1]): void {
  const room = new Room(randomUUID(), white, black, seek);
  rooms.set(room.id, room);

  for (const color of ['w', 'b'] as const) {
    const seat = room.seats[color];
    const client = clients.get(seat.id);
    if (!client) continue;
    client.roomId = room.id;
    const opponent = clients.get(room.seats[color === 'w' ? 'b' : 'w'].id);
    send(client, {
      t: 'matched',
      gameId: room.id,
      you: color,
      opponent: opponent?.name ?? 'a traveller',
      mode: seek.mode,
      control: seek.control,
    });
  }
  broadcastPhase(room);
}

function leaveRoom(client: Client): void {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  client.roomId = null;
  if (!room) return;

  const opponent = room.opponentOf(client.id);
  room.abandon();
  if (opponent) send(clients.get(opponent.id), { t: 'opponentLeft', gameId: room.id });
  rooms.delete(room.id);
}

function handle(client: Client, message: ClientMessage): void {
  switch (message.t) {
    case 'hello': {
      if (message.version !== PROTOCOL_VERSION) {
        fail(client, 'this page is out of date, please reload');
        return;
      }
      if (message.name) client.name = message.name.slice(0, 24);
      send(client, {
        t: 'welcome',
        guestId: client.id,
        name: client.name,
        version: PROTOCOL_VERSION,
      });
      return;
    }

    case 'seek': {
      if (client.roomId) {
        fail(client, 'you are already at a board');
        return;
      }
      const pairing = matchmaker.seek(client.id, message.seek, Date.now());
      if (!pairing) {
        // The count is other people, so it does not include the seeker who just joined.
        send(client, { t: 'seeking', waiting: Math.max(0, matchmaker.waiting(message.seek) - 1) });
        return;
      }
      startGame(pairing.white, pairing.black, pairing.seek);
      return;
    }

    case 'unseek':
      matchmaker.unseek(client.id);
      send(client, { t: 'seeking', waiting: 0 });
      return;

    case 'loadout': {
      const room = client.roomId ? rooms.get(client.roomId) : undefined;
      if (!room) {
        fail(client, 'you are not at a board');
        return;
      }
      const problem = room.submitLoadout(client.id, message.loadout);
      if (problem) {
        fail(client, problem);
        return;
      }
      broadcastPhase(room);
      if (room.phase === 'playing') {
        for (const color of ['w', 'b'] as const) {
          send(clients.get(room.seats[color].id), {
            t: 'reveal',
            gameId: room.id,
            white: room.seats.w.loadout!,
            black: room.seats.b.loadout!,
            back: room.back,
          });
        }
        broadcastState(room);
      }
      return;
    }

    case 'action': {
      const room = client.roomId ? rooms.get(client.roomId) : undefined;
      if (!room) {
        fail(client, 'you are not at a board');
        return;
      }
      const problem = room.play(client.id, message.action);
      if (problem) {
        fail(client, problem);
        // Resend the truth, so a client that got ahead of itself falls back into line.
        if (room.state) send(client, { t: 'state', gameId: room.id, state: room.state });
        return;
      }
      broadcastState(room);
      if (room.phase === 'over') broadcastPhase(room);
      return;
    }

    case 'leave':
      matchmaker.unseek(client.id);
      leaveRoom(client);
      return;

    case 'ping':
      send(client, { t: 'pong' });
      return;

    default:
      fail(client, 'unknown message');
  }
}

/* ---------------------------------------------------------------------------
   Static hosting for the built site, plus a health check for the load balancer.
--------------------------------------------------------------------------- */

/** The page loads nothing from anywhere else, so say so. */
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; '),
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, seeking: matchmaker.size() }));
    return;
  }

  const requested = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
  const inside = requested.startsWith(normalize(STATIC_DIR));
  const file =
    inside && existsSync(requested) && statSync(requested).isFile()
      ? requested
      : join(STATIC_DIR, 'index.html'); // single page app: unknown paths get the app

  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not built yet: run npm run build');
    return;
  }

  // Hashed asset filenames may be cached forever; the entry document may not.
  const immutable = file.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable,
    ...SECURITY_HEADERS,
  });
  createReadStream(file).pipe(res);
}

export function createApp() {
  const http = createServer(serveStatic);
  const wss = new WebSocketServer({
    server: http,
    path: '/ws',
    maxPayload: MAX_MESSAGE_BYTES * 2,
    verifyClient: ({ origin }) => {
      // No allowlist configured means development, where anything local is fine.
      if (!ALLOWED_ORIGINS.length) return true;
      return !origin || ALLOWED_ORIGINS.includes(origin);
    },
  });

  wss.on('connection', (socket) => {
    const client: Client = {
      id: randomUUID(),
      name: nameFor(),
      socket,
      roomId: null,
      alive: true,
      window: { since: Date.now(), count: 0 },
    };
    clients.set(client.id, client);

    socket.on('message', (raw) => {
      const text = String(raw);
      if (text.length > MAX_MESSAGE_BYTES) {
        fail(client, 'that message is too large');
        return;
      }

      const now = Date.now();
      if (now - client.window.since > RATE_WINDOW_MS) client.window = { since: now, count: 0 };
      if (++client.window.count > RATE_LIMIT) {
        fail(client, 'slow down');
        socket.close();
        return;
      }

      const message = decode<ClientMessage>(text);
      if (!message) {
        fail(client, 'unreadable message');
        return;
      }

      try {
        handle(client, message);
      } catch (error) {
        console.error('[room] handler failed', error);
        fail(client, 'something went wrong at this table');
      }
    });

    socket.on('pong', () => {
      client.alive = true;
    });

    socket.on('close', () => {
      matchmaker.unseek(client.id);
      leaveRoom(client);
      clients.delete(client.id);
    });
  });

  // Drop sockets that have stopped answering, and seekers who have waited too long.
  const heartbeat = setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) {
      client.socket.terminate();
      continue;
    }
    client.alive = false;
    client.socket.ping();
  }
    for (const id of matchmaker.sweep(Date.now(), SEEK_TIMEOUT_MS)) {
      send(clients.get(id), { t: 'seeking', waiting: 0 });
    }
  }, 30_000);

  /** One pass over the live rooms, flagging anyone whose clock has run out and telling both
   *  seats. Exported through the app handle so a test can drive it with a `now` of its own —
   *  the alternative is a test that genuinely waits three minutes for a real clock to expire,
   *  which nobody will run. */
  const sweepClocks = (now: number = Date.now()): number => {
    let flagged = 0;
    for (const room of rooms.values()) {
      if (room.checkFlag(now)) {
        broadcastState(room);
        broadcastPhase(room);
        flagged++;
      }
    }
    return flagged;
  };

  // Clocks are swept far more often than the heartbeat, because a flag that lands thirty
  // seconds late is a flag that decided the wrong game. One pass over the live rooms is
  // trivial work; it only touches rooms that are actually playing on a clock.
  const clockSweep = setInterval(() => sweepClocks(), 1_000);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(clockSweep);
  });

  /** Closes everything, for tests and for a clean shutdown. */
  const stop = async (): Promise<void> => {
    clearInterval(heartbeat);
    clearInterval(clockSweep);
    for (const client of clients.values()) client.socket.terminate();
    clients.clear();
    rooms.clear();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return { http, wss, stop, sweepClocks };
}

export function start(port = Number(process.env.PORT ?? 8080)) {
  const app = createApp();
  app.http.listen(port, () => {
    console.log(`[enchanted-chess] serving ${STATIC_DIR} and /ws on :${port}`);
  });

  // Containers get a SIGTERM and a short grace period; finish politely inside it.
  const bye = (signal: string) => () => {
    console.log(`[enchanted-chess] ${signal}, closing`);
    void app.stop().then(() => process.exit(0));
  };
  process.on('SIGTERM', bye('SIGTERM'));
  process.on('SIGINT', bye('SIGINT'));
  return app;
}
