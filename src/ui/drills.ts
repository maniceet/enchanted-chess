/* The Innkeeper's table: one set piece per enchantment.
 *
 * The bubble lessons (tutorial.ts) explain a rule the moment it first matters in a real game,
 * and that is the right place for words — but some rules are only believed when they are *felt*.
 * "A capture attempt breaks the shield instead" reads like a technicality right up until your
 * rook slams into a pawn and stays where it stood, a whole turn gone. So each enchantment gets
 * a tiny scripted position with one thing to do, and the Innkeeper telling you to do it.
 *
 * Pure data + predicates, no DOM: which position, which instruction, and how to recognise that
 * the traveller has done the thing. The page that renders these (DrillsPage) owns nothing but
 * presentation, and the test suite can walk every drill's scripted solution to prove each one
 * is actually completable — a drill with an impossible goal is a locked room, and the only way
 * to find one without a test is a stuck player.
 */

import { position } from '../engine/testkit';
import { parseSquare } from '../engine/board';
import type { Action, Enchantment, GameState } from '../engine/types';

export interface DrillStep {
  /** The Innkeeper's instruction, shown until the step is done. */
  readonly say: string;
  /** Recognises the goal. `action` is what the player just did, `after` is the settled board. */
  readonly done: (before: GameState, action: Action, after: GameState) => boolean;
  /** Said the moment the step lands. */
  readonly praise: string;
  /** Black's scripted reply after this step, when the drill needs the turn handed back. */
  readonly reply?: Action;
}

export interface Drill {
  readonly id: Enchantment;
  readonly title: string;
  /** Fresh state per attempt: drills are retried, and shared state would carry scars. */
  readonly start: () => GameState;
  readonly steps: readonly DrillStep[];
}

const sq = parseSquare;
const move = (from: string, to: string): Action => ({ type: 'move', from: sq(from), to: sq(to) });

/** Did this action capture the piece standing on `square`? Checked on the *before* board so a
 *  shield-break (which removes nothing) can never satisfy it. */
const took = (square: string) => (before: GameState, action: Action, _after: GameState) =>
  action.type === 'move' && action.to === sq(square) && before.board[sq(square)] !== null;

export const DRILLS: readonly Drill[] = [
  {
    id: 'taunt',
    title: 'The shield',
    start: () =>
      position({ h1: 'wk', d1: 'wr', d5: 'bp:taunt', d8: 'br', h8: 'bk' }),
    steps: [
      {
        say: 'That pawn is shielded: defended by the rook behind it, standing on its own ground. Take it anyway — rook to d5.',
        done: (_b, action) => action.type === 'shieldBreak',
        praise:
          'Steel, not flesh. Your rook never moved, and your whole turn went on the shield. But look — it is broken now, and a broken shield never comes back.',
        reply: move('h8', 'g8'),
      },
      {
        say: 'Now take it. It is only a pawn again.',
        done: took('d5'),
        praise: 'One shield, one life. Against a shielded piece, always count the extra turn.',
      },
    ],
  },
  {
    id: 'martyr',
    title: 'The martyr',
    start: () => position({ e1: 'wk', d1: 'wq', d4: 'bn:martyr', h8: 'bk' }),
    steps: [
      {
        say: 'That knight is marked to die badly. Take it with your queen and see what it costs.',
        done: took('d4'),
        praise: 'The knight is dead — and your queen is bound where she stands.',
        reply: move('h8', 'g8'),
      },
      {
        say: 'Try her: she will not move this turn. Whoever kills a Martyr stands still. Walk your King instead.',
        done: (_b, action) => action.type === 'move',
        praise:
          'The binding lifts after this turn. Sometimes a Martyr is worth taking. Sometimes it is exactly what they wanted.',
      },
    ],
  },
  {
    id: 'poison',
    title: 'The poisoned pawn',
    start: () =>
      position({ g1: 'wk', c3: 'wn', d5: 'bp:poison', g2: 'bp:poison', a8: 'bk' }),
    steps: [
      {
        say: 'Take the poisoned pawn on d5 with your knight. Go on.',
        done: took('d5'),
        praise:
          'Both dead — poison kills whatever kills it. Never spend a piece you would miss on it.',
        reply: move('a8', 'b8'),
      },
      {
        say: 'Now the other one — with your King. He bows to no enchantment.',
        done: took('g2'),
        praise:
          'Alive. Remember this: an undefended poison pawn beside your King is not a threat, it is his meal.',
      },
    ],
  },
  {
    id: 'outpost',
    title: 'The outpost',
    start: () =>
      position({ e1: 'wk', c4: 'wp', e4: 'wp', d1: 'wr', d5: 'bn:outpost', h8: 'bk' }),
    steps: [
      {
        say: 'That knight stands on a plinth: your pawns cannot take it. Try them — no capture is even offered. It has to be the rook.',
        done: took('d5'),
        praise:
          'Pawns are the cheapest answer to a knight, and Outpost takes that answer away. Bring something that is not a pawn, or play around it.',
      },
    ],
  },
  {
    id: 'swift',
    title: 'The swift pawn',
    start: () => position({ e1: 'wk', e4: 'wp:swift', h8: 'bk' }),
    steps: [
      {
        say: 'A Swift pawn strides two squares whenever it likes, not just from home. March it: e4 to e6.',
        done: (_b, action) => action.type === 'move' && action.to === sq('e6'),
        praise:
          'Two ranks in one move, every move. The price: every stride can be taken en passant, so watch the squares it skips.',
      },
    ],
  },
  {
    id: 'herald',
    title: 'The herald',
    start: () => position({ e1: 'wk', b6: 'wp:herald', h8: 'bk' }),
    steps: [
      {
        say: 'A Herald crowns on the seventh rank, not the eighth. Push it one square and watch.',
        done: (_b, action, after) =>
          action.type === 'move' && after.board[sq('b7')]?.type === 'q',
        praise:
          'A whole rank early — that is the entire trick. When a Herald walks at you, count its squares twice.',
      },
    ],
  },
  {
    id: 'immolation',
    title: 'The burning pawn',
    start: () =>
      position({ g1: 'wk', d1: 'wr', c4: 'wn', e4: 'bb', d5: 'bp:immolation', h8: 'bk' }),
    steps: [
      {
        say: 'That pawn carries the Book of Immolation. Take it with your rook — and mind the ground in front of it.',
        done: (_b, action, after) =>
          took('d5')(_b, action, after) && after.board[sq('c4')] === null,
        praise:
          'The taker lives. The three squares the pawn was watching do not — your knight and their bishop, burned alike. Clear the ground before you strike, or make the fire theirs.',
      },
    ],
  },
  {
    id: 'squire',
    title: 'The squire',
    start: () => position({ e1: 'wk', f6: 'wp:squire', b2: 'wp:herald', h8: 'bk' }),
    steps: [
      {
        say: 'Your Squire stands deep in their half, and your Herald sits at home. The Squire changes places with a Herald anywhere on the board — swap them.',
        done: (_b, action) => action.type === 'swap',
        praise:
          'The Herald is one push from a crown, carried there in a single move. Had the Squire stood on the seventh, it would have crowned the moment it landed.',
      },
    ],
  },
];

const KEY = 'enchanted-chess:drills';

export function loadDrilled(): Enchantment[] {
  try {
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? (value.filter((v) => DRILLS.some((d) => d.id === v)) as Enchantment[])
      : [];
  } catch {
    return [];
  }
}

export function rememberDrilled(done: readonly Enchantment[], id: Enchantment): Enchantment[] {
  const next = done.includes(id) ? [...done] : [...done, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private browsing drills twice */
  }
  return next;
}
