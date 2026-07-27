/* The road, not the board.
 *
 *   npm run build && npx tsx scripts/beats3.ts
 *
 * Two harnesses already photograph duels. Everything around them — the inn, the seats, a story
 * card, the builder where an army is assembled, the three spoils after a seat falls — is where
 * a player actually spends the first ten minutes, and none of it had ever been looked at at
 * phone size in one pass.
 *
 * Frames land in play/beats3/. Diagnostic, not asset.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const PORT = 8650 + (process.pid % 90);
const CDP = 9650 + (process.pid % 90);
const DIST = 'dist';
const OUT = 'play/beats3';
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
  `--user-data-dir=/tmp/enchanted-chess-beats3-${process.pid}`,
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

let frame = 0;
const shoot = async (label: string): Promise<void> => {
  const png = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${String(++frame).padStart(2, '0')}-${label}.png`, Buffer.from(png.data, 'base64'));
  console.log(`  ${OUT}/${String(frame).padStart(2, '0')}-${label}.png`);
};

/** Whether anything on the page runs off the bottom without a way to know it is there. */
const belowFold = () =>
  evalJs<{ page: number; view: number; hidden: string[] }>(`
    (() => {
      const d = document.documentElement;
      const hidden = [...document.querySelectorAll('button')]
        .filter(b => b.getBoundingClientRect().top > d.clientHeight)
        .map(b => (b.textContent||'').trim().slice(0, 24));
      return { page: d.scrollHeight, view: d.clientHeight, hidden };
    })()
  `);

/** A traveller three seats in, with gold to spend and spells learned. */
const RUN = {
  version: 1,
  progress: ['drunkard', 'innkeeper'],
  mode: 'classic',
  active: true,
  gold: 62,
  taught: ['taunt', 'martyr', 'poison', 'outpost', 'swift'],
  keeper: true,
  sorcerer: true,
  divineCall: true,
  dragon: false,
  dragonUsedThisRun: false,
  attempts: 4,
  best: 3,
  clears: 0,
  beaten: { drunkard: 4, innkeeper: 2 },
  walkPurse: 20,
  mana: 6,
  manaFloor: 3,
  venom: [],
  fortifiedRooks: 0,
  doomCall: false,
  dragons: 0,
  archbishops: 0,
  relics: [],
  sorcererSeen: true,
  freed: false,
  trials: [],
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
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await pause(900);
  await evalJs(`localStorage.clear(); localStorage.setItem('enchanted-chess:run', ${JSON.stringify(JSON.stringify(RUN))})`);
  await send('Page.reload', {});
  await pause(1000);
  await shoot('inn');
  console.log('   inn:', JSON.stringify(await belowFold()));

  await click('Continue the attempt');
  await pause(800);
  await shoot('the-road');
  console.log('   road:', JSON.stringify(await belowFold()));

  // Into the next seat: story card, then the builder.
  await click('Princess Rolain');
  await pause(800);
  await shoot('seat-card');
  console.log('   card:', JSON.stringify(await belowFold()));

  await click('Onward');
  await pause(900);
  await shoot('builder-empty');
  console.log('   builder:', JSON.stringify(await belowFold()));

  // Put something on a pawn, so the cost list and the budget meter are doing work.
  await evalJs(
    `(()=>{const c=[...document.querySelectorAll('.loadout-cell')].find(e=>{const s=e.querySelector('.cell-square');return s&&s.textContent==='e2'});c&&c.click()})()`,
  );
  await pause(500);
  await shoot('builder-piece-picked');
  console.log('   ench list:', JSON.stringify(await belowFold()));

  await evalJs(
    `(()=>{const r=[...document.querySelectorAll('.ench-row')].find(e=>/Poison/.test(e.textContent||'')&&!e.disabled);r&&r.click()})()`,
  );
  await pause(500);
  await shoot('builder-poison-bought');

  // The King, and the three words.
  await evalJs(
    `(()=>{const c=[...document.querySelectorAll('.loadout-cell')].find(e=>{const s=e.querySelector('.cell-square');return s&&s.textContent==='e1'});c&&c.click()})()`,
  );
  await pause(600);
  await shoot('builder-king-words');
  console.log('   words:', JSON.stringify(await belowFold()));

  console.log(`\n${frame} frames in ${OUT}/`);
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-beats3-${process.pid}`]);
  server.close();
}
