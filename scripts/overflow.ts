/* Fails when a screen is wider than the phone it is on.
 *
 * Three separate horizontal overflows have been found here by hand, one per session, each by
 * making the viewport harder rather than by reading the CSS: a landscape phone answering
 * "narrow" to every max-width breakpoint, Android's 2.0 font scale doubling a button's label,
 * and `--board` sized against the viewport while sitting inside a padded container. They were
 * all the same shape — something assumed it had the whole viewport width — and the third had
 * been on screen, faintly, in every screenshot taken for a week without being obvious enough
 * to chase.
 *
 * That is a bad way to find a recurring bug. This finds the fourth one.
 *
 *   npm run check:overflow
 *
 * It loads the built bundle in headless Chrome at a spread of widths, walks into each screen,
 * and asserts the document cannot scroll sideways — then names the widest element when it can,
 * because "something overflows" without a culprit is only half a bug report.
 */

import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/* Ports derived from the pid: two runs (or a zombie from a killed one) can never collide on
 * the same server or debugger port again. */
const PORT = 8100 + (process.pid % 400);
const CDP_PORT = 9300 + (process.pid % 400);
const DIST = 'dist';

/* The gate hung for a quarter of an hour the night Chrome auto-updated underneath it —
 * attached, idle, holding its ports, blocking every later gate run. A check that can hang is
 * worse than a check that fails: nothing downstream can tell the difference between "still
 * working" and "never coming back". Ten minutes of wall clock is more than any healthy run
 * has ever used; past that, die loudly. */
const WATCHDOG = setTimeout(() => {
  console.error('overflow.ts watchdog: no verdict after 10 minutes — infrastructure is stuck, not the layout.');
  process.exit(2);
}, 600_000);
WATCHDOG.unref?.();

/** Widths worth caring about. 320 is Android's largest Display size on a Pixel 6, which is the
 *  narrowest viewport a real phone produces and the one that caught the board overhang.
 *
 *  ONLY_WIDTH narrows the run to one width: the driver (overflow-all.ts) runs each width as
 *  its own short-lived process. The night Chrome updated to 151, long-lived multi-width runs
 *  stalled mid-screen at a random width — never the same one, never reproducibly — while every
 *  short-lived process stayed healthy. Short lives contain whatever that is. */
/* Phones, and the tablets nobody was checking.
 *
 * This list stopped at 820px, so an entire class of layout fault was invisible to it: the game
 * pushed 106px off the right edge of a 7-inch tablet held upright and the gate had nothing to
 * say, because it had never been asked about a screen that size. The Play Console lists phone,
 * 7-inch and 10-inch separately; so does this now. */
const ALL_WIDTHS = [320, 360, 393, 412, 480, 600, 820, 1200, 1600];
const WIDTHS = process.env.ONLY_WIDTH ? [Number(process.env.ONLY_WIDTH)] : ALL_WIDTHS;

/** Each screen, and the buttons to press to reach it from a cold load. Text is matched loosely
 *  because these labels are prose and will drift; a screen that cannot be reached fails loudly
 *  rather than silently passing, which is the whole point. */
const SCREENS: Array<{ name: string; path: string[] }> = [
  { name: 'home', path: [] },
  { name: 'rules', path: ['Rules'] },
  { name: 'drills', path: ['Innkeeper’s table'] },
  { name: 'drill stage', path: ['Innkeeper’s table', 'The shield'] },
  { name: 'prologue', path: ['Set out on the road'] },
  { name: 'the road', path: ['Set out on the road', 'Onward'] },
  { name: 'story card', path: ['Set out on the road', 'Onward', 'The Drunken Knight'] },
  {
    name: 'reveal',
    path: ['Set out on the road', 'Onward', 'The Drunken Knight', 'Onward'],
  },
  {
    name: 'board',
    path: ['Set out on the road', 'Onward', 'The Drunken Knight', 'Onward', 'Begin the game'],
  },
];

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serve(): Server {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    // The bundle is a single page: anything that is not a file is index.html.
    let file = join(DIST, normalize(url === '/' ? '/index.html' : url));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  server.listen(PORT);
  return server;
}

/** Minimal CDP client. `ws` is already a dependency for the online server, so this needs no
 *  new package and no Puppeteer. */
class Devtools {
  private next = 1;
  private pending = new Map<number, { ok: (v: unknown) => void; no: (e: Error) => void }>();

  private constructor(private socket: WebSocket) {
    socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id === undefined) return; // an event; nothing here listens for them
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.no(new Error(msg.error.message));
      else waiter.ok(msg.result);
    });
    // A socket that dies must fail every waiter. Without this, a Chrome that exits mid-run
    // leaves the in-flight send pending forever — the exact silent 10-minute hang the
    // watchdog kept catching: no response, no rejection, no progress.
    const fail = (why: string) => () => {
      for (const [, waiter] of this.pending) waiter.no(new Error(`devtools socket ${why}`));
      this.pending.clear();
    };
    socket.on('close', fail('closed'));
    socket.on('error', fail('errored'));
  }

  static async attach(port: number): Promise<Devtools> {
    // Chrome needs a moment to open the port; poll rather than guess at a sleep.
    for (let i = 0; i < 50; i++) {
      try {
        // A half-open port makes a plain fetch hang forever; bounded, it just retries.
        const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
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

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.next++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((ok, no) => {
      this.pending.set(id, { ok: ok as (v: unknown) => void, no });
      setTimeout(() => {
        if (this.pending.delete(id)) no(new Error(`${method} timed out`));
      }, 20_000);
    });
  }

  /** Run an expression in the page and hand back its value. */
  async evaluate<T>(expression: string): Promise<T> {
    const res = await this.send<{ result: { value: T }; exceptionDetails?: { text: string } }>(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
    );
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  }

  close(): void {
    this.socket.close();
  }
}

/** Click the first button whose text contains `label`. Returns false if there is none. */
const clickByText = (label: string) => `
  (() => {
    const wanted = ${JSON.stringify(label)}.toLowerCase();
    const hit = [...document.querySelectorAll('button, a, [role="button"]')]
      .find((el) => (el.textContent || '').toLowerCase().includes(wanted) && !el.disabled);
    if (!hit) return false;
    hit.click();
    return true;
  })()
`;

/** Measure the document, and name the worst offender when it is too wide. */
const MEASURE = `
  (() => {
    const doc = document.documentElement;
    const over = doc.scrollWidth - doc.clientWidth;
    if (over <= 0) return { over: 0 };
    // The culprit is the element whose right edge reaches furthest past the viewport. Report
    // enough to find it in the stylesheet without guessing.
    let worst = null;
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // Past the right edge, or starting left of zero. The first version only looked right, and
      // reported "52px over" with no culprit at all on a page whose offender hung off the left.
      const past = Math.round(Math.max(r.right - doc.clientWidth, -r.left));
      if (past > 0 && (!worst || past > worst.past)) {
        worst = {
          past,
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          width: Math.round(r.width),
        };
      }
    }
    // Nothing overhanging and yet the page is too wide: the cause is a container that refuses
    // to shrink rather than a child sticking out. Naming the widest element in the document is
    // what actually points at it, and a report with no culprit at all is barely a report.
    if (!worst) {
      let widest = null;
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (!widest || r.width > widest.width) {
          widest = {
            past: 0,
            tag: el.tagName.toLowerCase(),
            cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
            width: Math.round(r.width),
          };
        }
      }
      worst = widest;
    }
    return { over, worst };
  })()
`;

interface Failure {
  width: number;
  screen: string;
  over: number;
  worst?: { past: number; tag: string; cls: string; width: number };
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('No dist/ — run `npm run build` first.');
    process.exit(1);
  }
  const server = serve();
  const failures: Failure[] = [];

  /* One Chrome per width, not one for the whole run. The night Chrome auto-updated to 151 the
   * long-lived session went quiet somewhere inside the second width — sixty-odd navigations on
   * one DevTools socket — while every short-lived tour script stayed healthy. Nine navigations
   * per process is the profile that works; pay the ~2s relaunch seven times and stop debugging
   * a browser's session lifetime. */
  try {
    for (const [index, width] of WIDTHS.entries()) {
      // Port per width, not per run: the previous Chrome is still dying while the next one
      // starts, and sharing the port let the new one bind to the old one's ghost.
      const cdp = CDP_PORT + index;
      console.error(`[${width}px] launching chrome on :${cdp}`);
      const chrome = execFile(CHROME, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        `--remote-debugging-port=${cdp}`,
        // Unique per width as well as per pid: a killed Chrome leaves a SingletonLock in its
        // profile, and the next launch against the same dir stalls waiting on it forever.
        `--user-data-dir=/tmp/enchanted-chess-overflow-${process.pid}-${width}`,
        'about:blank',
      ]);
      let dt: Devtools;
      try {
        dt = await Devtools.attach(cdp);
      } catch (e) {
        chrome.kill();
        throw e;
      }
      console.error(`[${width}px] attached`);
      await dt.send('Page.enable');
      await dt.send('Runtime.enable');
      await dt.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 800,
        deviceScaleFactor: 1,
        mobile: true,
      });

      for (const screen of SCREENS) {
        console.error(`[${width}px] ${screen.name}`);
        // Every screen starts from a cold load with no saved run, so one screen's state can
        // never explain another's result. The clear has to happen *after* a navigation:
        // `about:blank` is an opaque origin and touching its storage throws.
        await dt.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
        await new Promise((r) => setTimeout(r, 500));
        await dt.evaluate('localStorage.clear()');
        await dt.send('Page.reload', {});
        await new Promise((r) => setTimeout(r, 700));

        let reached = true;
        for (const step of screen.path) {
          const clicked = await dt.evaluate<boolean>(clickByText(step));
          if (!clicked) {
            reached = false;
            console.error(`  ${width}px  ${screen.name}: could not find "${step}"`);
            break;
          }
          await new Promise((r) => setTimeout(r, 450));
        }
        if (!reached) continue;

        const m = await dt.evaluate<{ over: number; worst?: Failure['worst'] }>(MEASURE);
        if (m.over > 0) failures.push({ width, screen: screen.name, over: m.over, worst: m.worst });
      }
      dt.close();
      chrome.kill();
      console.log(`${width}px checked`);
      // `chrome.kill()` reaches only the launcher process. The GPU, network and renderer
      // helpers it spawned are separate processes that orphan and live on — forty-five of
      // them were found still running after one night of gate and tour launches, and the
      // accumulated load is what made every later launch slower and flakier. The profile dir
      // is unique to this run, so the match cannot touch anything else.
      execFile('/usr/bin/pkill', ['-f', `enchanted-chess-overflow-${process.pid}-${width}`]);
    }
  } finally {
    server.close();
  }

  clearTimeout(WATCHDOG);
  if (failures.length === 0) {
    console.log(`\nNo horizontal overflow at ${WIDTHS.join(', ')}px across ${SCREENS.length} screens.`);
    return;
  }
  console.error(`\n${failures.length} screen(s) scroll sideways:\n`);
  for (const f of failures) {
    const w = f.worst;
    console.error(
      `  ${f.width}px  ${f.screen}: ${f.over}px over` +
        (w ? ` — widest is <${w.tag} class="${w.cls}"> at ${w.width}px, ${w.past}px past the edge` : ''),
    );
  }
  process.exit(1);
}

void main();
