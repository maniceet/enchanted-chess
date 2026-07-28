# Play Console listing — Enchanted Chess

Everything the Console asks for, written out so it can be pasted rather than invented at
submission time. Character limits are the Console's and are checked in the counts below.

---

## Store listing

**App name** (30 max) — 15 chars

```
Enchanted Chess
```

**Short description** (80 max) — 78 chars

```
Poison your pawns, shield your rooks, ride a dragon. Then win the game anyway.
```

**Full description** (4000 max) — about 2527 chars

```
Your pawn is poisoned. Whatever takes it dies with it — and your opponent knows, because in
this game nothing is hidden. He has a dragon where his knight should be. You knew that too.

Enchanted Chess is chess with one decision made before the first move. You spend a budget of
enchantment points across your own army, teach your King up to three words of power, and then
both loadouts are laid open on the table. No fog. No face-down cards. No surprise you could
not have seen coming — only a position you have to actually solve.

WHAT YOU CAN GIVE YOUR PIECES

Poison, so that killing your pawn kills the killer.
Immolation, so that the pawn takes the three squares in front of it with it when it burns.
Taunt, a shield that has to be smashed before the piece under it can be touched — and smashing
it costs a whole turn.
Martyr, freezing whatever captures it where it stands.
Outpost, which no enemy pawn may touch.
Swift, a pawn that strides two squares whenever it likes.
Herald, a pawn that crowns a rank early.
Squire, whose whole move is to change places with a Herald anywhere on the board — the two of
them together are a queen nobody had to march up the board.

WORDS YOUR KING CAN SPEAK

Three of them, once each, spent instead of a move. Throw a piece across the board. Trade places
with it. Freeze an enemy where it stands. Call a dead piece back out of your graveyard. Mark a
piece for a death that arrives in three turns and cannot be lifted. Choosing which three, and
saving them for the right moment, is the game inside the game.

THE ROAD

Walk it in one sitting, from the taps of an inn to the Dragonlord's table. A drunk knight who
was somebody once. An innkeeper who takes whatever you leave lying about. A princess who rides
you down on a dragon and lends you one afterwards. A prince who calls back everything you kill.

Lose anywhere and it all begins again at the taps — but the gold is yours, what you spent it
learning is permanent, and you come back carrying more than you did. Nobody clears this road on
their first walk. Some of what is at the end of it is not what the valley thinks it is.

ALSO HERE

Pass-and-play duels with every enchantment unlocked. Chess960. Optional clocks and a King's
word that bends them. A tutorial that hands you each enchantment on a board of its own, and an
innkeeper who explains the parts that are not chess at the moment they first bite you.

FREE, OFFLINE, AND YOURS

No ads. No account. No tracking, and no server to do the tracking with. It works on a plane.
```

**Release notes** for the first release (500 max per language) — 233 chars

```
First release.

The full campaign: seven opponents from the inn's taps to the Dragonlord's
table, seven enchantments, five King powers, and a board where both sides know
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

## Two icons, on purpose

The **store icon** is the painted badge in `media/logo.png`, resized to 512. It is shown large
on the listing page, where the knight, the rook, the potion bottles and the wordmark all read.

The **launcher icon** is a different, simpler mark, generated by `scripts/icons.ts`. It has to
be: an adaptive icon is masked to a circle or a squircle by the launcher, so a baked-in rounded
frame gets its corners sliced off and reads as a rendering fault; a wordmark is illegible at the
48dp a launcher actually draws; and the subject has to survive inside a 66dp circle, which art
running edge to edge does not. Same identity, different surfaces, different artwork.

`scripts/icons.ts` deliberately does **not** write `play/icon-512.png` any more — it did, and
would have quietly overwritten the commissioned art on its next run. To regenerate the store
icon from the source badge:

```bash
sips -z 512 512 media/logo.png --out play/icon-512.png
```

## Assets in this folder

| File | Where it goes |
|---|---|
| `icon-512.png` | App icon, 512×512, no transparency — the painted badge, from `media/logo.png` |
| `feature-graphic.png` | Feature graphic, 1024×500 — the same badge, so banner and icon match |
| `feature-graphic-v2.png` | Alternate feature graphic, 1024×500 — candlelit tavern board facing Wittex’s corrupted valley |
| `screenshots/01-the-board.png` | Phone screenshot — a live board with an enchanted pawn |
| `screenshots/02-the-road.png` | Phone screenshot — the seven seats of the campaign |
| `screenshots/03-the-open-board.png` | Phone screenshot — both loadouts revealed before move one |
| `screenshots/04-loadout.png` | Phone screenshot — the builder, the ten-point budget and the cost maths |
| `screenshots/05-the-shelf.png` | Phone screenshot — the inn, where every walk starts |
| `screenshots-tablet/01-the-board.png` | Tablet screenshot — the three-column board layout |
| `screenshots-tablet/02-the-road.png` | Tablet screenshot — the seven seats, two columns |
| `screenshots-tablet/03-rules.png` | Tablet screenshot — the Rules, set as a page |

Phone screenshots are 1080×2400; tablet screenshots are 2560×1600, both captured from an
emulator running the release bundle. Play wants at least two phone shots and takes up to eight,
and uploading tablet shots is what stops the listing being marked as not designed for large
screens.

The tablet board shot was chosen for what it happens to show: the Chronicle has caught the
Drunken Knight spending his King power — `⚡relocate(↔h7)` — with his King now on h7 and the
button beside the board reading "Relocate · used". A power being used explains the game faster
than a quiet opening does.

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

## Signing — done

The upload keystore exists, is held outside this repository, and produces a correctly signed
bundle. Verified on the artifact itself rather than assumed:

| | |
|---|---|
| Signature block | `META-INF/UPLOAD.RSA` |
| Certificate | `CN=Maniceet Sahay, O=Enchanted Chess` |
| Valid until | December 2053 — well past Play's October 2033 floor |
| Algorithm | SHA384withRSA |

Enrol in **Play App Signing** at first upload. It makes the key above only an *upload* key, which
Google can reset if it is ever lost; without it, losing that file ends the ability to update this
listing at all.

## Contact email

```
variantgamess@gmail.com
```

Chosen deliberately as a separate address rather than a personal one: Play publishes this on the
listing, permanently and in public, where it will be scraped. (Two esses — `variantgames@` was
taken.)

## Still to do before submitting

- Nothing in this document. Every field the Console asks for is written down above, the assets
  are in this folder, and the bundle is signed.
- `versionCode` is 1 and must increase on **every** upload after the first. It is the easiest
  thing to forget and the Console rejects a repeat outright.
- A new personal developer account is likely to need a closed test — on the order of 12 testers
  opted in for 14 continuous days — before production access opens. Same `.aab`, so the wait
  runs in the background. Check the current requirement in the Console; the numbers move.
- **Nothing has run on physical hardware.** Emulator only, arm64 only. Install the bundle on a
  real phone and play a seat before going to production; a closed test covers this by itself.
