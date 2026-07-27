/* Builds the whole icon set from one painted square — media/logo.png.
 *
 *   npx tsx scripts/appicon.ts
 *
 * The painting is a knight on a dark ground inside a gold rune ring, and it cannot simply be
 * resized into every slot, because the slots want different things:
 *
 *   the Play Store icon is a 512px square nobody crops, so it gets the whole painting;
 *
 *   a launcher icon is an *adaptive* icon — a 108dp square whose outer eighteen dp on each
 *     side the launcher may crop, mask to a circle, and slide about for parallax. Only the
 *     centre survives, and the number that matters is not the width of the art but its
 *     diagonal: a tall knight whose height fits the circle still has its ears and its base
 *     clipped off, because the corners of its bounding box stand outside the circle. That was
 *     learned the hard way on this project once already.
 *
 * So the foreground is the knight alone — found by looking for it rather than by hand-measuring
 * — scaled until its diagonal fits the safe circle, on transparency, over a flat background
 * colour sampled from the painting's own corner. The rune ring is deliberately dropped from the
 * launcher icon: at 48px it is a grey smudge round the edge, and it is the first thing a circle
 * mask eats.
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP = 9800 + (process.pid % 150);
const SOURCE = 'media/logo.png';

/** Android's guaranteed-visible circle: 66 of the 108dp square. */
const SAFE = 66 / 108;
/** Launcher densities, and the pixel size of a 108dp icon at each. */
const DENSITIES: Array<[string, number]> = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];
/** The plain square icon, for launchers older than adaptive icons. */
const LEGACY: Array<[string, number]> = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

if (!existsSync(SOURCE)) {
  console.error(`No ${SOURCE}. Put the painting there first.`);
  process.exit(1);
}

let nextId = 1;
const pending = new Map<number, (v: unknown) => void>();
const chrome: ChildProcess = execFile(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${CDP}`,
  `--user-data-dir=/tmp/enchanted-chess-appicon-${process.pid}`,
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
  (
    await send<{ result: { value: T }; exceptionDetails?: { text: string } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result?.value;

try {
  await send('Runtime.enable');
  await send('Page.enable');
  // A file:// image taints a canvas on an opaque origin, so sit on a real file first.
  const stage = 'media/.appicon-stage.html';
  writeFileSync(stage, '<!doctype html><title>icons</title>');
  await send('Page.navigate', { url: `file://${resolve(stage)}` });
  await new Promise((r) => setTimeout(r, 600));

  await evalJs<boolean>(`
    window.__ready = new Promise((done) => {
      const img = new Image();
      img.onload = () => { window.__img = img; done(true); };
      img.src = 'file://${resolve(SOURCE)}';
    });
    true
  `);
  await evalJs('window.__ready');

  /* Where the knight actually is. The background is near-black and the knight is ivory, so a
   * brightness threshold finds it without anybody measuring pixels by hand — and it keeps
   * working if the painting is ever replaced. */
  const box = await evalJs<{ x: number; y: number; w: number; h: number; bg: string; size: number }>(`
    (() => {
      const img = window.__img, n = img.naturalWidth;
      const c = document.createElement('canvas'); c.width = n; c.height = n;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, n, n).data;
      let x0 = n, y0 = n, x1 = 0, y1 = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        // Ivory: bright in every channel. The gold ring is bright in red and green but much
        // darker in blue, so a blue floor separates the knight from its halo.
        if (d[i] > 170 && d[i + 1] > 165 && d[i + 2] > 140) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      const corner = g.getImageData(2, 2, 1, 1).data;
      const hex = '#' + [corner[0], corner[1], corner[2]].map(v => v.toString(16).padStart(2, '0')).join('');
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, bg: hex, size: n };
    })()
  `);
  const diag = Math.round(Math.hypot(box.w, box.h));
  console.log(`knight found at ${box.x},${box.y} — ${box.w}x${box.h}px, diagonal ${diag}`);
  console.log(`background sampled from the corner: ${box.bg}`);

  /** The whole painting, square, opaque — for the store and the legacy launcher icon. */
  const whole = async (px: number): Promise<Buffer> => {
    const url = await evalJs<string>(`
      (() => {
        const c = document.createElement('canvas'); c.width = ${px}; c.height = ${px};
        const g = c.getContext('2d');
        g.fillStyle = ${JSON.stringify(box.bg)}; g.fillRect(0, 0, ${px}, ${px});
        g.imageSmoothingQuality = 'high';
        g.drawImage(window.__img, 0, 0, ${px}, ${px});
        return c.toDataURL('image/png');
      })()
    `);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  /* The whole painting, shrunk until the *knight* fits the safe circle.
   *
   * Cropping the knight out and enlarging it was the obvious move and it was wrong twice over.
   * The crop takes a rectangle, and the rectangle contains the gold rune ring behind the
   * knight, so the icon gained a visible bright box with a hard edge sitting behind the piece —
   * an artifact that reads as a mistake. And it bought nothing: fitting the *cropped box's*
   * diagonal into the circle leaves the knight the same height it would have been anyway.
   *
   * So draw the painting entire, scaled so the knight's own corners land inside the circle. The
   * ring survives as a hint at the edges, whatever the mask trims of it goes quietly because
   * the painting's ground and the adaptive background are the same colour, and there is no seam
   * anywhere because there is no crop.
   */
  const foreground = async (px: number): Promise<Buffer> => {
    const url = await evalJs<string>(`
      (() => {
        const c = document.createElement('canvas'); c.width = ${px}; c.height = ${px};
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        const b = ${JSON.stringify(box)};
        // The knight's diagonal, as a fraction of the whole painting.
        const knightDiag = Math.hypot(b.w, b.h) / b.size;
        // 0.70 rather than 66/108: the guaranteed circle is 66dp, the mask launchers actually
        // draw is nearer 72, and every corner of this particular box is dark ground rather than
        // ink. Measured after the fact against the strict circle regardless.
        const scale = 0.70 / knightDiag;
        const side = ${px} * scale;
        const at = (${px} - side) / 2;
        g.drawImage(window.__img, at, at, side, side);
        return c.toDataURL('image/png');
      })()
    `);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  for (const [density, px] of DENSITIES) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/ic_launcher_foreground.png`, await foreground(px));
  }
  for (const [density, px] of LEGACY) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    const square = await whole(px);
    writeFileSync(`${dir}/ic_launcher.png`, square);
    writeFileSync(`${dir}/ic_launcher_round.png`, square);
  }
  console.log('launcher icons written for all five densities');

  mkdirSync('play', { recursive: true });
  writeFileSync('play/icon-512.png', await whole(512));
  mkdirSync('public/icons', { recursive: true });
  writeFileSync('public/icons/icon-512.png', await whole(512));
  writeFileSync('public/icons/icon-192.png', await whole(192));
  console.log('play/icon-512.png and the web icons written');
  console.log(`\nSet the adaptive background colour to ${box.bg} in res/values/ic_launcher_background.xml`);
} finally {
  socket.close();
  chrome.kill();
  execFile('/usr/bin/pkill', ['-f', `enchanted-chess-appicon-${process.pid}`]);
  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync('media/.appicon-stage.html');
  } catch {
    /* never created */
  }
}
