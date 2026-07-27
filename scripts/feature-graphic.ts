/* Sizes the painted banner to the one shape the Play Console accepts.
 *
 *   npx tsx scripts/feature-graphic.ts
 *
 * The feature graphic must be exactly 1024x500 — 2.048:1 — and the painting is 1794x877, which
 * is 2.046:1. That is the same shape to within a fifth of a percent, so nothing is cropped: the
 * whole painting is drawn into the frame and the half-pixel of stretch is invisible.
 *
 * It is worth saying why there is a script here at all rather than a one-line resize. An earlier
 * pass misread the source as 1983x793 — the file was still being written when it was measured —
 * and concluded a quarter of the picture had to be cut to fit. A crop was designed around that
 * phantom, and it would have severed the third feature bullet and the base of every piece. The
 * fix is that the geometry is now read from the image itself and printed on every run, next to
 * the target, so the two can be compared rather than assumed.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';

const SOURCE = 'media/banner.png';
/** The Console's one permitted size. */
const W = 1024;
const H = 500;
const OUT = 'play/feature-graphic.png';

const CDP = 9820 + (process.pid % 150);

if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}.`);
  process.exit(1);
}

let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
const chrome: ChildProcess = execFile('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=/tmp/enchanted-chess-feature-${process.pid}`,
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
const evalJs = async <T>(expression: string): Promise<T> =>
  (await send<{ result: { value: T } }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))
    .result?.value;

try {
  await send('Runtime.enable');
  await send('Page.enable');
  const stage = 'media/.feature-stage.html';
  writeFileSync(stage, '<!doctype html><title>feature</title>');
  await send('Page.navigate', { url: `file://${resolve(stage)}` });
  await new Promise((r) => setTimeout(r, 600));

  await evalJs(`
    window.__ready = new Promise((done) => {
      const img = new Image();
      img.onload = () => { window.__img = img; done(true); };
      img.src = 'file://${resolve(SOURCE)}';
    });
    true
  `);
  await evalJs('window.__ready');
  const size = await evalJs<{ w: number; h: number }>(
    '({ w: window.__img.naturalWidth, h: window.__img.naturalHeight })',
  );
  console.log(`source ${size.w}x${size.h}  (${(size.w / size.h).toFixed(3)}:1, target ${(W / H).toFixed(3)}:1)`);

  const skew = Math.abs(size.w / size.h - W / H) / (W / H);
  if (skew > 0.02) {
    console.warn(`\n  the painting is ${(skew * 100).toFixed(1)}% off 2.048:1 — it will visibly stretch.`);
    console.warn('  redraw it at 2.048:1 rather than cropping: a crop here eats the bullets or the pieces.\n');
  }

  mkdirSync('play', { recursive: true });
  const url = await evalJs<string>(`
    (() => {
      const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H};
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(window.__img, 0, 0, ${W}, ${H});
      return c.toDataURL('image/png');
    })()
  `);
  writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${OUT} written at exactly ${W}x${H}`);
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-feature-${process.pid}`]);
  try {
    unlinkSync('media/.feature-stage.html');
  } catch {
    /* never created */
  }
}
