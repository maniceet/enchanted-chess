/** Forced-mate suite. Check extensions are supposed to buy exactly this: seeing the end of a
 *  forced sequence that a flat depth cuts in half. Each position has a mate White can force,
 *  and the engine passes only when it reports a mate score. Node-bounded so the number is a
 *  property of the search, not of the machine. */
import { chooseAction, MATE_SCORE } from '../src/engine/ai';
import { parseFen } from '../src/engine/fen';

const SUITE: { fen: string; name: string }[] = [
  { name: 'back rank, mate in 1', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' },
  { name: 'ladder mate in 2', fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1' },
  { name: 'queen + king, mate in 2', fen: '7k/8/6K1/8/8/8/8/6Q1 w - - 0 1' },
  { name: 'smothered-ish, mate in 2', fen: '6rk/6pp/8/6N1/8/8/8/6KQ w - - 0 1' },
  { name: 'two rooks, mate in 3', fen: '7k/8/8/8/8/8/5R2/6RK w - - 0 1' },
  { name: 'anastasia, mate in 3', fen: '4r1k1/5ppp/8/8/8/8/1Q6/6KR w - - 0 1' },
];

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
