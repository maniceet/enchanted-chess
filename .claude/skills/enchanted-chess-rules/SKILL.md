---
name: enchanted-chess-rules
description: Condensed ruling reference for Enchanted Chess — the six enchantments, budget math, four King powers, King Immunity, and the exact T1-T4 / M1-M2 edge cases with their required unit tests. Use when implementing or reviewing any rule, legality check, checkmate case, or loadout validation.
---

# Enchanted Chess — ruling reference

Condensed from `.claude/CLAUDE.md` §2. That document wins on any conflict. **Design law — The
Open Board:** no hidden information after match start; nothing may depend on surprise.

## Budget

4 points total · one enchantment per piece max · cost = base cost × carrier multiplier.
Multipliers: pawn ×1 · knight/bishop ×2 · rook ×3 · queen ×4. Unspent points are only useful as
Revive reserve.

## Enchantments (static, always-on, public, die with the piece, never transfer)

| Ench | Cost | Carriers | Effect |
|---|---|---|---|
| Taunt | 1 | any non-King | While defended by ≥1 friendly piece **and standing in its owner's own half (ranks 1–4 from its side)** it has a shield. An enemy capture attempt breaks the shield instead: shield destroyed, attacker does **not** move, turn spent. No exception for a Taunt-carrying attacker (T6). |
| Martyr | 1 | any non-King | Its capturer may not move on its owner's next turn. No effect on a capturing King. |
| Outpost | 2 | pawn, knight, bishop | Cannot be captured by enemy pawns. |
| Swift | 2 | pawn | Double-step on **any** move; every double-step is en-passant capturable. |
| Herald | 3 | pawn | Promotes on reaching rank **7** (owner's perspective); normal promotion choice. |
| Poison | 4 | pawn | Its capturer is also removed. No effect on a capturing King. |

## Taunt rulings

- **T1** Shielded ⟺ defended right now **and** in own half. Last defender leaves → inactive;
  defender returns → active again — unless broken. **Broken is permanent.** Pins do not remove
  defense.
- **T2** A shield-break is **not a capture**: no Poison, no Martyr, no fifty-move reset, attacker
  stays put.
- **T3** A shielded checker cannot be removed in one move → legal replies are king move or
  block, and nothing else. A King may never capture it (it is defended = capture into check).
  Move generation and mate detection must reflect this.
- **T4** A shield-break does not resolve check, so it is **illegal while your King is in check**.
- **T5 (half rule)** Taunt only shields in the owner's own half — the same half Relocate and
  Revive use. Crossing the middle puts the shield to sleep; coming home wakes it. Broken stays
  broken either way. Taunt defends ground, it does not carry armour into an attack.
- **T6 (no attacker exception)** A Taunt-carrying attacker gets nothing special: the square it
  strikes is by definition its own enemy half, where its shield is asleep. Follows from T5 — the
  old "Taunt ignores Taunt" clause is unreachable and was deleted from `movegen.ts`, not left as
  dead code.

## Martyr rulings

- **M1** A frozen piece still attacks and defends — gives check, blocks king moves, defends
  friends. Movement only is restricted.
- **M2** If freezing leaves the owner with no legal move, normal stalemate/checkmate applies.

## King Immunity (§2.4a — "The King bows to no enchantment")

King can never be enchanted · immune to Poison · immune to Martyr · cannot be targeted by
Decree · Outpost still applies to pawns only (a King captures an Outpost piece normally) ·
Taunt needs **no** engine clause (shielded ⇒ defended ⇒ king capture already illegal).

## Time controls (owner's addition, not in CLAUDE.md)

3 | 2 · 5 | 5 · 10 | 0, plus untimed. Flag = loss on time.

## King powers — exactly one per player, free, **once per game**

Activated **instead of moving**, consumes the turn, and **never legal while your King is in
check** (so powers can never affect mate detection).

| Power | Effect |
|---|---|
| Teleport | Move one own piece to any empty square not under enemy attack. **A pawn is barred from its crowning rank and beyond** (rank 8; rank 7 *and* 8 for a Herald) — teleport is a move, not a promotion, so a pawn set down there would be stranded with no legal move forever, and letting it crown would make the power a free queen. |
| Relocate | King swaps with a friendly piece in own half (ranks 1–4); may not leave King in check. |
| Decree | Name one enemy non-King piece; it cannot move on the opponent's next turn (M1 semantics). |
| Revive | Return a piece from your graveyard to an empty, unattacked square in your own half. Costs reserve = piece value (pawn 1, knight/bishop 3; rook/queen unaffordable at 4 budget). Returns **without** its enchantment; a revived pawn counts as moved. |
| **Time Manipulation** (owner's fifth power) | With an increment: +1 s added to your increment for every remaining move. In 10 \| 0: +30 s once. Unusable in an untimed game. |

"Under attack" = a square an enemy piece could capture on, same rule as king-move legality;
pinned enemy pieces still attack. Emergent: Teleport/Revive can never land adjacent to the
enemy King.

## Turn resolution order (§2.5)

move | shield-break | power → 1 captured piece to graveyard → 2 Poison removes capturer (not a
King) → 3 Martyr freezes capturer (not a King) → 4 promotion (Herald at rank 7) → 5 recompute
shields → 6 check/mate/stalemate/draw.

## Required named tests (§7)

T1 defender leaves/returns, broken stays broken · T2 no Poison/Martyr trigger, clock untouched,
attacker doesn't move · T3 mate with shielded checker, Taunted attacker ignores shield, King
capture illegal · T4 shield-break illegal in check · King captures undefended Poison pawn and
survives · King captures undefended Martyr piece unfrozen · M1 frozen piece still checks and
defends · M2 stalemate via freeze · Decree cannot target King · Teleport strands no pawn on its crowning rank · Teleport never lands adjacent to
enemy King · Revive: reserve math, graveyard-only, own half, unattacked, enchantment lost, pawn
loses double-step, once per game · every power illegal in check · Swift en passant on every
double-step · Herald promotes at rank 7 with normal choice.
