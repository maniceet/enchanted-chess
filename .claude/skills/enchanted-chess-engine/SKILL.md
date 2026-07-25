---
name: enchanted-chess-engine
description: Architecture map, invariants, and conventions for the Enchanted Chess TypeScript engine and hotseat UI. Use when implementing, debugging, or extending anything in src/engine or src/ui — move generation, enchantments, King powers, perft, board rendering.
---

# Enchanted Chess — engine map

Pure-TS rules engine (`src/engine/`, zero DOM) + React hotseat UI (`src/ui/`). Spec of record:
`.claude/CLAUDE.md`. Rules details: use the `enchanted-chess-rules` skill.

## File map

| File | Holds |
|---|---|
| `engine/types.ts` | `GameState`, `Piece`, `Action` union, `GameStatus`, `isError` |
| `engine/board.ts` | square math, `initialState()`, `random960Back()`, `findKing`, `relativeRank`, `positionKey` |
| `engine/movegen.ts` | `isAttacked`, `inCheck`, `pseudoMoves`, `legalMoves` (pin/checker based), `boardAfter`, `promotionRankOf` |
| `engine/apply.ts` | `makeMove` (no validation), `applyAction` (validated + status), `legalActions`, clock charging, `flag` |
| `engine/fen.ts` | `parseFen`/`toFen` (vanilla FEN, incl. Shredder castling letters), `serialize`/`deserialize` (lossless JSON) |
| `engine/notation.ts` | `toSan` — SAN plus `⚡` power / `⊘` shield-break forms |
| `engine/powers.ts` | `powerActions`, `powerUnavailableReason`, `REVIVE_COST` |
| `engine/loadout.ts` | budget maths, `validateLoadout`, `applyLoadout`, rules copy for the UI |
| `engine/ai.ts` | evaluation, `HOUSE` profiles, `CAMPAIGN`, `raiseDragons`, `armorArmy`, `innkeeperLoadout` |
| `engine/search.ts` | the search: Zobrist hash, transposition table, killers/history, null-move, LMR, check extensions (off), SEE pruning + ordering, aspiration, quiescence, `maxNodes` |
| `engine/clock.ts` | `TIME_CONTROLS` (3+2, 5+5, 10+0), `newClock`, `formatClock`, Time Manipulation payouts |
| `engine/perft.ts` + `perft.test.ts` · `rules.test.ts` + `testkit.ts` | node counts vs published numbers · every named ruling |
| `ui/App.tsx` | phase router (home/story/online/house/rules/chest/shop/mode/build-w/build-b/reveal/game), history stack, power aiming, clocks, localStorage, export |
| `ui/Loadout.tsx`, `ui/Rules.tsx`, `ui/StatsPage.tsx` | sorting-chest builder, parchment rules letter, tally page (built, not linked from home yet) |
| `ui/Board.tsx`, `ui/Pieces.tsx` | 8×8 button grid; vector Staunton pieces (45×45 viewBox, CSS-variable fills) + runes + shield/frozen overlays |
| `ui/think.ts`, `ui/aiWorker.ts` | the house search on a worker thread, with an inline fallback |
| `ui/banter.ts`, `ui/portraits.ts`, `ui/pixel.ts` | per-character dialogue, character portraits, sprite rasteriser |
| `ui/run.ts`, `ui/Shop.tsx`, `ui/story.ts` | the roguelike run: gold, purses, prices, permanent unlocks · the Sorcerer's shop · story cards |
| `ui/sound.ts`, `ui/stats.ts`, `ui/styles.css` | synthesized WebAudio cues incl. the illegal-move buzz · balance tallies · theme |

## Invariants — do not break these

- **Engine is pure.** No `window`, `document`, `localStorage`, `Date.now()` inside `src/engine`. It
  must run unchanged in Node (tests today, server in v2).
- **State is immutable.** Every function returns a new `GameState`; `Piece` objects are replaced,
  never mutated. `makeMove` copies the board with `.slice()`.
- **Pieces carry stable `id`s.** Frozen markers and enchantment bookkeeping key off `piece.id`,
  never off a square.
- **Shield state is derived** from live defense **+ the half rule** (`inOwnHalf`) + a persistent
  `shieldBroken` flag. Never store "is shielded" as an independent boolean. One consequence to
  keep in mind before "restoring" anything: because a shielded piece is always in the attacker's
  enemy half, an attacker's own Taunt is never live where it strikes, so there is deliberately
  **no** Taunt-ignores-Taunt branch in `captureBlockedByShield` or `shieldBreakActions` (T6).
- **Squares:** index `= rank * 8 + file`; index 0 = a1, 63 = h8. `fileOf`/`rankOf`/`sq` only.
- **Castling rights are rook origin *files***, not booleans — that is what makes Chess960 free.
  `null` = right lost.
- **Freeze expiry is in plies.** A capture at `state.ply = P` freezes the capturer with
  `untilPly = P + 3` (its next turn is `P + 2`). Decree at ply `P` → `untilPly = P + 2`.
  `isFrozen` is `untilPly > state.ply`.
- **Clocks live in state, time is measured in the UI.** Turn-consuming actions carry
  `spentMs`; `endTurn` deducts it and pays `control.incrementMs + bonusIncrementMs`. The
  action log therefore replays the clocks exactly. `{type:'flag'}` ends the game on time.
- **Stalemate = no legal *action*.** An unused power or an available shield-break keeps the
  game alive; checkmate is still decided by moves alone, since neither is legal in check.
- **Pieces are vector, not pixel art.** Classic Staunton silhouettes in a 45×45 viewBox; fills
  come from `--pc-fill` / `--pc-line` / `--pc-detail`, so an enchantment retints by class and
  never touches the shape. (An earlier pixel-sprite set was cut on the owner's call.)
- **Taunt has three faces, and the UI must show all three**: defended *and home* → intact shield
  rune plus a glow (the Taunt is in force); undefended **or past the middle** → the same rune
  drawn **cracked** (not in force); `shieldBroken` → no rune, no tint, plain piece — a spent
  Taunt is an ordinary piece. The tooltip distinguishes "down (undefended)" from "asleep (in
  enemy ground)", since the two look the same but are fixed differently.
- **Every state builder seeds `repetition`** with its own `positionKey` — `initialState`,
  `parseFen` and the testkit — so the starting position counts as occurrence one under FIDE
  threefold. Any new way of constructing a `GameState` must do the same.
- `makeMove` assumes legality and skips repetition/status — perft depends on that. Only
  `applyAction` validates and settles.

## Strength is measured in nodes, not milliseconds

`budgetMs` is a **responsiveness** guard; `maxNodes` is the strength setting. A time budget
makes a seat as strong as the device it runs on — the same 3500 ms buys the Dragonlord several
times the tree on a desktop that it does on a phone, so two players face two different
opponents under one name. Every `HOUSE` profile therefore carries both, and whichever bites
first ends the search.

The same rule applies to tests: anything asserting *which move* comes back must use `maxNodes`
and a seeded `rng`, never `budgetMs`. A clock-bounded assertion fails when the laptop is busy
and passes when it is not, which is worse than having no test, because it teaches you to
ignore the suite.

## SEE bails out on magic, deliberately

`Searcher.see` plays a swap-off on the target square and returns the net material, and
quiescence uses it to skip captures that lose the exchange. It returns **`null`** whenever any
piece in the exchange carries an enchantment, and callers must then prune nothing.

That is not caution for its own sake. A Poison victim kills its taker, a Martyr victim freezes
it, a shield turns a capture into something that is not a capture, and Outpost decides whether
a pawn may take at all — none of it is material arithmetic, and a SEE that guessed would prune
real moves. Enchanted pieces are rare (four points buys few), so the bail-out costs almost
nothing. `see.test.ts` guards both directions: that winning captures survive the filter, and
that enchanted exchanges are left to the search.

## Prove search changes, do not assume them

`scripts/ab.ts` plays one configuration of the engine against another — identical node budgets,
colours alternated, a spread of enchanted loadouts — and reports a score with two standard
errors. Any search tweak (extensions, pruning, ordering, eval weights) goes through it before
it is called an improvement. A mate suite only shows whether the engine can find a mate it was
always going to find; head-to-head shows whether the change wins games.

### Measured so far

| Change | Method | Result | Shipped? |
|---|---|---|---|
| Check extension (one ply when in check, bounded at 2× nominal depth) | `ab.ts -n 60 -k 20000` | **45.8% ± 12.9** — inside the noise, point estimate below even. A 6-position forced-mate suite also showed no difference (5/6 with it on *and* off, at every budget 6k–120k). | **No.** Kept behind `checkExtension`, default off. Do not enable without a number. |
| Rank-scaled passed pawns, replacing a flat +22 whose blocking test also wrongly counted enemy pawns *behind* the pawn | `ab.ts -n 100 -k 20000`, plus three targeted passer endgames | **49.5% ± 10.0** — dead even, and both versions push the passer in the targeted positions. The stated reason for the change ("the engine has no reason to push a passer") was simply **wrong**: the pawn PST already rewards advancement. | **Yes**, but only because the frontier test is a correctness fix. The rank curve itself is unproven and measured neutral. |
| Static exchange evaluation in **capture ordering** | `ab.ts -n 100 -k 20000`, then time-to-depth over 4 positions | **48.5% ± 10.0** per node, and **8.7–43.7% slower** to the same depth in every position tested. `order` runs at every node and each call copied the board and walked every capture's attackers. | **No.** Ordering stays MVV-LVA. |
| Static exchange evaluation in **quiescence only** | time-to-depth over 4 positions, then `ab.ts -n 100 -k 20000` and `-n 40 -t 120` | **17–29% faster** to the same depth — and still **48.5% ± 10.0** per node and **36.3% ± 15.8** per millisecond. Faster and no stronger, which points at the pruning itself being wrong: `see` lets every attacker `attackersOf` reports recapture, but **pinned** pieces cannot legally take and a **king** cannot take into a defended square. Both inflate the defence, so winning captures read as losing and get pruned. | **No.** Behind `seePruning`, default off. Fixing it needs pin detection inside the exchange loop, which costs more than the pruning saves at these depths. |
| Carrying the transposition table between moves (shipped path) | depth reached over 24-ply sequences at equal node caps | **+2.0% / 0.0% / +3.4%** depth for wit / ardax / kyrax. Small, non-negative, free. | **Yes** — mainly because it makes shipped behaviour match every measurement, which previously assumed a warm table the game never had. |
| Teaching seats evaluate material **+ piece-square tables + a stay-home king term**, instead of material alone | move-quality probe over 4 games × 3 seats, then `balance.ts` | Material alone produced `f3 g3 Ng8 Bg5 a3 Ra2 Kd2` — knight oscillation and a wandering king, which reads as a broken engine rather than a weak one. With squares and a king term: `d4 Nc3 e4 Bc4 Bb3 Bf4 e5 exf6 Qd2 dxe5`. Still 4-0-0 losses to the reference hero at 4 ms p50. | **Yes.** |

**Speed is not strength.** SEE-in-quiescence was unambiguously faster to a given depth and
still did not win more games, because it was pruning the wrong moves. A performance win only
matters if the thing you sped up was correct; measure the games, not the milliseconds.

**Pick the budget that can see your change.** `-k` (nodes) is load-independent and right for
anything that changes *what* the search looks at. `-t` (milliseconds) is right for anything that
changes what a node *costs* — pruning, ordering, evaluation weight — because a node budget is
structurally blind to that trade. SEE is the case in point: node-budgeted it read 48.5% and
looked like a dud, while the real question was entirely about speed, and the answer differed by
sign depending on *where* the pruning was applied.

Three traps this table records, all hit in practice: **a metric can disagree with your eyes and
be the thing that is wrong** (a king-move count said the improved seat was worse; reading the
actual move lists said the opposite, and the count was measuring tie-breaking noise); **a
neutral A/B does not always mean "no effect"** — it can mean the harness never reaches the
positions where the term applies, which is what 101-ply average games with 51% draws were doing
to the passed-pawn test; and **one position is not a measurement** — a single time-to-depth
reading said SEE-in-ordering was 12% *faster*, and four positions said it was 9–44% slower.
Say which trap you are in before acting on a number.

Two lessons worth keeping: a mate suite saturates and stops discriminating almost immediately,
so it is a smoke test rather than a measurement; and a 60-game sample at equal strength draws
so often (37/60 there) that its resolution is about ±13%, which will not detect anything
smaller than a large change. Budget games accordingly.

`scripts/balance.ts` is the other half: every seat on the road against one fixed reference
player, reporting win/draw/loss and think-time percentiles per seat. `-k N` gives every seat
the same node cap for a fast comparative run; without it the seats play exactly as they ship.

## Commands

```bash
npm run dev            # Vite dev server (hotseat UI)
npm test               # vitest run — perft + rulings
npx tsc --noEmit -p tsconfig.json

npx tsx scripts/balance.ts -n 4          # every seat vs the reference player, as shipped
npx tsx scripts/balance.ts -n 6 -k 20000 # equal node caps: fast, load-independent
npx tsx scripts/ab.ts -n 60 -k 20000     # A/B a search change, head to head
```

## Perft status

Green: start depth 1–5 (4,865,609), kiwipete 1–4, endgame 1–5, promotion position 1–4,
position 5 1–4, plus the classic layout parsed as a 960 position with file-based castling
rights (`w HAha`). Any move-generation change must keep these passing — run them first when a
rules bug is suspected. Bisect mismatches with `perftDivide`.

**68 tests total**: 23 perft + 45 rulings, the latter covering T1–T4, M1–M2, King Immunity,
all five powers, clocks/Time Manipulation/flag, 960 castling edge cases (off-centre king,
castle where the king does not move, castling through attack, blocked rook destination),
fifty-move and threefold, and the §7 acceptance check that an exported log replays to a
byte-identical state.

## Beyond the spec (owner's later calls)

- **Fifth King power — Time Manipulation (`chrono`)**: with an increment it buys +1 s on every
  remaining move; in 10 | 0 it buys a flat +30 s. Unusable without a clock.
- **Three time controls**: 3 | 2, 5 | 5, 10 | 0, plus untimed for scenario work.
- **Teleport and Relocate may not deliver check.** A piece may not arrive on a square that
  checks the enemy king. Enforced in `powerActions`, not at apply time.
- **Legality is decided from one picture of the king**, not by playing each move on a copy of
  the board: `pictureOf` finds the checkers and the pinned pieces with their lines, and
  `legalMoves` filters against that. A pinned piece may move **anywhere along its line, both
  towards the king and out towards the pinner**, which is the one thing easy to get wrong. En
  passant still goes the honest way, because it can expose a king along a rank that no pin test
  sees. Any change here must keep perft green: it is the only thing standing between this and
  silently illegal chess.
- **The house engine** (`engine/ai.ts` + `engine/search.ts`) plays Black whenever `setup.opponent !== 'table'`.
  - Evaluation is centipawn material + piece-square tables + **enchantment values**: a live
    Taunt shield is worth ~90, Poison ~140 (nothing wants to take it), a Herald pawn scales
    with how close it is to the seventh rank. Frozen pieces are discounted; an unspent King
    power is worth ~30.
  - Search is negamax with alpha-beta, MVV-LVA ordering, **quiescence** on captures, and
    iterative deepening under `budgetMs`. Weak seats keep the old random sample and the flat
    material count, which is what makes them miss things.
  - Powers are offered at the root only (sampled to 6) and only spent when they beat the best
    ordinary move by `POWER_MARGIN`. Seed `rng` (and omit `budgetMs`) for determinism.
- **The campaign is a roguelike run.** `CAMPAIGN` in `ai.ts` is the ladder (drunkard →
  innkeeper → rolain → wit → armored → ardax → kyrax); `ui/run.ts` owns the economy and is the
  only place that writes it. The road is always untimed; clocks belong to two people at one
  table. The model, which every new screen must respect:
  - **A run is one unbroken walk.** Any defeat or draw calls `loseRun`, empties `progress`, and
    puts the player back at the inn. There is deliberately **no rematch button on the road** —
    replaying a lost seat would make the whole economy meaningless.
  - **Gold is paid per seat, at the moment it falls** (`PURSE`), and survives the run's death.
    Enchantments bought from the Sorcerer (`PRICE`, `learn`) are permanent. That asymmetry —
    knowledge persists, progress does not — is the entire design.
  - **Two permanent gates.** Beating the Innkeeper opens the Sorcerer (`sorcerer`); beating
    Rolain grants the Divine Call (`divineCall`). Before Rolain, the traveller's King has **no**
    power: `startingState` calls `silenceKing`, which marks the power already used, so
    `powerActions` returns nothing and mate detection is untouched.
  - **Clearing with an empty book must stay possible.** Never gate a seat behind an
    enchantment purchase.
  - **The board style is the run's, not the duel's.** `run.mode` is chosen once at "Set out on
    the road" and holds to the end; a 960 walk still deals a fresh back rank at every table.
    Asking per seat meant seven identical full-screen decisions per attempt, in a mode built
    around repeating the ladder.
  - **Clearing the road ends the attempt, so the epilogue routes to the *inn*, not the road.**
    `STORY[seat].after` sends you back to the ladder for every seat but the last; the last one
    has no ladder left to stand on. Getting this wrong put the player on a road they had just
    finished, every seat marked beaten and still clickable (each would deal a fresh duel outside
    any run), under a counter reading "seat 8/7". An effect also redirects `house → home`
    whenever `!run.active`, so nothing can strand anyone there again.
  - **Never restart a duel that is already under way.** On the road the live duel *is* the
    attempt, so silently dealing a new game throws the run away. The home screen promotes it to
    the primary action ("Back to the table") whenever `state.status.kind === 'ongoing'` and the
    opponent is a House, and the seat's own card on the road resumes rather than rebuilds and
    is tagged "at this table". Any new path into a game must check for a live one first.
  - **Skip screens with no decision in them.** A traveller with an empty book and no Divine Call
    has nothing to do in the loadout builder — 0/4 points, every row greyed, the King silent —
    so `beginBuild` jumps straight to the reveal. Any new pre-game screen should ask the same
    question of itself.
  - **`beginBuild` takes `overrides` for a reason.** The road calls it from a story card's
    callback, and that callback was created during the render where the seat was clicked, before
    `setSetup` landed. Reading `setup` inside it sees the *previous* seat's settings — which is
    how a road duel once handed the Drunken Knight Time Manipulation in a game with no clock.
    Pass what you know; do not read state a closure captured earlier.
  - **Run flags are re-derived in `startingState`, not trusted.** `boon` and `silentKing` only
    apply when the opponent is a House, decided at the one place that builds a board. Clearing
    them at each call site was tried first and was not enough: it relies on every future entry
    point remembering, which is precisely how this family of bug kept recurring. `runFlags.test.ts`
    pins it. Call sites still clear them, but that is now belt and braces rather than the
    mechanism.
  - **Run flags must be cleared when leaving the road.** `boon` and `silentKing` live on
    `setup`, which is *reused* between games, and both the online effect and `beginBuild`
    spread the previous setup. Without clearing them, an online match or a hotseat duel played
    after a campaign duel inherited the silenced King and told the player to go and beat
    Princess Rolain. Anything added to `Setup` that describes a *run* rather than a *game* needs
    the same treatment in both places.
  - **Online and hotseat ignore all of it.** `LoadoutBuilder` only receives `book`/`powers`
    when the opponent is a House; a stranger has not earned anything off you.
  - The one defeat that does not end a run is the first fall at Kyrax's table, where Rolain
    lends her dragon (`lendDragon`, `dragonUsedThisRun`). Once per lifetime.
- **The transposition table lives in `ui/seatTable.ts`, not in the message.** A
  `TranspositionTable` is not structured-cloneable, so it cannot ride to the worker in a
  `postMessage`. It therefore sits in module scope on whichever side is searching, and *both*
  `aiWorker.ts` and the inline fallback in `think.ts` go through `withSeatTable` — so the two
  paths cannot drift into being different opponents. It is reset whenever the seat changes,
  because entries are hash-verified against the *position* but not against the *evaluation*,
  and the teaching seats score with `positional` while the deep ones use `evaluate`.
  Before this, the shipped game rebuilt its table from nothing on every move while every
  harness in `scripts/` carried one across turns — measured and shipped strength were quietly
  different things. Worth +0–3% depth at equal nodes, which is small; the reason to keep it is
  that the numbers now describe the game people actually play.
- **The house thinks off the main thread.** `ui/think.ts` posts the state to `aiWorker.ts` and
  awaits a choice. If the worker is missing, errors, or does not answer within its budget plus
  a grace period, the same `chooseAction` runs inline. A dead thread must never cost a move,
  so never remove that fallback.
- **A seat with a forced power must be able to afford it.** `innkeeperLoadout` holds back
  `REVIVE_RESERVE` (3, enough for a knight or bishop) *before* it starts spending when
  `options.power === 'revive'`. It used to spend the whole budget first and then silently
  downgrade an unaffordable Revive to Teleport — which meant Prince Ardax, the necromancer,
  never once raised the dead, while his story card, his road blurb and his reveal all promised
  he would. `seats.test.ts` guards it. Any future forced power with a cost needs the same
  treatment, and the silent fallback should stay only for *randomly drawn* powers.
- **Armour** (`armorArmy`) gives every non-King piece that carries nothing else a Taunt, so a
  defended piece costs an attacker a whole turn to strip. It is a profile quirk, not a loadout
  option, and like the dragons it deliberately ignores the four point budget.
  **It must appear on the reveal screen.** Anything strapped on after the loadout — armour,
  dragons, Rolain's lent dragon — is invisible to `loadoutSummary`, which only lists what was
  bought. Leaving it off makes the single most important fact about an opponent a surprise, and
  the Open Board forbids surprises. Every future profile quirk needs its own reveal note.
- **Dragons** are piece type `'d'`: knight's leap plus bishop's diagonal, worth ~720. Any new
  code that switches on `PieceType` must handle it, and `isAttacked`/`attackersOf` must count
  a dragon on **both** its lines or king safety silently breaks. `raiseDragons` swaps a rider's
  knights for dragons and may shield them; bosses deliberately break the four point budget.
- **The inn is the home screen**: title, purse strip (gold · attempt · deepest · clears), then
  Set out / The Sorcerer (once open) / Duel at this table / Duel another traveller / Sorting
  Chest / Rules. Stats are still recorded and `StatsPage` still exists, but nothing links to it.
- **Shop chrome is its own visual language** (`.shop-*` in `styles.css`), taken from arcade
  roguelike shops: 4px near-black outline, a 3-4px cream inner rule, a saturated maroon fill,
  and price tags that hang off the bottom edge of the card they belong to. Tile colour carries
  the state — gold means affordable, green means learned, red price means too dear. Do not
  soften these into the tavern panel style; the contrast is the point.

## Build order (spec §6)

M1 engine ✅ · M2 hotseat UI ✅ · M3 loadout builder + reveal ✅ · M4 playtest tooling ✅
(undo, export, paste-in scenario loader, resign/draw, rematch same-loadouts or re-edit).
M5 online untouched.

## Open ruling flagged to the owner

A frozen piece **may** shield-break (nothing moves, and M1 restricts movement only). Flip
`shieldBreakActions` in `movegen.ts` if the owner decides otherwise.
