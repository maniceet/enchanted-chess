/* Does the board move when nothing moved?
 *
 * The piece-slide shipped as a classic FLIP: measure every slot after every render, snap the
 * ones that changed position back, release. It measured with getBoundingClientRect, which is
 * viewport-relative and includes transforms, and it ran on every render because it had no
 * dependency array. So scrolling the page changed every rect and the next render slid all
 * thirty-two pieces to chase a scroll; a render landing inside a slide measured a piece
 * mid-flight and animated from there; and a drag re-rendered the board into thirty-two forced
 * reflows. It was reported as "jitter, almost unplayable", and every unit test passed
 * throughout — nothing about it is visible to a test that does not run a browser.
 *
 *   npm run check:motion
 *
 * So this drives the built bundle and records, through a MutationObserver, every transform the
 * board ever writes. Three facts, each of which the broken version failed:
 *
 *   A. scrolling and selecting write no transforms at all — nothing moved, so nothing moves
 *   B. one move writes exactly one slide, and its distance is a whole number of squares
 *   C. a drag writes none: a piece carried by hand is already where the player put it
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8600 + (process.pid % 200);
const CDP = 9700 + (process.pid % 200);
const DIST = 'dist';
const PROFILE = `/tmp/enchanted-chess-motion-${process.pid}`;

const WATCHDOG = setTimeout(() => {
  console.error('board-motion watchdog: no verdict after 4 minutes.');
  process.exit(2);
}, 240_000);
WATCHDOG.unref?.();

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
const chrome: ChildProcess = execFile(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=${PROFILE}`,
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
if (!socket) {
  console.error('Chrome never opened its debugging port.');
  process.exit(2);
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
const evalJs = async <T>(expression: string): Promise<T> =>
  (await send<{ result: { value: T } }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
    .result?.value;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const click = (text: string) =>
  evalJs<boolean>(
    `(()=>{const w=${JSON.stringify(text)}.toLowerCase();const b=[...document.querySelectorAll('button')].find(e=>(e.textContent||'').toLowerCase().includes(w)&&!e.disabled);if(!b)return false;b.click();return true})()`,
  );
const clickSquare = (name: string) =>
  evalJs<boolean>(
    `(()=>{const b=[...document.querySelectorAll('button')].find(e=>{const l=e.getAttribute('aria-label')||'';return l===${JSON.stringify(name)}||l.endsWith(' ${name}')});if(!b)return false;b.click();return true})()`,
  );

const problems: string[] = [];
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 820, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await pause(900);
  await evalJs('localStorage.clear()');
  await send('Page.reload', {});
  await pause(900);

  // A hotseat duel: both sides are ours, so every step is deterministic.
  for (const step of [
    'Duel another captain',
    'At this table',
    'No clock',
    'Classic start',
    'turn to build',
    'Reveal both',
    'Begin the game',
  ]) {
    await click(step);
    await pause(420);
  }

  await evalJs(
    `window.__tx=[];new MutationObserver(ms=>{for(const m of ms){const t=m.target.style&&m.target.style.transform;if(t)window.__tx.push(t)}}).observe(document.querySelector('.board'),{subtree:true,attributes:true,attributeFilter:['style']});true`,
  );
  const written = () => evalJs<string[]>('window.__tx');
  const reset = () => evalJs('window.__tx=[];true');

  // A. Scroll, then force renders by selecting pieces. The board did not change.
  await evalJs('window.scrollTo(0, 260)');
  await pause(250);
  await clickSquare('e2');
  await pause(250);
  await evalJs('window.scrollTo(0, 0)');
  await pause(250);
  await clickSquare('d2');
  await pause(250);
  const idle = await written();
  if (idle.length > 0) {
    problems.push(`A. scrolling and selecting moved the pieces (${idle.length} transforms: ${idle.slice(0, 3).join(', ')})`);
  }

  // B. One move, one slide, a whole number of squares.
  await reset();
  await clickSquare('e2');
  await pause(150);
  await clickSquare('e4');
  await pause(450);
  const moved = await written();
  const cell = await evalJs<number>('document.querySelector(".board").clientWidth / 8');
  if (moved.length === 0) {
    problems.push('B. a move produced no slide at all');
  } else {
    const offsets = moved[0].match(/-?[\d.]+/g)?.map(Number) ?? [];
    const squares = offsets.map((n) => n / cell);
    const whole = squares.every((n) => Math.abs(n - Math.round(n)) < 0.02);
    if (!whole) problems.push(`B. slide is not a whole number of squares: ${moved[0]} (cell ${cell.toFixed(2)}px)`);
    if (Math.round(Math.abs(squares[1] ?? 0)) !== 2) {
      problems.push(`B. e2-e4 should slide two ranks, slid ${squares[1]?.toFixed(2)}`);
    }
  }

  // C. A dragged piece is already where the player put it.
  await reset();
  const box = await evalJs<{ x1: number; y1: number; x2: number; y2: number }>(
    `(()=>{const b=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'').startsWith('Black Pawn on e7'));const r=b.getBoundingClientRect();const t=[...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'')==='e5');const r2=t.getBoundingClientRect();return {x1:r.x+r.width/2,y1:r.y+r.height/2,x2:r2.x+r2.width/2,y2:r2.y+r2.height/2}})()`,
  );
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x1, y: box.y1, button: 'left', clickCount: 1, pointerType: 'mouse' });
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.x1 + ((box.x2 - box.x1) * i) / 6,
      y: box.y1 + ((box.y2 - box.y1) * i) / 6,
      button: 'left',
      pointerType: 'mouse',
    });
    await pause(25);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x2, y: box.y2, button: 'left', clickCount: 1, pointerType: 'mouse' });
  await pause(500);
  const dragged = await written();
  if (dragged.length > 0) problems.push(`C. a drag re-played itself (${dragged.length} transforms)`);
  const landed = await evalJs<boolean>(
    `!![...document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||'').startsWith('Black Pawn on e5'))`,
  );
  if (!landed) problems.push('C. the dragged pawn never landed on e5');
} finally {
  clearTimeout(WATCHDOG);
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', PROFILE]);
  server.close();
}

if (problems.length > 0) {
  console.error('The board moves when it should not:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('Board motion: still when idle, one slide per move, silent on drag.');
