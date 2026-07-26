# Enchanted Chess

Standard chess where each player, before the match, spends a mana budget on enchantments for
individual pieces and picks one power for their King. Both loadouts are shown in full before
White moves.

**The design law is the Open Board: everything is knowable, and the skill is in the answer,
never in the surprise.** No hidden information exists after the match starts. Any mechanic that
only works as a surprise is out of scope by definition.

```
npm install
npm run dev        # http://localhost:5183
npm test           # the rules are the tests
```

## The two games in here

**The road** is the single-player campaign: seven seats from a drunk in a tavern up to the
Dragonlord, each carrying different enchantments. Gold is the only thing that survives a loss,
mana and the enchantments you buy with gold are permanent, and the seats halve their payout
each time you beat them so the road cannot be farmed. Beat the Dragonlord five times and he can
finally say who actually did this to the valley.

**Two captains** is the plain two-player game — every enchantment, ten points, no ladder —
either hotseat or across a WebSocket.

## Layout

| Path | What it is |
|---|---|
| `src/engine/` | The rules. Pure TypeScript, zero DOM, runs unchanged in the browser and in Node. |
| `src/ui/` | React app: board, loadout builder, road, story. |
| `server/` | WebSocket matchmaking and a server-authoritative game loop, importing `src/engine` directly. |
| `scripts/` | Measurement harnesses. See below. |
| `deploy/`, `DEPLOY.md` | Docker image and the AWS path to a live site. |

The engine is the heart, and the split is load-bearing: the server and the browser agree about
the rules because they run the same code, not because two implementations were kept in step.

## The enchantments

| | Cost | Carriers | Effect |
|---|---|---|---|
| **Taunt** | 1 | any but the King | Shielded while defended *and* standing in its own half. An attempt to capture it breaks the shield instead, and costs the attacker their turn. Broken is permanent. |
| **Martyr** | 1 | any but the King | Its killer may not move on its owner's next turn. |
| **Outpost** | 2 | pawn, knight, bishop | Cannot be captured by enemy pawns. |
| **Swift** | 2 | pawn | May double-step on any move, not just its first. Always capturable en passant. |
| **Herald** | 3 | pawn | Promotes on the seventh rank. |
| **Poison** | 4 | pawn | Whoever captures it dies with it. |
| **Immolation** | 4 | pawn | Bought from the Sorcerer; the road only. |

Cost is multiplied by the carrier: pawn ×1, knight/bishop ×2, rook ×3, queen ×4. One
enchantment per piece.

**The King bows to no enchantment.** He can never carry one and never suffers one: no Poison,
no Martyr, and Decree and Destined Death cannot name him. One sentence to teach, and it deletes
a whole class of edge cases.

## Measurement

Balance arguments are settled with numbers, not opinions. Every harness prints what it
measured and what it concluded in its own header.

```bash
npx tsx scripts/balance.ts -n 6 -k 20000    # every seat vs a fixed reference player
npx tsx scripts/ab.ts --seed 40             # A/B two search settings over N games
npx tsx scripts/nps.ts                      # nodes per second
npx tsx scripts/economy.ts                  # gold and mana curves over a run
npx tsx scripts/sprites.ts INNKEEPER        # lint and preview a portrait
```

Use `-k` (node caps) rather than clocks whenever a number has to be comparable across runs:
`budgetMs` is a responsiveness guard, so a busy laptop otherwise reports a weaker opponent and
the ladder looks like it moved when only the machine did.

## Licence

MIT. Piece shapes are drawn here; the pixel portraits are authored as character grids in
`src/ui/portraits.ts` and rasterised at runtime, so no image files ship.
