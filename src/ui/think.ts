import { chooseAction, type InnkeeperChoice, type InnkeeperOptions } from '../engine/ai';
import { withSeatTable } from './seatTable';
import type { GameState } from '../engine/types';
import type { ThinkReply, ThinkRequest } from './aiWorker';

/** Asks the house for a move on a worker thread so a long search never freezes the board.
 *  If the worker is missing, broken, or slow to answer, the same engine runs inline instead:
 *  a failed thread must never cost the player a move. */

interface Pending {
  resolve: (choice: InnkeeperChoice | null) => void;
  state: GameState;
  options: InnkeeperOptions;
  timer: number;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function settleInline(id: number): void {
  const job = pending.get(id);
  if (!job) return;
  pending.delete(id);
  window.clearTimeout(job.timer);
  job.resolve(chooseAction(job.state, withSeatTable(job.options)));
}

function abandonWorker(): void {
  workerBroken = true;
  worker?.terminate();
  worker = null;
  for (const id of [...pending.keys()]) settleInline(id);
}

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ThinkReply>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      window.clearTimeout(job.timer);
      job.resolve(event.data.choice);
    };
    worker.onerror = () => {
      console.warn('[enchanted-chess] the house thread failed; thinking inline instead');
      abandonWorker();
    };
    worker.onmessageerror = () => abandonWorker();
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

export function think(
  state: GameState,
  options: InnkeeperOptions,
): Promise<InnkeeperChoice | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(chooseAction(state, withSeatTable(options)));

  const id = nextId++;
  return new Promise((resolve) => {
    // If the thread has not answered well past its own budget, take the move inline.
    const grace = (options.budgetMs ?? 1500) + 1500;
    const timer = window.setTimeout(() => settleInline(id), grace);
    pending.set(id, { resolve, state, options, timer });
    const request: ThinkRequest = { id, state, options };
    w.postMessage(request);
  });
}

/** Drops any answer still in flight, for when the player takes a move back. */
export function forgetPendingThoughts(): void {
  for (const [, job] of pending) window.clearTimeout(job.timer);
  pending.clear();
}
