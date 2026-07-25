import { CARRIER_MULTIPLIER, ENCH_COST, ENCH_TEXT, POWER_TEXT } from '../engine/loadout';
import type { Enchantment, PowerName } from '../engine/types';
import { ENCH_NAME, EnchRune } from './Pieces';

const ENCH_ORDER: Enchantment[] = ['taunt', 'martyr', 'outpost', 'swift', 'herald', 'poison'];
const POWER_ORDER: PowerName[] = ['teleport', 'relocate', 'decree', 'revive', 'chrono'];
const POWER_NAME: Record<PowerName, string> = {
  teleport: 'Teleport',
  relocate: 'Relocate',
  decree: 'Decree',
  revive: 'Revive',
  doom: 'Destined Death',
  chrono: 'Time Manipulation',
};
const CARRIERS: Record<Enchantment, string> = {
  taunt: 'any piece but the King',
  martyr: 'any piece but the King',
  outpost: 'pawn · knight · bishop',
  swift: 'pawn',
  herald: 'pawn',
  poison: 'pawn',
  immolation: 'pawn',
};

/** The rules, written as a letter left on the tavern wall. */
export function Rules({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="letter">
        <h2>Of Chess, and of Enchantment</h2>
        <p className="flourish">· ✦ ·</p>

        <p>
          Traveller, the game played at this table is chess as you know it. The pieces move as
          they have always moved. Kings still fall to checkmate, pawns still crown at the far
          rank, castles are still made, and a pawn that runs two squares may still be taken in
          passing.
        </p>
        <p>
          What is new is this: before the first move, each captain spends <strong>four points
          of enchantment</strong> upon their own pieces, and grants their King a single power.
          Then <strong>both loadouts are laid open on the table</strong>.
        </p>
        <p>
          That is the whole of the law here, and it is not sentiment. It is arithmetic. Magic
          that cannot be counted cannot be countered, so we count it: what a thing costs, what it
          may be borne by, and precisely where it stops. A power you cannot plan against is not a
          power, it is a swindle. Every enchantment below is written down to its limits, and the
          limits are the interesting part.
        </p>

        <h3>The Price of Magic</h3>
        <p>
          One enchantment per piece, no more. A piece of consequence bears magic poorly, and so
          the price is multiplied by its carrier: pawn ×{CARRIER_MULTIPLIER.p}, knight or bishop
          ×{CARRIER_MULTIPLIER.n}, rook ×{CARRIER_MULTIPLIER.r}, queen ×{CARRIER_MULTIPLIER.q}.
          Four points is the whole purse. Points left unspent are <em>reserve</em>, and reserve
          feeds only one thing: the Revive power. Spend nothing, and you may call back a knight
          from the dead instead.
        </p>

        <table>
          <thead>
            <tr>
              <th />
              <th>Enchantment</th>
              <th>Base</th>
              <th>Borne by</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {ENCH_ORDER.map((ench) => (
              <tr key={ench}>
                <td>
                  <EnchRune ench={ench} shield={ench === 'taunt' ? 'active' : undefined} />
                </td>
                <td>
                  <strong>{ENCH_NAME[ench]}</strong>
                </td>
                <td>{ENCH_COST[ench]}</td>
                <td>{CARRIERS[ench]}</td>
                <td>{ENCH_TEXT[ench]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>On Shields, and the Breaking of Them</h3>
        <p>
          A Taunted piece carries a shield under two conditions, both of which must hold at
          once: <em>a friend defends it</em>, and it <em>stands in its own half</em>, the near
          four ranks. Let the last defender wander off and the shield falls dark. Bring one back
          and it wakes again. But a shield that has been <strong>broken</strong> never returns.
        </p>
        <p>
          The half is the price of the armour. Taunt guards ground; it does not conquer it.
          March a shielded piece over the middle and the shield sleeps the moment it crosses,
          because armour worn on someone else's field is only weight. Walk it home and it wakes.
          A boar is dangerous in its own wood.
        </p>
        <p>
          Striking a shield is not a capture. The shield shatters, your attacker stays exactly
          where it stood, and your turn is spent. No poison, no martyrdom, no reset of the
          fifty-move count. And because breaking a shield answers nothing, you may not do it
          while your own King stands in check. A shielded piece giving check may therefore be
          answered two ways only: move the King, or block the line.
        </p>
        <p>
          Your own Taunt buys you nothing on the attack. To strike a shield you must reach into
          the enemy half, and that is precisely where your own shield sleeps. Armour does not
          punch through armour; only patience does.
        </p>

        <h3>The King Bows to No Enchantment</h3>
        <p>
          Your King may never carry magic, and no magic may be worked upon him. Poison does not
          touch a King who captures. Martyr does not still his hand. Decree cannot name him. He
          may not capture a shielded piece, but only because a shielded piece is a defended
          piece, and a King never captures into check.
        </p>

        <h3>The Five Powers</h3>
        <p>
          Every captain takes exactly one, and it is free. It is used <em>instead of moving</em>,
          once in the whole game, and never while your King is in check.
        </p>
        <table>
          <thead>
            <tr>
              <th>Power</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {POWER_ORDER.map((power) => (
              <tr key={power}>
                <td>
                  <strong>{POWER_NAME[power]}</strong>
                </td>
                <td>{POWER_TEXT[power]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Every power that places a piece, Teleport, Relocate and Revive alike, carries one
          further restraint: a piece may not arrive giving check. A king should never be put in danger by something that was, a breath earlier,
          on the far side of the board.
        </p>
        <p>
          Three clocks are kept at this house: 3 | 2, 5 | 5 and 10 | 0, with a fourth table that
          keeps no clock at all, for those who would think all night. Time Manipulation only
          works where a clock is running.
        </p>
        <p>
          A square is “under attack” if any enemy piece could capture upon it, pinned pieces
          included. Since a King guards all eight squares about him, nothing may ever be set down
          beside an enemy King.
        </p>

        <h3>Your Turn</h3>
        <p>
          On your turn you do exactly one of three things: make a legal move, strike a shield, or
          call your King’s power. Then the board settles in order: the captured go to the
          graveyard, poison takes its taker, martyrdom stills its killer, crowns are placed,
          shields are recounted, and the position is judged.
        </p>

        <h3>The Road, and What It Pays</h3>
        <p>
          The road is walked in one sitting. Seven seats, in order, and the first defeat sends
          you back to the taps to begin again. There is no rematch on the road: a seat you have
          sat at is behind you, whichever way it went.
        </p>
        <p>
          What a defeat cannot take is the gold. Every seat pays the moment it falls, and it
          pays whether or not you survive the next one. Carry that gold to the Sorcerer and he
          teaches you an enchantment, and what he teaches is yours forever, through every
          failed walk after it. <em>Knowledge keeps. Progress does not.</em> That is the whole
          trade, and the reason a traveller who has been broken six times is more dangerous
          than one who has been broken once.
        </p>
        <p>
          Two doors open once and never close. Beat the keeper and the back room is yours. Beat
          the princess and your King learns the Divine Call, for until she teaches him he has no
          word to say and simply moves, like everyone else.
        </p>
        <p>
          None of it is required. A good enough player takes the Dragonlord on the first walk
          with an empty book and nothing on the board but ordinary pieces, and the house would
          very much like to see it.
        </p>
        <p>
          At this table, and against a stranger, none of this applies. Every enchantment and
          every power is open from the first move, because a stranger has not earned anything
          off you.
        </p>

        <p className="sign">kept by the house, and honoured at every table</p>
      </div>
      <div className="screen-foot">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
      </div>
    </>
  );
}
