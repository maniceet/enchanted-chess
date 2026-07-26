import { ENCH_NAME } from './Pieces';
import {
  clearRecords,
  colorSplit,
  enchantmentTallies,
  loadRecords,
  powerTallies,
  tauntQueenSides,
  winRate,
  type Tally,
} from './stats';
import type { Enchantment } from '../engine/types';
import { forgetLessons } from './tutorial';

function TallyTable({ title, rows, label }: { title: string; rows: Tally[]; label: string }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="muted">Nothing tallied yet.</p>}
      {rows.length > 0 && (
        <table className="stat-table">
          <thead>
            <tr>
              <th>{label}</th>
              <th className="num-col">Picks</th>
              <th className="num-col">W</th>
              <th className="num-col">D</th>
              <th className="num-col">L</th>
              <th className="num-col">Win%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{ENCH_NAME[row.key as Enchantment] ?? row.key}</td>
                <td className="num-col">{row.picks}</td>
                <td className="num-col">{row.wins}</td>
                <td className="num-col">{row.draws}</td>
                <td className="num-col">{row.losses}</td>
                <td className="num-col">{winRate(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The bar: what the house has seen. Pick and win rates per enchantment and per power,
 *  plus the colour split — the balance instrumentation the spec asks for from day one. */
export function Stats({ onBack }: { onBack: () => void }) {
  const records = loadRecords();
  const split = colorSplit(records);
  const taunt = tauntQueenSides(records);

  return (
    <>
      <header className="screen-head">
        <div>
          <h2 className="screen-title">The Bar — tallies of the house</h2>
          <p className="screen-sub">
            Every finished game at this table, counted. {records.length} game
            {records.length === 1 ? '' : 's'} on the slate.
          </p>
        </div>
        <button type="button" onClick={onBack}>
          ← Back to the tavern
        </button>
      </header>

      <div className="stats-grid">
        <div className="panel">
          <h3>Colour</h3>
          <table className="stat-table">
            <tbody>
              <tr>
                <td>White wins</td>
                <td className="num-col">{split.white}</td>
              </tr>
              <tr>
                <td>Black wins</td>
                <td className="num-col">{split.black}</td>
              </tr>
              <tr>
                <td>Draws</td>
                <td className="num-col">{split.draws}</td>
              </tr>
              <tr>
                <td>Whole budget on one Taunt</td>
                <td className="num-col">
                  {taunt.picks} played · {winRate(taunt)} won
                </td>
              </tr>
            </tbody>
          </table>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearRecords();
                onBack();
              }}
            >
              Wipe the slate
            </button>
          )}
          {/* The Innkeeper teaches each rule once, ever. This is the one place to ask for the
              course again — worth having because "once, ever" is also what a rule half-read
              mid-game looks like from the player's side. */}
          <button
            type="button"
            onClick={() => {
              forgetLessons();
              onBack();
            }}
          >
            Hear the Innkeeper’s lessons again
          </button>
        </div>

        <TallyTable title="Enchantments" rows={enchantmentTallies(records)} label="Enchantment" />
        <TallyTable title="King powers" rows={powerTallies(records)} label="Power" />
      </div>
    </>
  );
}
