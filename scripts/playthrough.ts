/* Plays a duel that actually triggers the magic, and photographs every beat of it.
 *
 *   npm run build && npx tsx scripts/playthrough.ts
 *
 * The screenshot script photographs the opening position, which is the one position where none
 * of this game's rules are visible. This one seeds a duel whose loadouts guarantee the dramatic
 * moments — a Martyr freezing its killer, a shielded knight refusing a bishop, a Poison pawn
 * taking its captor with it — and captures a frame after every half-move, so the states can be
 * looked at rather than reasoned about.
 *
 * Frames land in play/beats/. They are a diagnostic, not an asset: nothing here is committed.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const PORT = 8600 + (process.pid % 120);
const CDP = 9600 + (process.pid % 120);
const DIST = 'dist';
const OUT = 'play/beats';
/** A real mid-range phone, which is what most of this will be played on. */
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
  `--user-data-dir=/tmp/enchanted-chess-beats-${process.pid}`,
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
  const file = `${OUT}/${String(++frame).padStart(2, '0')}-${label}.png`;
  writeFileSync(file, Buffer.from(png.data, 'base64'));
  console.log(`  ${file}`);
};

/* A duel built so the rules have to show themselves.
 *
 * White carries a Martyr on d2 and a Taunt on the queen's knight; Black carries Poison on d7.
 * Every enchantment in that list changes what a capture means, which is the whole game. */
const SAVED = JSON.stringify({
  back: null,
  white: { enchantments: { d2: 'martyr', b1: 'taunt' }, power: 'teleport', powers: ['teleport', 'relocate', 'decree'] },
  black: { enchantments: { d7: 'poison' }, power: 'teleport', powers: ['teleport', 'decree', 'revive'] },
  control: 'untimed',
  opponent: 'table',
  actions: [],
});

/** from, to, and what the frame should be called. */
const MOVES: Array<[string, string, string]> = [
  ['d2', 'd4', 'martyr-pawn-advances'],
  ['c7', 'c5', 'black-answers'],
  ['b1', 'c3', 'taunt-knight-out'],
  ['c5', 'd4', 'martyr-takes-its-killer'],
  ['g1', 'f3', 'white-develops'],
  ['e7', 'e6', 'black-frees'],
  ['e2', 'e4', 'centre'],
  ['f8', 'b4', 'bishop-eyes-the-shield'],
  ['a2', 'a3', 'white-asks'],
];

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: VIEW.scale,
    mobile: true,
  });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await pause(900);
  await evalJs(`localStorage.clear(); localStorage.setItem('enchanted-chess:v2', ${JSON.stringify(SAVED)})`);
  await send('Page.reload', {});
  await pause(1000);

  if (!(await click('Resume duel'))) {
    console.error('No "Resume duel" on the home screen — the seed did not take.');
    process.exit(3);
  }
  await pause(900);
  await shoot('board-as-dealt');

  for (const [from, to, label] of MOVES) {
    await square(from);
    await pause(260);
    await shoot(`${label}-picked`);
    await square(to);
    // Long enough for a slide and any capture effect to have played out.
    await pause(1400);
    await shoot(label);
  }

  /* The shield. Black's bishop can reach c3 but may not capture what stands there, so the
   * board must offer the break instead — a different mark, a different verb. */
  await square('b4');
  await pause(400);
  await shoot('bishop-selected-shield-break-offered');
  await square('c3');
  await pause(1500);
  await shoot('shield-broken');
  await square('b4');
  await pause(400);
  await shoot('bishop-again-shield-now-gone');

  console.log(`\n${frame} frames in ${OUT}/`);
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-beats-${process.pid}`]);
  server.close();
}
