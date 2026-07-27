/* Crops a region out of a screenshot and blows it up, so a 40px game mark can be judged.
 *
 *   npx tsx scripts/zoom.ts <png> <x> <y> <w> <h> [outPng] [scale]
 *
 * Every visual decision in this project is checked by looking at the real build, and most of the
 * marks being checked — a shield, a chain, a skull — are twenty pixels across in a screenshot of
 * a phone. Squinting at the whole frame is how a mark that is merely *present* gets mistaken for
 * a mark that is *legible*. This pulls the region out at 4x nearest-neighbour, which is honest
 * about what is actually there rather than smoothing it into something prettier.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';

const [src, xs, ys, ws_, hs, out = 'play/zoom.png', scaleArg = '4'] = process.argv.slice(2);
if (!src || !existsSync(src)) {
  console.error('usage: npx tsx scripts/zoom.ts <png> <x> <y> <w> <h> [out] [scale]');
  process.exit(1);
}
const [x, y, w, h, scale] = [xs, ys, ws_, hs, scaleArg].map(Number);

const CDP = 9700 + (process.pid % 150);
let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
const chrome: ChildProcess = execFile('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=/tmp/enchanted-chess-zoom-${process.pid}`,
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

try {
  await send('Runtime.enable');
  await send('Page.enable');
  const stage = '.zoom-stage.html';
  writeFileSync(stage, '<!doctype html><title>zoom</title>');
  await send('Page.navigate', { url: `file://${resolve(stage)}` });
  await new Promise((r) => setTimeout(r, 500));
  await evalJs(`
    window.__ready = new Promise((done) => {
      const img = new Image();
      img.onload = () => { window.__img = img; done(true); };
      img.src = 'file://${resolve(src)}';
    });
    true
  `);
  await evalJs('window.__ready');
  const url = await evalJs<string>(`
    (() => {
      const c = document.createElement('canvas'); c.width = ${w * scale}; c.height = ${h * scale};
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(window.__img, ${x}, ${y}, ${w}, ${h}, 0, 0, ${w * scale}, ${h * scale});
      return c.toDataURL('image/png');
    })()
  `);
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${out}  ${w}x${h} at ${x},${y} -> ${w * scale}x${h * scale}`);
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-zoom-${process.pid}`]);
  try {
    unlinkSync('.zoom-stage.html');
  } catch {
    /* never created */
  }
}
