/// <reference lib="webworker" />
import { chooseAction, type InnkeeperOptions } from '../engine/ai';
import { withSeatTable } from './seatTable';
import type { GameState } from '../engine/types';

/** The house thinks on its own thread. Kyrax can burn two and a half seconds on a move, and
 *  the board should still take a click while he does it. */

export interface ThinkRequest {
  id: number;
  state: GameState;
  options: InnkeeperOptions;
}

export interface ThinkReply {
  id: number;
  choice: ReturnType<typeof chooseAction>;
}

self.onmessage = (event: MessageEvent<ThinkRequest>) => {
  const { id, state, options } = event.data;
  // `rng` and `now` cannot cross a worker boundary, so the worker uses its own. The table
  // cannot cross it either, which is why it lives in module scope — see `seatTable.ts`.
  const choice = chooseAction(state, withSeatTable(options));
  const reply: ThinkReply = { id, choice };
  (self as unknown as Worker).postMessage(reply);
};
