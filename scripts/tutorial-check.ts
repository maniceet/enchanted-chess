/* Drives the built bundle to a real board and checks that the Innkeeper actually says something.
 *
 * The tutorial's *detection* is unit-tested — `lessonFor` is pure and nine tests cover which
 * lesson a position earns. What no unit test can see is whether the wiring works: whether the
 * effect fires, whether the bubble renders, whether the lesson is remembered. The first draft of
 * that detection passed a GameState to `isShielded`, which takes a board, and silently made the
 * most important lesson unreachable — a mistake that types did not catch and that a passing test
 * suite would have hidden right up until a player did not get taught.
 *
 * So this plays the opening of a run in headless Chrome and reads the DOM.
 *
 *   npx tsx scripts/tutorial-check.ts
 */
import { execFile, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket } from 'ws';
import { LESSON_TEXT, TAUGHT_KEY, type Lesson } from '../src/ui/tutorial';
const PORT = 8231, CDP = 9224, DIST = 'dist';
const MIME: Record<string,string> = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server = createServer((req,res)=>{const u=(req.url??'/').split('?')[0];let f=join(DIST,normalize(u==='/'?'/index.html':u));if(!existsSync(f)||statSync(f).isDirectory())f=join(DIST,'index.html');res.writeHead(200,{'content-type':MIME[extname(f)]??'application/octet-stream'});createReadStream(f).pipe(res);});
server.listen(PORT);
let id=1; const pend=new Map<number,(v:unknown)=>void>();
const chrome: ChildProcess = execFile('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/ec-tut','about:blank']);
let ws!: WebSocket;
for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${CDP}/json/list`);const ts=await r.json() as any[];const p=ts.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(p){ws=new WebSocket(p.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.once('open',ok);ws.once('error',no)});break}}catch{}await new Promise(r=>setTimeout(r,200))}
ws.on('message',(raw)=>{const m=JSON.parse(String(raw));if(m.id!==undefined){pend.get(m.id)?.(m.result);pend.delete(m.id)}});
const send=(method:string,params:Record<string,unknown>={})=>{const i=id++;ws.send(JSON.stringify({id:i,method,params}));return new Promise<any>(ok=>pend.set(i,ok as any))};
const evalJs=async(e:string)=>(await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/`});
await new Promise(r=>setTimeout(r,900));
await evalJs("localStorage.clear()");
await send('Page.reload',{}); await new Promise(r=>setTimeout(r,900));
/* One bubble serves both the lesson and the seat's banter, and banter fires on nearly every
 * move — so a snapshot taken at the end proves nothing: it cannot distinguish "the lesson was
 * shown and has since made way for chatter" from "the lesson was recorded as taught and never
 * appeared at all". That second case is what actually shipped. Record every distinct line the
 * bubble shows, and check the lesson is among them. */
await evalJs(`window.__seen=[];setInterval(()=>{const b=document.querySelector('.bubble');const t=b&&b.textContent&&b.textContent.trim();if(t&&window.__seen[window.__seen.length-1]!==t)window.__seen.push(t)},120)`);
const click=(txt:string)=>evalJs(`(()=>{const w=${JSON.stringify(txt)}.toLowerCase();const b=[...document.querySelectorAll('button,a,[role=button]')].find(e=>(e.textContent||'').toLowerCase().includes(w)&&!e.disabled);if(!b)return false;b.click();return true})()`);
for (const step of ['Set out on the road','Onward','The Drunken Knight','Onward','Begin the game']) {
  const ok = await click(step);
  console.log(`${ok?'→':'✗'} ${step}`);
  await new Promise(r=>setTimeout(r,900));
}
// Long enough for the lesson to appear (700ms) and hold its full dwell (up to 11s).
await new Promise(r=>setTimeout(r,14_000));
const taught: Lesson[] = JSON.parse((await evalJs(`localStorage.getItem(${JSON.stringify(TAUGHT_KEY)})`)) ?? '[]');
const seen: string[] = (await evalJs('window.__seen')) ?? [];
ws.close(); chrome.kill(); server.close();

console.log(`\ntaught: ${taught.join(', ') || '(nothing — this position earned no lesson)'}`);
for (const line of seen) console.log(`  bubble: ${line.slice(0, 72)}`);

const unshown = taught.filter((l) => !seen.some((s) => s.includes(LESSON_TEXT[l].slice(0, 40))));
if (unshown.length > 0) {
  console.error(`\nRecorded as taught but never on screen: ${unshown.join(', ')}`);
  console.error('The traveller is marked as having been told, and was not. Banter is winning the bubble.');
  process.exit(1);
}
console.log(taught.length ? '\nEvery lesson taught was actually displayed.' : '\nNothing taught, nothing to check.');
