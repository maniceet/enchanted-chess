# Play Console listing — Enchanted Chess

Everything the Console asks for, written out so it can be pasted rather than invented at
submission time. Character limits are the Console's and are checked in the counts below.

---

## Store listing

**App name** (30 max) — 15 chars

```
Enchanted Chess
```

**Short description** (80 max) — 74 chars

```
Chess with enchantments. Nothing is hidden. The skill is all in the response.
```

**Full description** (4000 max) — about 2100 chars

```
Standard chess, with one change made before the first move: each captain spends a small
budget of enchantment points on their own pieces, and chooses one power for their King.

Then everything is shown. Both loadouts, in full, before White moves.

THE OPEN BOARD

There is no hidden information in this game. No fog, no face-down cards, no surprise you
could not have seen coming. You know exactly what the piece across the board can do, and it
knows exactly what yours can do, and the whole difficulty is in what you do about it. A
mechanic that only works as an ambush does not belong here.

SIX ENCHANTMENTS

Taunt — while defended and standing in your own half, this piece has a shield. An attacker
who strikes it breaks the shield instead of capturing, and spends its turn doing so. Cross
into enemy ground and the shield sleeps until the piece comes home.

Martyr — whatever captures this piece may not move on its next turn.

Outpost — cannot be taken by an enemy pawn.

Swift — a pawn that may step two squares on any move, not only its first.

Herald — a pawn that crowns on the seventh rank instead of the eighth.

Poison — whatever captures this pawn dies with it.

A King can carry none of them, and suffers none of them. The King bows to no enchantment.

FOUR KING POWERS

Once per game, instead of moving: teleport a piece to any empty unattacked square; swap your
King with a friendly piece in your own half; forbid one enemy piece from moving next turn; or
bring a fallen piece back from your graveyard, paid for with points you chose not to spend.

THE ROAD

The campaign is a single unbroken walk from the taps of an inn to the Dragonlord's table.
Seven opponents, each playing differently and each carrying something you have not faced yet.
Lose anywhere and the walk begins again at the taps — but the gold you won is yours, and what
you learn between attempts is permanent.

NO ACCOUNT, NO ADS, NO TRACKING

Free. Plays entirely offline, including on a plane. Collects nothing whatsoever.
```

**Release notes** for the first release (500 max per language) — 233 chars

```
First release.

The full campaign: seven opponents from the inn's taps to the Dragonlord's
table, six enchantments, five King powers, and a board where both sides know
everything before the first move.

Plays offline. Collects nothing.
```

Every later release replaces this and needs a matching `versionCode` bump in
`android/app/build.gradle` — the Console rejects an upload whose `versionCode` it has already
seen, and it is the single easiest thing to forget.

---

## Categorisation

| Field | Value |
|---|---|
| App or game | Game |
| Category | Board |
| Tags | Chess, Strategy, Roguelike, Single player, Offline |
| Contains ads | No |
| In-app purchases | No |

## Content rating questionnaire

Every answer is No: no violence (abstract pieces are captured, nothing is depicted), no sexual
content, no profanity, no controlled substances, no gambling — the game has no currency that
can be bought and no randomised paid reward — no user interaction, no chat, no sharing of
location or personal information. Expect IARC 3+ / ESRB Everyone.

The Drunken Knight is a character who has been drinking. He is named, not depicted drinking,
and nothing is consumed on screen; if the questionnaire asks about references to alcohol, the
honest answer is that there is a reference in a character's name and description.

## Data safety form

- **Does your app collect or share any of the required user data types?** No.
- **Is all of the user data collected by your app encrypted in transit?** Not applicable — no
  data is collected or transmitted.
- **Do you provide a way for users to request that their data is deleted?** Not applicable; the
  game's saved progress lives only on the device and is removed by clearing app data or
  uninstalling.
- The single declared permission is `INTERNET`, required by the system WebView the game renders
  in. It is not used to send anything: the campaign is fully offline.

## Assets in this folder

| File | Where it goes |
|---|---|
| `icon-512.png` | App icon, 512×512, no transparency |
| `feature-graphic.png` | Feature graphic, 1024×500 |
| `screenshots/01-the-board.png` | Phone screenshot — a live board with an enchanted pawn |
| `screenshots/02-the-road.png` | Phone screenshot — the seven seats of the campaign |
| `screenshots/03-the-open-board.png` | Phone screenshot — both loadouts revealed before move one |
| `screenshots/04-loadout.png` | Phone screenshot — the builder, budget and enchantment costs |

Screenshots are 1080×2400, captured from a Pixel 6 emulator running the release web bundle.
Play wants at least two and takes up to eight.

## Privacy policy URL

```
https://enchanted-chess.vercel.app/privacy.html
```

Live and checked. Paste this one and no other: Vercel's per-deployment URLs — anything of the
form `enchanted-chess-<hash>-luffy-ee0d.vercel.app`, and the team-suffixed alias — sit behind
Vercel Authentication and answer a request with a 302 to an SSO login. A Play reviewer following
such a link would find a login wall where the policy should be, and a privacy policy the
reviewer cannot read is a rejection. Only the clean production alias above is public.

Worth re-checking after any change to the project's Deployment Protection settings.

## Still to do before submitting

- **Contact email.** Required and made public on the listing. Deliberately not filled in here —
  it is the developer's own address to choose and publish, not something to be committed to a
  repository on their behalf.
- **Signing.** The upload keystore does not exist yet. See `ANDROID.md`; it must be created and
  held by the developer, and never enters this repository.
- `versionCode` is 1 and must increase on every upload after the first.
