/* Re-encode the seat portraits as WebP.
 *
 * They are the largest thing in the app by a distance: nine PNGs at roughly 250 KB each, about
 * 2.3 MB of a 5.07 MB download. Everything else in the bundle put together is smaller.
 *
 * The obvious fix is to store them smaller, and it is the wrong one. They are drawn at 30px in
 * the player bar and 40 in the seat rail — but `.story-portrait-frame` has no fixed width, it
 * fills its column, and the story cards are the best-looking screen in the game. Downscaling to
 * suit the smallest use would blur the largest.
 *
 * So keep every pixel and spend fewer bytes on them. WebP at quality 0.86 is visually
 * indistinguishable on this art and roughly a third of the size, alpha included. The floor is
 * Chrome 87 (see `vite.config.ts`), and WebP with transparency has been supported since long
 * before that.
 *
 *   npx tsx scripts/portraits.ts
 *
 * `sips` cannot write WebP, so the encode goes through a canvas in headless Chrome — the same
 * pipeline the icons and the chroma key already use. Reads the result back over the DevTools
 * protocol, because a screenshot would only re-encode it as PNG again.
 */

import { execFile, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = 9223;
const DIR = 'public/portraits';
const QUALITY = 0.86;

class Devtools {
  private next = 1;
  private pending = new Map<number, (v: unknown) => void>();
  private constructor(private socket: WebSocket) {
    socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: number; result?: unknown };
      if (msg.id === undefined) return;
      this.pending.get(msg.id)?.(msg.result);
      this.pending.delete(msg.id);
    });
  }
  static async attach(): Promise<Devtools> {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) {
          const socket = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((ok, no) => {
            socket.once('open', ok);
            socket.once('error', no);
          });
          return new Devtools(socket);
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Chrome never opened its debugging port');
  }
  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((ok) => this.pending.set(id, ok as (v: unknown) => void));
  }
  async evaluate<T>(expression: string): Promise<T> {
    const res = await this.send<{ result: { value: T } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result.value;
  }
  close(): void {
    this.socket.close();
  }
}

const encode = (file: string) => `
  new Promise((done) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      done(c.toDataURL('image/webp', ${QUALITY}));
    };
    img.onerror = () => done('');
    img.src = 'file://${resolve(file)}';
  })
`;

let chrome: ChildProcess | undefined;
let dt: Devtools | undefined;
try {
  chrome = execFile(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--allow-file-access-from-files',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/enchanted-chess-portraits',
    'about:blank',
  ]);
  dt = await Devtools.attach();
  await dt.send('Runtime.enable');
  await dt.send('Page.enable');
  // `about:blank` is an opaque origin, so a file:// image taints the canvas and `toDataURL`
  // refuses. Park the page on a real file in the same directory as the art and the origin
  // matches — that plus `--allow-file-access-from-files` is what makes the read-back legal.
  const stage = join(DIR, '.portraits-stage.html');
  writeFileSync(stage, '<!doctype html><title>stage</title>');
  await dt.send('Page.navigate', { url: `file://${resolve(stage)}` });
  await new Promise((r) => setTimeout(r, 600));

  let before = 0;
  let after = 0;
  for (const name of readdirSync(DIR).filter((f) => f.endsWith('.png'))) {
    const png = join(DIR, name);
    const url = await dt.evaluate<string>(encode(png));
    if (!url.startsWith('data:image/webp')) throw new Error(`${name}: Chrome would not encode it`);
    const webp = join(DIR, name.replace(/\.png$/, '.webp'));
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(webp, bytes);
    before += statSync(png).size;
    after += bytes.length;
    unlinkSync(png);
    console.log(`${name.padEnd(16)} ${(statSync(webp).size / 1024).toFixed(0).padStart(4)} KB`);
  }
  console.log(`\n${(before / 1024).toFixed(0)} KB of PNG → ${(after / 1024).toFixed(0)} KB of WebP`);
} finally {
  try {
    unlinkSync(join(DIR, '.portraits-stage.html'));
  } catch {
    /* never created */
  }
  dt?.close();
  chrome?.kill();
}
