# ENCHANTED CHESS — Game Specification v1.1

**Handoff document for implementation. Target: TypeScript web app (no game engine). v1 is a local hotseat playtest build; online multiplayer is a later milestone.**

This is the single source of truth. Where anything conflicts with earlier design notes, this document wins.

---

## 1. Product summary

Standard chess (Classic or Chess960 start) where each player, before the match, spends a **4-point enchantment budget** on their pieces and picks one **King power**. Both loadouts are fully revealed at match start. From move one, the game is deterministic, perfect-information chess with six enchantments and four powers layered on.

**Design law — The Open Board:** everything is knowable; the skill is in the response, never in the surprise. No hidden information exists after match start. Any future mechanic that only works as a surprise is out of scope by definition.

- **Platform:** Web only. Plain TypeScript app — no Godot, no game engine. A board game does not need one.
- **v1 (playtest build):** local hotseat — one browser, both players at one keyboard/mouse (the designer playing both sides). No accounts, no server, no networking.
- **v2 (online):** guest/signup accounts, matchmaking, server-authoritative multiplayer. Architecture below is designed so v1's rules engine is reused unchanged.
- **Out of scope entirely for now:** Elo/ranking, AI opponents, spectating, chat, mobile apps, monetization (game is free).

---

## 2. Game rules

### 2.1 Base game

Standard FIDE chess rules, with these deltas:

| Rule | Status |
|---|---|
| Check / checkmate / stalemate | Unchanged |
| Castling | **Kept** (standard rules; Chess960 castling in 960 mode) |
| En passant | Unchanged — and applies to **every** Swift double-step (§2.3) |
| Promotion | Unchanged (rank 8; Herald promotes at rank 7, §2.3) |
| Fifty-move rule / threefold repetition | Unchanged, draws |
| Resignation / draw offers | Standard |

Both players always start with identical, full standard material. The **only** asymmetry between players is their enchantment loadout and King power choice.

### 2.2 Loadout phase (pre-match)

1. Select mode: **Classic** or **960**. (960: generate the start position first, same for both sides, then configure loadouts.)
2. Each player configures a loadout: assign enchantments to specific pieces (by starting square) within a **4-point budget**, and choose exactly one King power. In hotseat v1, players configure one after the other on the same screen.
3. **Both loadouts are revealed on a summary screen** before White's first move. (Hotseat note: both players saw everything anyway; keep the reveal screen regardless — it's the Open Board contract and it's needed for v2.)

Budget rules:

- **Total budget: 4 points.**
- **One enchantment per piece, maximum.**
- Cost = enchantment base cost × carrier multiplier.
- Unspent points are only useful if the King power is Revive (§2.4). Otherwise they are simply unspent.

| Carrier | Multiplier |
|---|---|
| Pawn | ×1 |
| Knight / Bishop | ×2 |
| Rook | ×3 |
| Queen | ×4 |

### 2.3 The six enchantments

All enchantments are **static, always-on, permanent, and public**. They die with the piece and never transfer.

| # | Name | Base cost | Legal carriers (by budget math) | Effect |
|---|---|---|---|---|
| 1 | **Taunt** | 1 | any piece except King | While this piece is defended by at least one friendly piece **and stands in its owner's own half (ranks 1–4 from its side)**, it has a **shield**. An enemy capture attempt on a shielded piece **breaks the shield instead of capturing**: the shield is destroyed, the attacking piece does not move, and the attacker's turn is spent. Once the shield is broken (or whenever the piece is undefended, or whenever it stands in the enemy half), it may be captured normally. **No attacker exception:** an enemy piece carrying Taunt does *not* ignore the shield — see T6. *(The King needs no exception either: a shielded piece is by definition defended, and a King capturing a defended piece is capturing into check — already illegal. Taunt is King-proof for free.)* |
| 2 | **Martyr** | 1 | any piece except King | When this piece is captured, the capturing piece **may not move on its owner's next turn**. Does not affect a capturing King (§2.4a). |
| 3 | **Outpost** | 2 | pawn, knight, bishop | This piece **cannot be captured by enemy pawns**. |
| 4 | **Swift** | 2 | pawn only | May move two squares forward on **any** move, not just its first. Each double-step is capturable en passant. |
| 5 | **Herald** | 3 | pawn only | Promotes upon reaching the **seventh rank** (from its owner's perspective) instead of the eighth. Normal promotion choice applies. |
| 6 | **Poison** | 4 | pawn only | When this piece is captured, the capturing piece is **also removed from the board**. Does not affect a capturing King (§2.4a). |

Taunt shield rulings (implement exactly):

- **T1.** Shield state is derived, live: shielded ⟺ defended by ≥1 friendly piece **and** in own half. The moment the last defender is removed, the shield is inactive; if a defender returns, it is active again — **unless it has been broken**. A broken shield is gone permanently. (Pins do not remove defense; only removal does.)
- **T5 (half rule).** Taunt only shields in its owner's own half: ranks 1–4 counted from that player's side, the same half Relocate and Revive use. A shielded piece that crosses the middle loses its shield for as long as it stands on enemy ground, and regains it on returning (a broken shield stays broken either way). Taunt defends ground; it does not carry armour into an attack.
- **T6 (no attacker exception).** An attacker carrying Taunt gets no special treatment against a shield. This follows from T5 rather than being an extra rule: a shielded piece stands in its owner's half, which is the attacker's *enemy* half, so the square being struck is always ground where the attacker's own Taunt is asleep. The old "Taunt ignores Taunt" clause is therefore unreachable and is deleted from the engine, not merely left unused. Every piece but a King breaks shields the same way.
- **T2.** Breaking a shield is **not a capture**. It does not trigger Poison or Martyr, does not reset the fifty-move counter, and the attacker does not move.
- **T3.** Shield interaction with check: a shielded piece giving check cannot be removed in one move, so the legal responses to that check are only: **move the king or block**. The King can never capture the shielded checker — shielded means defended, and that capture is into check. Legal-move generation and checkmate detection must reflect this.
- **T4.** A shield-break does **not** resolve check, so it is **illegal while your King is in check** — the same principle as any move that leaves your King attacked.

Martyr rulings:

- **M1.** A frozen piece may not move, but it still **attacks and defends its squares** — it gives check, blocks king moves, and defends friends as normal. It is as if placed there; it just can't move. Freezing restricts movement only.
- **M2.** If the frozen piece's owner has no legal moves at all as a result, standard stalemate/checkmate rules apply.

### 2.4 King powers

Every player **must** choose exactly one power at loadout. Powers are free (no budget cost) except Revive's reserve requirement. All powers are public. **All powers are once per game — including Revive.**

**Activation:** on your turn, **instead of moving**, activate the power. It consumes the full turn.

**Global restriction: a power may not be activated while your King is in check.**

#### 2.4a King Immunity (the hidden fifth power)

> **The King is immune to all enchantments — both carrying and suffering them.**

- The King can never be enchanted.
- The King is **immune to Poison**: capturing a Poison pawn does not remove the King.
- The King is **immune to Martyr**: capturing a Martyr piece does not freeze the King.
- **Decree cannot target the King** (it already couldn't; same principle).
- Outpost is unaffected by this rule (it restricts pawns, not Kings — a King captures an Outpost piece normally).
- **Taunt needs no King clause.** A shielded piece is by definition defended, and a King capturing a defended piece is capturing into check — already illegal under standard rules. The immunity principle holds conceptually, but the engine implements nothing for it.

One sentence to teach, and it removes an entire class of edge cases (e.g., "King captures Poison pawn and dies" no longer needs an illegal-move rule). Present it in the UI as part of the King's identity: *"The King bows to no enchantment."*

#### The four powers

| Power | Effect |
|---|---|
| **Teleport** | Move one of your pieces to any empty square that is **not under attack** by any enemy piece. **A pawn may not land on the rank it would crown on, or past it** (rank 8 normally, rank 7 for a Herald): teleport is a move, not a promotion, so a pawn set down there would never crown and would have no legal move for the rest of the game. Allowing it to crown instead would make Teleport a free queen and dwarf every other power. |
| **Relocate** | Your King swaps squares with any friendly piece in your own half (ranks 1–4 from your side). The swap may not leave your King in check. |
| **Decree** | Name one enemy piece (not the King). It may not move on your opponent's next turn (M1 semantics: it still attacks and defends). |
| **Revive** | Return one piece **from your graveyard** to any empty square **in your own half** that is **not under attack**. Costs reserved enchantment points equal to the piece's value: pawn 1, knight/bishop 3. Rook (5) and queen (9) are unaffordable with a 4-point budget — excluded automatically. A revived piece returns **without** any enchantment it carried. A revived pawn is treated as having moved (no double-step). **Once per game**, like every power. |

"Under attack" definition (used by Teleport and Revive): a square an enemy piece could capture on, using the same rule that governs king-move legality. Pinned enemy pieces still attack squares. Emergent consequence: since the enemy King attacks all 8 adjacent squares, Teleport/Revive can never place a piece next to the enemy King.

Revive economy:

- To use Revive, the player must leave points unspent at loadout. The UI shows each King's remaining reserve on hover/tap at all times.
- If the graveyard has no affordable piece, Revive cannot be activated (button disabled with reason).
- Unspent reserve has no other use.

### 2.5 Turn flow

```
On player's turn, exactly one of:
  a) A legal chess move (incl. castling, en passant, promotion)
  b) A shield-break "capture attempt" on a shielded enemy piece  (T2: not a capture, attacker stays)
  c) Activate King power (if unused, not in check, and preconditions met)
Then resolve, in order:
  1. Remove captured piece → graveyard
  2. Poison: remove capturing piece (unless it is a King) → graveyard
  3. Martyr: mark capturing piece (unless it is a King) frozen until end of its owner's next turn
  4. Herald / standard promotion if applicable
  5. Recompute all shield states (derived)
  6. Check / checkmate / stalemate / draw evaluation
```

Checkmate evaluation must account for: shield-protected checking pieces (T3/T4), King Immunity (a King may escape check by safely capturing an **undefended** Poison or Martyr checker adjacent to it), frozen pieces (M1/M2), and the power-in-check restriction (powers are never an escape from check, so they never affect mate detection).

### 2.6 Timing

- v1 hotseat: **no clocks**. Playtesting wants unlimited thinking time. Build the clock UI stub but leave it off.
- v2 online default: 10 minutes per side, no increment. Flag = loss on time (standard rules).

---

## 3. Technical architecture

### 3.1 Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** everywhere | One language for engine, UI, and the future server. |
| Rules engine | **Pure TS package, zero DOM/browser dependencies** (`engine/`) | This is the heart. `applyAction(state, action) → newState | error`, `legalActions(state)`, `evaluate(state) → ongoing/checkmate/stalemate/draw`. Immutable state in/out. It must run in browser AND Node unchanged — in v1 the browser calls it directly; in v2 the server imports the same package as the source of truth. |
| UI | **Plain DOM/SVG (or canvas) + minimal tooling — e.g. Vite. No framework required; React acceptable if it speeds development.** | A chessboard is a grid of divs/SVG squares. Enchantment overlays are SVG/CSS effects. No game engine, no scene graph. |
| State/persistence (v1) | In-memory game state; serialize to JSON in `localStorage` for "resume last game"; "export game" button downloads the action log as JSON for later analysis. | The action-log format doubles as your test-fixture and replay format. |
| v2 additions (design for, don't build) | Node server importing `engine/`; WebSocket transport; Postgres + JWT auth; guest IDs in localStorage. | Because the engine is a pure shared package, v2 is transport + auth work, not rules work. |

**Do not use an off-the-shelf chess library as-is.** Taunt, Martyr, King Immunity, and the powers change legal-move generation and checkmate detection at the core. Write the engine clean, and validate its vanilla-chess subset against published **perft** numbers (depths 1–5) for both the standard start and a sample of 960 positions.

### 3.2 Engine model notes

- **State:** extended-FEN-style serializable object: piece placement, per-piece enchantment + shield status (unbroken/broken), frozen markers with expiry, per-player power + used flag + reserve, graveyards, castling/en-passant rights, move clocks, action log.
- **Actions:** `{type: 'move', from, to, promo?}` · `{type: 'shieldBreak', from, target}` · `{type: 'power', power, args}` · `resign` · `drawOffer/accept`.
- Shield state is **derived** (recomputed from defense after every action) with a persistent `broken` flag — never stored as an independent boolean that can drift.
- Every ruling in §2.3–2.5 becomes a named unit test before any UI exists.

### 3.3 v1 hotseat specifics

- Both players on one screen; the board does **not** flip by default (playtesting is easier from one orientation; add a manual flip button).
- Loadout builder runs twice (White configures, then Black) on the same device, followed by the reveal/summary screen.
- An **undo button** exists in v1 (it's a playtest tool — full action-log makes it trivial). It is removed, not hidden, in v2 online play.
- A **board editor / scenario loader** (paste a serialized state, continue playing from it) is strongly recommended — it turns every balance question into a 30-second experiment. This is the single highest-value playtest feature.

---

## 4. Screens & flows (v1)

```
Home (Play · Rules)
  → Mode select (Classic | 960)
    → Loadout builder — White  →  Loadout builder — Black
      → Reveal screen (both loadouts side by side, continue button)
        → Game board  →  Game over (result + reason, rematch [same loadouts | re-edit], export log, home)
```

**Loadout builder** — board diagram of that side's starting position; click a piece → list of legal enchantments with computed cost (illegal/unaffordable ones shown greyed with the reason); running budget "3/4 used · 1 reserved"; King click → power picker (4 cards, one-line effect each; Revive card shows live reserve requirement). Live validation; Continue disabled until legal. King card also states the immunity rule.

**Game board** — enchantment visuals per §5; graveyards both sides; power button beside each King (greyed with reason when unusable: "used", "in check", "no affordable piece"); selecting a piece highlights legal destinations, with **shield-break destinations rendered distinctly** (hammer icon, not a capture ring); promotion picker; last-action highlight; move list in algebraic notation extended with `⚡` (power) and `⊘` (shield-break) annotations; undo; export log.

### UI requirements (non-negotiable)

Visual clarity is the top execution risk. A player calculates several moves deep while tracking six possible properties across 32 pieces.

- Each enchantment: **distinct, silhouette-level visual** readable without hover at small board size. Taunt = metallic sheen with an explicit shield overlay that visibly deactivates the instant the last defender is gone, and shows visibly broken once spent.
- Render **consequences, not causes**: live shielded/unshielded state; frozen pieces show chains + "1 turn"; Outpost pieces show a plinth and suppress pawn-capture highlights against them.
- Hover/tap any enchanted piece → exact rules text. Hover King → power, used/unused, reserve, and the immunity line.
- All states legible at 400px board width. If it isn't legible small, redesign it.

---

## 5. Assets (v1, deliberately tiny)

Board (one theme), flat SVG piece set (open-licensed chess sets exist — e.g. Lichess's), 6 enchantment overlays + broken-shield + frozen states as CSS/SVG effects, 4 power icons, minimal SFX optional. No animations beyond simple CSS transitions.

---

## 6. Build order

1. **M1 — Engine (pure TS, no UI):** vanilla chess + perft validation → enchantments, powers, King Immunity, rulings T1–T3, M1–M2 → full test suite (§7).
2. **M2 — Hotseat board UI:** play a full game in the browser against yourself with all visuals of §4.
3. **M3 — Loadout builder + reveal + budget validation.** End-to-end playable playtest build. **Ship this to yourself and playtest before building anything else.**
4. **M4 — Playtest tooling:** undo, export/import log, scenario loader.
5. **M5 (later, after design is validated) — Online:** Node server importing the engine, WebSockets, guest/signup, matchmaking, clocks, reconnect, deploy.

## 7. Test plan (acceptance)

**Engine tests (automated, written in M1):**
- Perft depths 1–5 match published numbers with zero enchantments (Classic + sampled 960 positions).
- Named scenario tests for every ruling: T1 (defender leaves/returns; broken stays broken) · T5 (shield sleeps past the middle and wakes on return; a defended Taunt piece in the enemy half is captured normally) · T6 (a Taunted attacker still cannot capture a shielded piece, and is offered the shield-break instead) · T2 (no Poison/Martyr trigger on break; fifty-move counter untouched; attacker doesn't move) · T3 (mate detection with shielded checker; King capture of shielded piece is illegal as capture-into-check) · T4 (shield-break illegal while in check) · King Immunity (King captures undefended Poison pawn and survives; King captures undefended Martyr piece and is not frozen) · M1 (frozen piece still gives check and defends) · M2 (stalemate via freeze) · Decree cannot target King · Teleport can never land adjacent to enemy King (emergent) · Teleport offers a pawn no square on its crowning rank or beyond (a Herald is barred from rank 7 and 8 alike), while a knight may still land on rank 8 · Revive: reserve math, graveyard-only, own-half, unattacked square, enchantment not restored, pawn loses double-step, once per game · all powers illegal while in check · Swift en passant on every double-step · Herald promotes at rank 7 with normal choice.

**Balance instrumentation (log in every game from day one):**
- Pick rate + win rate per enchantment and per power · Taunt-queen (full budget) win rate specifically · Revive vs. free powers (flag: Revive may convert points to material above face value — if it dominates, raise revive costs above piece values) · Herald promotion rate and win conversion · win rate by color.

**Manual:** a zero-budget game must feel like ordinary chess · every state legible at 400px · export → import → replay reproduces the identical final position.

---

## 8. Open items (explicitly deferred)

Online multiplayer (M5) · Elo/ranking + engine-assistance detection · loadout presets & sharing · additional enchantments (design lever on file: one more base-1 enchantment if heavy-piece builds feel thin) · mobile apps · AI opponent.