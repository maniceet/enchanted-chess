import { fileOf, rankOf, squareName } from './board';
import { makeMove } from './apply';
import { inCheck, legalMoves } from './movegen';
import type { Action, GameState, MoveAction, PieceType } from './types';

// Typed against PieceType so a new piece cannot be added without a letter — the Archbishop
// shipped as `undefinedc4` in the chronicle for exactly as long as this was a loose Record.
const LETTER: Record<PieceType, string> = {
  p: '',
  n: 'N',
  b: 'B',
  r: 'R',
  q: 'Q',
  d: 'D',
  a: 'A',
  k: 'K',
};

/** Standard algebraic notation, extended per spec §4 with ⚡ (power), ⊘ (shield-break),
 *  ⛨ (binding) and ⇄ (the Squire's trade). */
export function toSan(state: GameState, action: Action): string {
  if (action.type === 'resign') return 'resign';
  // A clock running out is a turn the game took on the player's behalf, and it belongs in the
  // chronicle like any other. It was the one action type this function did not name, and the
  // cast below sent it into the move renderer, where `from` and `to` are undefined and both
  // resolve to square zero — so every game that ended on time closed with the move "a1a1", in
  // the log and in the export alike.
  if (action.type === 'flag') return '⏱';
  // Narrowed together, not one at a time: `DrawAction` carries both literals in a single
  // interface, and TypeScript only removes the member from the union once every literal it can
  // hold has been ruled out in one step. Two separate guards read fine and leave it in.
  if (action.type === 'drawOffer' || action.type === 'drawAccept') {
    return action.type === 'drawOffer' ? '(=)' : '½-½';
  }
  if (action.type === 'shieldBreak') {
    return `⊘${squareName(action.target)}`;
  }
  // A binding is its own kind of turn, so it gets its own mark rather than reading as a move
  // the Archbishop did not make.
  if (action.type === 'bind') {
    return `⛨${squareName(action.target)}`;
  }
  // Two pawns change places, so neither square alone tells the story: both, and the crown if
  // the Herald arrived on its rank.
  if (action.type === 'swap') {
    const promo = action.promo ? `=${action.promo.toUpperCase()}` : '';
    return `${squareName(action.from)}⇄${squareName(action.to)}${promo}`;
  }
  if (action.type === 'power') {
    const a = action.args;
    const where =
      a.kind === 'teleport'
        ? `${squareName(a.from)}→${squareName(a.to)}`
        : a.kind === 'relocate'
          ? `↔${squareName(a.with)}`
          : a.kind === 'decree'
            ? squareName(a.target)
            : a.kind === 'revive'
              ? `${a.piece.toUpperCase()}@${squareName(a.to)}`
              : a.kind === 'doom'
                ? `†${squareName(a.target)}`
                : 'time';
    return `⚡${a.kind}(${where})`;
  }

  // Not a cast. `action` is a MoveAction here only because every other member of the union has
  // been returned above, and if a new one is added this line stops compiling — which is the
  // check that was missing when `flag` was added and quietly rendered as a move.
  const move: MoveAction = action;
  const piece = state.board[move.from];
  if (!piece) return `${squareName(move.from)}${squareName(move.to)}`;
  const flags = move.flags ?? [];
  const after = makeMove(state, move);
  const suffix = inCheck(after, after.turn)
    ? legalMoves(after, after.turn).length === 0
      ? '#'
      : '+'
    : '';

  if (flags.includes('castleK')) return `O-O${suffix}`;
  if (flags.includes('castleQ')) return `O-O-O${suffix}`;

  const isCapture = state.board[move.to] != null || flags.includes('ep');
  const promo = move.promo ? `=${move.promo.toUpperCase()}` : '';

  if (piece.type === 'p') {
    const from = isCapture ? `${squareName(move.from)[0]}x` : '';
    return `${from}${squareName(move.to)}${promo}${suffix}`;
  }

  // Disambiguate against other same-type pieces that could reach the destination.
  const rivals = legalMoves(state, piece.color).filter((m) => {
    const other = state.board[m.from];
    return m.to === move.to && m.from !== move.from && other?.type === piece.type;
  });
  let disambig = '';
  if (rivals.length) {
    const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
    const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
    const name = squareName(move.from);
    disambig = !sameFile ? name[0] : !sameRank ? name[1] : name;
  }
  return `${LETTER[piece.type]}${disambig}${isCapture ? 'x' : ''}${squareName(move.to)}${suffix}`;
}
