/* Drives overflow.ts one width at a time, each in its own process with a hard deadline.
 *
 * The check itself lives in overflow.ts and is unchanged; this exists purely because a
 * long-lived headless Chrome session on this machine can go quiet mid-run (first seen the
 * night Chrome auto-updated underneath the session), and a wrapper that can kill and retry a
 * width is simpler and more honest than trying to out-engineer a browser's session lifetime.
 * One retry per width: a flake passes on the second attempt, a real overflow fails twice.
 */
import { execFile } from 'node:child_process';

const WIDTHS = [320, 360, 393, 412, 480, 600, 820];
const DEADLINE_MS = 180_000;

function runWidth(width: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      'npx',
      ['tsx', 'scripts/overflow.ts'],
      { env: { ...process.env, ONLY_WIDTH: String(width) }, timeout: DEADLINE_MS, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout}${stderr}` }),
    );
    child.on('error', () => resolve({ ok: false, out: 'spawn failed' }));
  });
}

let failed = false;
for (const width of WIDTHS) {
  let result = await runWidth(width);
  if (!result.ok) {
    console.error(`${width}px: first attempt did not finish, retrying once`);
    result = await runWidth(width);
  }
  if (!result.ok) {
    failed = true;
    console.error(`${width}px FAILED twice:\n${result.out.slice(-1200)}`);
  } else {
    console.log(`${width}px ok`);
  }
}
if (failed) process.exit(1);
console.log('\nNo horizontal overflow at any width.');
