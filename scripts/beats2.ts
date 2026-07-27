/* The parts of a game the first harness never reaches.
 *
 *   npm run build && npx tsx scripts/beats2.ts
 *
 * `playthrough.ts` walks the middle of a duel. This one photographs the screens either side of
 * it and the states a player only meets once or twice a game: a King's word being aimed at the
 * board, a pawn crowning, and the moment the game ends. Those are the frames nobody looks at,
 * because reaching them by hand takes a whole game each time.
 *
 * Frames land in play/beats2/. Diagnostic, not asset.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const PORT = 8630 + (process.pid % 100);
const CDP = 9630 + (process.pid % 100);
const DIST = 'dist';
const OUT = 'play/beats2';
const VIEW = { width: 393, height: 852, scale: 2 };

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No dist/ — run `npm run build` first.');
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let file = join(DIST, normalize(url === '/' ? '/index.html' : url));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
server.listen(PORT);

let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
const chrome: ChildProcess = execFile('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=/tmp/enchanted-chess-beats2-${process.pid}`,
  'about:blank',
]);
let socket!: WebSocket;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP}/json/list`, { signal: AbortSignal.timeout(1000) });
    const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page?.webSocketDebuggerUrl) {
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((ok, no) => {
        socket.once('open', ok);
        socket.once('error', no);
      });
      break;
    }
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 200));
}
socket.on('message', (raw) => {
  const msg = JSON.parse(String(raw)) as { id?: number; result?: unknown };
  if (msg.id === undefined) return;
  pending.get(msg.id)?.(msg.result);
  pending.delete(msg.id);
});
const send = <T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise<T>((ok) => pending.set(id, ok as (v: unknown) => void));
};
const evalJs = async <T>(expr: string): Promise<T> =>
  (await send<{ result: { value: T } }>('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))
    .result?.value;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const click = (text: string) =>
  evalJs<boolean>(
    `(()=>{const w=${JSON.stringify(text)}.toLowerCase();const b=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').toLowerCase().includes(w)&&!e.disabled);if(!b)return false;b.click();return true})()`,
  );
const square = (name: string) =>
  evalJs<boolean>(
    `(()=>{const b=[...document.querySelectorAll('button')].find(e=>{const l=e.getAttribute('aria-label')||'';return l===${JSON.stringify(name)}||l.endsWith(' ${name}')});if(!b)return false;b.click();return true})()`,
  );

let frame = 0;
const shoot = async (label: string): Promise<void> => {
  const png = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${String(++frame).padStart(2, '0')}-${label}.png`, Buffer.from(png.data, 'base64'));
  console.log(`  ${OUT}/${String(frame).padStart(2, '0')}-${label}.png`);
};

const seed = async (saved: unknown): Promise<void> => {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await pause(800);
  await evalJs(`localStorage.clear(); localStorage.setItem('enchanted-chess:v2', ${JSON.stringify(JSON.stringify(saved))})`);
  await send('Page.reload', {});
  await pause(900);
  await click('Resume duel');
  await pause(900);
};

const DUEL = {
  back: null,
  budget: 8,
  white: { enchantments: { a2: 'squire', b2: 'herald' }, power: 'teleport', powers: ['teleport', 'relocate', 'revive'] },
  black: { enchantments: { d7: 'poison' }, power: 'teleport', powers: ['teleport', 'decree', 'revive'] },
  control: 'untimed',
  opponent: 'table',
  actions: [] as unknown[],
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: VIEW.scale,
    mobile: true,
  });

  /* A word being aimed. The player has pressed Teleport and the board is now a list of places
   * the piece may be set down — a mode with no equivalent in ordinary chess. */
  await seed(DUEL);
  await click('Teleport');
  await pause(700);
  await shoot('teleport-armed');
  await square('g1');
  await pause(500);
  await shoot('teleport-piece-chosen');

  /* Crowning. Seeded a move away from the eighth rank so the picker opens. */
  await seed({
    ...DUEL,
    white: { enchantments: {}, power: 'teleport', powers: ['teleport'] },
    black: { enchantments: {}, power: 'teleport', powers: ['teleport'] },
    actions: [
      { type: 'move', from: 12, to: 28 },
      { type: 'move', from: 51, to: 35 },
      { type: 'move', from: 28, to: 35 },
      { type: 'move', from: 57, to: 42 },
      { type: 'move', from: 35, to: 43 },
      { type: 'move', from: 42, to: 57 },
      { type: 'move', from: 43, to: 50 },
      { type: 'move', from: 57, to: 42 },
    ],
  });
  await shoot('pawn-one-step-from-crowning');
  await square('b7');
  await pause(300);
  await square('b8');
  await pause(800);
  await shoot('promotion-picker');
  await click('Queen');
  await pause(1400);
  await shoot('crowned');

  /* The end of a game: mate, and the screen that follows it. */
  await seed({
    ...DUEL,
    white: { enchantments: {}, power: 'teleport', powers: ['teleport'] },
    black: { enchantments: {}, power: 'teleport', powers: ['teleport'] },
    actions: [
      { type: 'move', from: 12, to: 28 },
      { type: 'move', from: 52, to: 36 },
      { type: 'move', from: 5, to: 26 },
      { type: 'move', from: 57, to: 42 },
      { type: 'move', from: 3, to: 39 },
      { type: 'move', from: 62, to: 45 },
    ],
  });
  await shoot('one-move-from-mate');
  await square('h5');
  await pause(300);
  await square('f7');
  await pause(1800);
  await shoot('checkmate');
  await pause(1200);
  await shoot('after-mate');

  console.log(`\n${frame} frames in ${OUT}/`);
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-beats2-${process.pid}`]);
  server.close();
}
