/* Play Console screenshots, at the sizes the Console actually asks for.
 *
 *   npm run build && npx tsx scripts/screenshots.ts
 *
 * Phone shots are mandatory (two minimum). Tablet shots are what decides whether the listing
 * says "Designed for phone" or offers the game to tablet owners at all, and Google will quietly
 * mark an app as phone-only if they are missing — so they are captured here rather than left as
 * a task for the day of submission.
 *
 * These are photographs of the real build. The run is seeded so the board is worth looking at:
 * a campaign several attempts deep, an army with enchantments on it, and a position with a
 * shield up. A screenshot of the opening position with nothing enchanted sells nothing.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const PORT = 8760 + (process.pid % 120);
const CDP = 9880 + (process.pid % 120);
const DIST = 'dist';
const OUT = 'play/screenshots';

/* The three form factors the Console lists separately — described the way a browser needs to
 * hear it, which is not the way the Console states it.
 *
 * The Console asks for a 1080x1920 phone screenshot, and the obvious reading of that is to set
 * the viewport to 1080x1920. That reading is wrong, and it produced six unusable phone shots:
 * 1080 is a count of *device* pixels, and a phone with a 1080px screen is about three times as
 * dense as a desktop monitor, so its CSS viewport — the width the stylesheet is answering — is
 * nearer 360. Emulated at 1080 CSS px the game laid itself out for a screen no phone has: the
 * board took a tablet's share of the width, the panels were squeezed into a 90px gutter beside
 * it, and CHRONICLE was clipped to CHRO. Nothing was broken in the app; the camera was pointed
 * at a device that does not exist.
 *
 * So each entry carries the CSS viewport a real device of that class reports, plus its pixel
 * density. Chrome then renders the true layout and captures it at density, which lands on the
 * exact pixel size the Console wants and is sharper besides. */
const DEVICES: Array<{ name: string; width: number; height: number; scale: number }> = [
  // 360x640 dp at 3x — a mainstream Android phone, and exactly 1080x1920.
  { name: 'phone', width: 360, height: 640, scale: 3 },
  // 600x960 dp at 2x — the small-tablet breakpoint Android itself uses, exactly 1200x1920.
  { name: 'tablet7', width: 600, height: 960, scale: 2 },
  // 800x1280 dp at 2x — a 10-inch tablet held upright, exactly 1600x2560.
  { name: 'tablet10', width: 800, height: 1280, scale: 2 },
];

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
  `--user-data-dir=/tmp/enchanted-chess-shots-${process.pid}`,
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

/** A traveller mid-campaign: spells learned, mana to spend, a road already walked. */
const RUN = JSON.stringify({
  version: 1,
  progress: ['drunkard', 'innkeeper'],
  mode: 'classic',
  active: true,
  gold: 46,
  taught: ['taunt', 'martyr', 'poison', 'outpost'],
  keeper: true,
  sorcerer: true,
  divineCall: true,
  dragon: false,
  dragonUsedThisRun: false,
  attempts: 5,
  best: 4,
  clears: 0,
  beaten: { drunkard: 5, innkeeper: 3, rolain: 2 },
  walkPurse: 18,
  mana: 7,
  manaFloor: 2,
  venom: [],
  fortifiedRooks: 0,
  doomCall: false,
  dragons: 0,
  archbishops: 0,
  relics: [],
  sorcererSeen: true,
  freed: false,
  trials: [],
});

async function shoot(device: (typeof DEVICES)[number], label: string): Promise<void> {
  const png = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
  const file = `${OUT}/${device.name}-${label}.png`;
  writeFileSync(file, Buffer.from(png.data, 'base64'));
  console.log(`  ${file}`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');

  for (const device of DEVICES) {
    const px = `${device.width * device.scale}x${device.height * device.scale}`;
    console.log(`\n${device.name}  ${device.width}x${device.height} dp @${device.scale}x  ->  ${px}`);
    await send('Emulation.setDeviceMetricsOverride', {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.scale,
      mobile: device.name === 'phone',
    });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await pause(900);
    await evalJs(`localStorage.clear(); localStorage.setItem('enchanted-chess:run', ${JSON.stringify(RUN)})`);
    await send('Page.reload', {});
    await pause(1000);
    await shoot(device, '1-home');

    // Into the run: the road, the seat, the builder.
    for (const step of ['Continue the attempt', 'Onward', 'Princess Rolain', 'The Wit', 'Onward']) {
      if (await click(step)) await pause(600);
    }
    if (await evalJs<boolean>(`!!document.querySelector('.loadout-cell')`)) {
      // Put something on the board worth photographing.
      for (const [cell, ench] of [
        ['e2', 'Taunt'],
        ['d2', 'Poison'],
        ['b1', 'Outpost'],
      ] as const) {
        await evalJs(
          `(()=>{const c=[...document.querySelectorAll('.loadout-cell')].find(e=>{const s=e.querySelector('.cell-square');return s&&s.textContent===${JSON.stringify(cell)}});c&&c.click()})()`,
        );
        await pause(220);
        await evalJs(
          `(()=>{const r=[...document.querySelectorAll('.ench-row')].find(e=>new RegExp(${JSON.stringify(ench)}).test(e.textContent||'')&&!e.disabled);r&&r.click()})()`,
        );
        await pause(220);
      }
      await shoot(device, '2-loadout');
      for (const step of ['See what', 'Reveal both']) if (await click(step)) await pause(700);
      await shoot(device, '3-reveal');
      await click('Begin the game');
      await pause(1000);
      // A few moves, so the board is a game rather than a setup.
      for (const [from, to] of [
        ['e2', 'e4'],
        ['d2', 'd4'],
        ['g1', 'f3'],
      ] as const) {
        await square(from);
        await pause(200);
        await square(to);
        await pause(1600);
      }
      await shoot(device, '4-board');
    }

    // The tutorial table, which is the clearest single picture of what the game is.
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await pause(900);
    if (await click('Innkeeper')) {
      await pause(600);
      await shoot(device, '5-drills');
      if (await click('The shield')) {
        await pause(700);
        await shoot(device, '6-drill-board');
      }
    }
  }
  console.log(`\nWritten to ${OUT}/ — phone shots are required, tablet shots decide whether the`);
  console.log('listing is offered to tablet owners at all.');
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-shots-${process.pid}`]);
  server.close();
}
