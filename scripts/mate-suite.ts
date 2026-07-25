/** Forced-mate suite. Each position has a mate White can force, and the engine passes only
 *  when it reports a mate score. Node-bounded so the number is a property of the search, not
 *  of the machine.
 *
 *    npx tsx scripts/mate-suite.ts             # 120k nodes
 *    npx tsx scripts/mate-suite.ts 400000      # a bigger budget
 *    npx tsx scripts/mate-suite.ts --prove     # check the fixtures themselves, not the search
 *
 *  `--prove` exists because of how the last bug here was found. The suite reported 5/6 for a
 *  long time, with "anastasia, mate in 3" permanently red, and the obvious reading was that the
 *  search had a blind spot worth fixing. It did not: the *fixture* was wrong. The position was
 *  not a mate in three, or in four, and no amount of nodes was ever going to find one. A
 *  permanently failing row is worse than no suite at all, because it teaches you to skip a red
 *  line — so the fixtures are now checkable by exhaustive search over `legalMoves`, which
 *  shares nothing with the heuristics under test. Run it after touching this list. */
import { applyAction } from '../src/engine/apply';
import { chooseAction, MATE_SCORE } from '../src/engine/ai';
import { parseFen } from '../src/engine/fen';
import { legalMoves, shieldBreakActions } from '../src/engine/movegen';
import { isError, type GameState } from '../src/engine/types';

const SUITE: { fen: string; name: string; plies: number }[] = [
  { name: 'back rank, mate in 1', plies: 1, fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' },
  { name: 'ladder mate in 2', plies: 3, fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1' },
  { name: 'queen + king, mate in 2', plies: 3, fen: '7k/8/6K1/8/8/8/8/6Q1 w - - 0 1' },
  { name: 'smothered-ish, mate in 2', plies: 3, fen: '6rk/6pp/8/6N1/8/8/8/6KQ w - - 0 1' },
  { name: 'two rooks, mate in 3', plies: 5, fen: '7k/8/8/8/8/8/5R2/6RK w - - 0 1' },
  // 1.Ne7+ Kh8 2.Qxh7+ Kxh7 3.Rh1#. The rook needs the h-file clear on arrival, which is why
  // the white king sits on a1 and not the more natural g1 — on g1 it blocks its own mate.
  { name: 'anastasia, mate in 3', plies: 5, fen: '5rk1/5ppp/2N5/7Q/8/8/8/K3R3 w - - 0 1' },
];

/** Ground truth: exhaustive minimax over legal actions, no evaluation and no pruning. Slow and
 *  certain, which is the opposite of the search and exactly why it can grade it. */
function forcedMate(state: GameState, plies: number): boolean {
  if (state.status.kind === 'checkmate') return state.status.winner === 'w';
  if (state.status.kind !== 'ongoing' || plies === 0) return false;
  const options = [...legalMoves(state, state.turn), ...shieldBreakActions(state, state.turn)];
  if (!options.length) return false;
  const step = (action: (typeof options)[number]) => {
    const next = applyAction(state, action);
    return !isError(next) && forcedMate(next, plies - 1);
  };
  return state.turn === 'w' ? options.some(step) : options.every(step);
}

if (process.argv.includes('--prove')) {
  let bad = 0;
  for (const { fen, name, plies } of SUITE) {
    const real = forcedMate(parseFen(fen), plies);
    if (!real) bad += 1;
    console.log(`${real ? 'ok   ' : 'WRONG'} ${name}  (${plies} plies)`);
  }
  console.log(bad ? `\n${bad} fixture(s) are not the mate they claim to be.` : '\nEvery fixture is a real forced mate.');
  process.exit(bad ? 1 : 0);
}

const nodes = Number(process.argv[2] ?? 120_000);
let found = 0;
let total = 0;
for (const { fen, name } of SUITE) {
  const started = Date.now();
  const c = chooseAction(parseFen(fen), { depth: 12, sample: 60, maxNodes: nodes });
  const mate = c != null && c.score > MATE_SCORE / 2;
  total += Date.now() - started;
  if (mate) found++;
  console.log(`${mate ? 'MATE ' : '  -  '} ${name}  score=${c?.score ?? 'n/a'}`);
}
console.log(`\n${found}/${SUITE.length} mates seen at ${nodes} nodes, ${total} ms total`);
