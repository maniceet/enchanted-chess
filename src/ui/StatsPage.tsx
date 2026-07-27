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
import { forgetLessons } from './tutorial';
import { enchName, powerName } from './i18n';

/* `name` is a parameter rather than a fixed call, because this table is used twice and the
 * second use was rendering raw identifiers. Every key went through `enchName`, which knows the
 * enchantments and nothing else, so the King powers table listed "teleport" and "decree" in
 * lowercase beside an enchantments table listing "Taunt" and "Poison" — the ?? fallback quietly
 * printing the id rather than failing. */
function TallyTable({
  title,
  rows,
  label,
  name,
}: {
  title: string;
  rows: Tally[];
  label: string;
  name: (key: string) => string;
}) {
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
                <td>{name(row.key)}</td>
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

      {/* Before the first game there is nothing to count, and three tables of zeros is a worse
          answer than one sentence. The old empty state printed "White wins 0 / Black wins 0 /
          Draws 0", then "Nothing tallied yet" twice, which tells a curious first-time visitor
          neither what the room is for nor why it is worth coming back to. Say what will be here
          and what fills it. */}
      {records.length === 0 ? (
        <div className="stats-grid">
          <div className="panel">
            <h3>An empty slate</h3>
            <p className="muted">
              The house counts every finished game — at this table and on the road alike. Once
              there are games on the slate, this is where the shape of them shows: which
              enchantments you actually reach for, which of the King’s words win and which only
              look like they should, and whether White’s move really is worth what everyone says.
            </p>
            <p className="muted">Play a game and come back.</p>
          </div>
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
      ) : (
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
        </div>

        <TallyTable
          title="Enchantments"
          rows={enchantmentTallies(records)}
          label="Enchantment"
          name={enchName}
        />
        <TallyTable title="King powers" rows={powerTallies(records)} label="Power" name={powerName} />

        {/* The Innkeeper teaches each rule once, ever. This is the one place to ask for the
            course again — worth having because "once, ever" is also what a rule half-read
            mid-game looks like from the player's side. Its own row, after the tallies: it is
            a door, not a statistic, and it sat inside the Colour table looking like one. */}
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
      )}
    </>
  );
}
