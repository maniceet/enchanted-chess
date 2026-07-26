# Enchanted Chess on Android

The campaign is entirely client-side — engine, search and all seven seats run in a worker in
the browser — so the Android app is the same bundle in a native shell, with the web assets
**inside the APK**. It needs no server and no network to play.

```bash
npm run android:apk      # debug APK, installable on a device over USB
npm run android:open     # open the project in Android Studio
npm run android:bundle   # release .aab for Play (needs signing, see below)
```

## Why Capacitor and not a TWA

A Trusted Web Activity would point the app at the live site. That means the game only works
while the site is up, needs Digital Asset Links to verify the domain, and is a thin wrapper
around a URL — which is the shape Play's "minimal functionality" policy exists to catch.

Capacitor bundles `dist/` into the package instead. The game works on a plane, survives the
site going down, and is a real offline game rather than a browser pointed at one. Online play
is gated off in shipped builds anyway (see `ONLINE_ENABLED`), so nothing is lost by cutting the
network dependency.

## What the shell adds

Three things, all of them no-ops in a browser — see `src/ui/native.ts`:

- **The hardware back button** reads as "up one screen", innermost first: a modal, then a story
  card standing on a board, then review mode, then a selection, then any screen that is not the
  inn. Only at the inn does back leave the app. An app that exits from the middle of a game is
  the most common complaint about wrapped web apps and the first thing a reviewer will try.
- **Safe-area insets**, so the top bar clears the notch and the bottom row clears the gesture
  bar. `viewport-fit=cover` in `index.html` hands those regions to the page; the stylesheet
  hands them back.
- **A dark status bar**, so there is no white strip above the tavern.

`base: './'` in the Vite config matters more than it looks: the WebView serves the bundle from
its own origin, and absolute `/assets/...` paths resolve to nothing there.

## Toolchain

Neither of these needs `sudo`. The Temurin *cask* does, which is why this uses the formula.

```bash
brew install openjdk@21
brew install --cask android-commandlinetools   # or Android Studio

export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

`android/local.properties` holds a machine-specific path and is gitignored.

## Signing, and what I will not do for you

A release build has to be signed with a keystore, and **that keystore is a secret you create
and hold**. If it is lost, no future update to the listing can ever be published under the same
app; if it leaks, someone else can publish as you. It is not in this repo and must never be:
`*.keystore`, `*.jks` and `keystore.properties` are gitignored.

```bash
keytool -genkeypair -v -keystore enchanted-chess.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then `android/keystore.properties`:

```properties
storeFile=/absolute/path/to/enchanted-chess.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

…and a `signingConfigs` block in `android/app/build.gradle` reading it. Prefer Play App Signing:
you upload with the key above, Google holds the distribution key, and a lost upload key can be
reset. Without it, losing the keystore ends the listing.

## Before submitting

- `applicationId` is `com.maniceet.enchantedchess`. It is permanent once published — changing
  it means a new listing with no reviews and no installs.
- `versionCode` must increase on every upload. `versionName` is the one humans see.
- `targetSdkVersion` is 36, which meets Play's current floor; they raise it roughly yearly.
- The only permission requested is `INTERNET`, which the WebView needs. Say so on the data
  safety form, along with the honest answer that the game **collects nothing**: progress lives
  in `localStorage` on the device and never leaves it.
- A privacy policy URL is required even for a game that collects nothing.
- Content rating questionnaire, a 512×512 icon, a 1024×500 feature graphic, and at least two
  phone screenshots.

## Running it on an emulator

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
sdkmanager emulator 'system-images;android-35;google_apis_playstore;arm64-v8a'
"$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd -n ec_pixel \
  -k 'system-images;android-35;google_apis_playstore;arm64-v8a' -d pixel_6
"$ANDROID_HOME/emulator/emulator" -avd ec_pixel -no-audio -no-boot-anim &
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.maniceet.enchantedchess/.MainActivity
```

Two traps, both of which cost an hour once:

- Homebrew installs the command-line tools at `cmdline-tools/latest-2`, and `avdmanager` from
  the `PATH` then fails with `Package path is not valid` and an *empty* list of valid paths — it
  is looking for `cmdline-tools/latest`. Call the binary under `latest/bin` directly, as above.
- If an `sdkmanager` download is ever interrupted, it leaves `$ANDROID_HOME/.temp/PackageOperationNN`
  behind, and every later download of that package then **appears to run and silently fetches
  nothing** — no error, no progress, an empty target directory. `rm -rf "$ANDROID_HOME/.temp"`
  and it works immediately. Two separate attempts at the API 36 image were lost to this before
  the cause was clear; the giveaway is a `system-images/android-NN` directory containing only
  `.installer`.

Swap `android-36` for `android-35` above to test the other API level; both have been used here.

## Before every upload

```bash
npm run preflight
```

One command, and it either says "Ready to upload" with the path to the bundle, or names what
failed. Tests, types, horizontal overflow at seven widths, the dev-only shortcut's absence from
the bundle, the release build, the signature, the versionCode, and the download size Play will
report.

Each of those checks exists because the thing it catches had already shipped, or nearly had —
three sideways-scrolling screens found by hand, a dev shortcut sitting unreachable inside a
production build, a new enchantment missing from six lists. None of them were visible without
looking, so this looks, in one place, before the artifact leaves the machine.

## Verifying the artifact that actually ships

```bash
npm run android:verify
```

The debug APK running is not evidence that the app works, because Play never receives the debug
APK. What ships is the `.aab`, and Play generates and signs a set of split APKs from it per
device. That is a separate code path with its own failure modes, and it had never been run.

`scripts/verify-aab.sh` runs it locally: bundletool builds exactly the splits *this* device
would be served — sharper than a universal APK, which hides precisely the split-related faults
worth catching — installs them, and launches the result.

The splits are signed with the standard Android **debug** keystore, whose password is the
publicly documented `android`. That is a throwaway used only to make them installable on a
local device. It is not the upload key and cannot be mistaken for one.

Measured this way, on a Pixel 6 AVD:

| | |
|---|---|
| Splits served | `base-master` 7.4 MB · `base-xxhdpi` 48 KB · `base-en` 24 KB |
| Download size Play reports | **2.68 MB** |
| minSdk / targetSdk | 24 (Android 7.0) / 36 (Android 16) |

The release build was then played, and it works: the campaign reaches a board and the opponent
replies, which is the one thing most likely to break here — the AI runs in a Web Worker, and a
worker script that cannot be located once the bundle is re-packed would leave an opponent that
never moves. It moved. `minifyEnabled` is off, so R8 is not in the picture at all.

Also confirmed in the release build rather than assumed: **The Table offers only Back to the
inn, Resign and Offer draw.** No undo, no export, no scenario loader. The Chronicle keeps its
rewind controls, which are review-only and are meant to be there.

## Play policy audit

The rules that reject an upload rather than merely making it worse, and where this app stands:

- **16 KB memory page sizes.** Required of apps targeting Android 15+, and the requirement is
  about native libraries. Checked by looking inside the bundle rather than reasoning about it:
  it contains **no `.so` files at all**. There is no native code of ours to align, so the rule
  cannot bite.
- **Predictive back.** Android 16 turns it on by default for apps targeting SDK 36, and the
  legacy `onBackPressed` path stops being consulted — which would be a quiet disaster here,
  because the back stack is the thing keeping the app from exiting mid-game. It survives:
  Capacitor's App plugin registers an AndroidX `OnBackPressedCallback` on the activity's
  `OnBackPressedDispatcher` (`AppPlugin.java`), and that dispatcher is what the framework routes
  through `OnBackInvokedCallback` when predictive back is active. No manifest opt-in is needed.
  **Confirmed on an Android 16 emulator, not merely read from the source**: all four back levels
  behave there exactly as they do on 15.
- **targetSdk 36** clears Play's current floor. `minSdk` is 24.
- **One permission**, `INTERNET`, declared by the WebView. Nothing is sent through it.

## What has actually been observed

Verified on Pixel 6 AVDs at **API 35 (Android 15) and API 36 (Android 16)**, by playing the
opening of a run. The API 36 pass was done against the release bundle rather than the debug APK,
so it exercises the artifact Play ships on the OS version the app targets:

- **The back button**, all four levels: Rules → inn, reveal → inn, a live board → inn, and only
  at the inn does it leave the app. The duel in progress survived every one of those.
- **Safe-area insets**: content clears the punch-hole in portrait, the left cutout in
  landscape, and the gesture bar at the bottom in both.
- **The status bar** paints `#140c06` — no white strip above the tavern, and no white flash on
  launch now that the splash is a themed drawable rather than a bitmap.
- **No layout jitter.** The board's top edge is identical before a move, while the opponent's
  `●●●` indicator is up, and after the reply lands.
- **Persistence**: a duel survived `force-stop` and a reinstall over the top.

## Offline, proven rather than asserted

The listing says the game plays entirely offline, including on a plane. That is a public claim,
so it was checked with the radios actually off rather than reasoned about from the fact that the
bundle is local:

```bash
adb shell settings put global airplane_mode_on 1
adb shell cmd connectivity airplane-mode enable
adb shell ping -c 1 -W 2 8.8.8.8      # → connect: Network is unreachable
adb shell pm clear com.maniceet.enchantedchess   # first run, the hardest case
```

Cold start with cleared data, through the prologue, into a duel: the opponent replied. The claim
is true. Worth re-checking if the app ever gains a feature that phones home, because the line is
in the store description where a reviewer can hold it against the app.

## Display size

Separate setting from font scale, and it breaks different things: it changes density rather than
text size, so at Android's largest step the CSS viewport on a Pixel 6 drops to roughly 320px —
narrower than any phone the layout had been looked at on.

```bash
adb shell wm density 540     # largest Display size
adb shell wm density reset
```

It found a third overflow, and this one was present at *every* size, merely too small to notice
until the viewport shrank: `--board` was `min(96vw, …)`, but the board sits inside `.app`, which
spends 18px of the viewport on padding down each side. Sizing the board against the viewport
made it wider than the column holding it, so the page scrolled sideways by the difference. It is
`min(calc(100vw - 36px), …)` now, and the board is inset with symmetric margins at both
densities.

## Large font scale

Android's font size setting goes to **2.0**, and the WebView applies it to every font size in
the page — including ones written in `px`. It is a real setting real people use, Play's
accessibility guidance expects apps to survive it, and it is a good stress test besides: it is
the cheapest way to find layouts that cannot cope with their own text growing.

```bash
adb shell settings put system font_scale 2.0   # then force-stop and relaunch
adb shell settings put system font_scale 1.0   # put it back
```

Checked at 1.5 and 2.0 across the menu, the prologue, the Rules page, the road, the story cards,
the reveal screen and a live board. Two things broke, both now fixed:

- The home title ran off the right edge. `clamp(38px, 8vw, 66px)` looks viewport-relative but
  the 38px floor is what binds on a phone, and doubling it gave "Enchanted" about 396px of text
  in a 393px viewport.
- Worse, the board screen **scrolled sideways**. The King's power button was `flex: none` with
  `white-space: nowrap`, so it never gave way; its doubled label pushed the column wider than
  the viewport and dragged the whole layout — board included — off the right of the screen.

The second one is worth dwelling on. That same button had already been caught overflowing in
landscape, and the fix was applied *inside the landscape media query* — so the underlying fault
was still there, waiting for any other reason for the label to grow. Font scale was that reason.
The rule is global now.

Two earlier bugs were found the same way and fixed, both also invisible on a desktop:

- The inn inherited the prologue's scroll offset, so on a phone you arrived below the only seat
  you were allowed to play, looking at a column of `LOCKED`.
- A landscape phone answers "narrow" to every `max-width` breakpoint in the stylesheet, so it
  got the one-column phone stack in a viewport 390px tall: the board ran off the bottom edge at
  rank 5, and you scrolled to see your own back rank between moves.

## The listing

`play/` holds everything the Play Console asks for, so submission is pasting rather than
inventing. `play/listing.md` has the store text with its character counts, the categorisation,
the content-rating answers and the data-safety answers. Beside it are the icon, the feature
graphic and four phone screenshots.

The art is generated, not drawn by hand:

```bash
npx tsx scripts/icons.ts   # launcher icons, play/icon-512.png, play/feature-graphic.png
```

It renders the *same* rook path the board draws (`Pieces.tsx`, `SHAPES.r`) through headless
Chrome, so the icon can never drift away from the pieces. The one number worth understanding is
`FILL`: an adaptive icon's 66dp safe zone is a **circle**, so what has to fit inside it is the
art's diagonal, not its height. Fitting the height put the rook's base outside the mask and a
Pixel launcher sliced it off.

The privacy policy is a real page — `public/privacy.html`, shipped with the web build and live
at **https://enchanted-chess.vercel.app/privacy.html**. Give the Console that URL and no other:
Vercel's per-deployment URLs and the team-suffixed alias sit behind Vercel Authentication and
answer with a 302 to an SSO login, so a reviewer following one would meet a login wall where the
policy should be. Only the clean production alias is public. It is
accurate rather than boilerplate: it names the four `localStorage` keys the game actually
writes and says why `INTERNET` is the only permission.

## Multiplayer, and why it is off

The shipped build gates online play to a disabled "Against a stranger — COMING SOON" button.
That is deliberate, and it is two separate things, not one flag:

- **No server is running.** `server/main.ts` is a `ws` server that has to stay alive holding
  connections. Vercel serves the static bundle and will not do that; it needs a host with
  persistent WebSockets.
- **The app could not find one anyway.** `socketUrl()` falls back to `location.host`, which
  inside the WebView is the local bundle's own origin. It needs `VITE_WS_URL` pointing at an
  absolute `wss://…/ws` at build time.

Turning it on is: deploy the server, rebuild with `VITE_ONLINE=1 VITE_WS_URL=…`, bump
`versionCode`, ship an update. **And update the data safety form and the privacy policy first** —
both currently say the game collects nothing and that nothing leaves the device, which online
play makes false. Shipping a build that contradicts a filed data-safety declaration is the part
Play enforces on.

What ships instead is not multiplayer-free: **hotseat** ("Duel another captain → At this table")
is two people on one device with every enchantment, and works offline.

## Measurements worth keeping

| | |
|---|---|
| Cold start | 2.9–3.5s on a software-rendered emulator; faster on real hardware |
| Download size | 2.68 MB |
| Tablet | 10" landscape (1280×800 CSS px): rail left, board centre, panels right — the desktop layout, and it holds |

## The real minimum is the WebView, not minSdkVersion

`minSdkVersion` is 24, and on its own that number is misleading. The game is a web bundle in a
system WebView, and **Android System WebView updates through Play independently of the OS**, so
what actually decides whether the app renders is the WebView version on the device, not the
Android version. An Android 7 phone that still gets Play updates has a current engine; the
number in the manifest says nothing about it either way.

Two consequences, both handled:

- **The JS floor is pinned.** `vite.config.ts` sets `build.target: 'chrome87'` rather than
  leaving Vite's default, which moves between major versions and would silently shift the floor
  under a shipped app. A few kB of transpilation is cheaper than a white screen.
- **The one load-bearing modern CSS feature has a fallback.** Container queries need Chrome 105+
  and are what hide the capture tray and reserve when the board column is narrow. On an older
  engine those rules are ignored, the bar keeps contents too wide for it, and the board screen
  scrolls sideways — a failure `npm run check:overflow` can never catch, because it runs in a
  current Chrome where the query works. Plain `@media` rules now mirror them. They are an
  approximation, not a replacement: a landscape phone has a wide viewport and a narrow column,
  which only the container query can express, so both are present.

`:has()` is also used, for the Rules table on mobile, and is purely cosmetic — an old engine
gets slightly taller rows and nothing else.

## Download size, and the portraits

The bundle carries eight seat portraits in `public/portraits/`. They are 433×433 PNGs at about
280 KB each — **2.1 MB, which is most of the app**. The APK went from 3.1 MB to 5.2 MB the day
they landed.

They are never drawn anywhere near that size. The player bar renders them at 30×30 CSS px, the
seat cards at around 40, and every rule that draws them sets `image-rendering: pixelated`, which
throws the detail away on purpose. Measured alternatives, same eight files:

| stored at | total |
|---|---|
| 433px (today) | 2132 KB |
| 192px | 493 KB |
| 128px | 233 KB |

192px covers a 40px slot at 3× device pixel ratio with room to spare and returns about 1.6 MB —
roughly a third of the download. Not done here on purpose: the portraits are live artwork being
worked on elsewhere, and resizing somebody's source files underneath them is not a packaging
decision to take unilaterally. When the art settles:

```bash
for f in public/portraits/*.png; do sips -z 192 192 "$f" --out "$f"; done
```

Better still would be exporting them at the size they are drawn at, since pixel art downscaled
by a non-integer ratio muddies rather than sharpens.

## Known gaps

- Portrait is declared in the web manifest but deliberately **not** pinned in
  `AndroidManifest.xml` — landscape earns its keep, with the board beside the panels and the
  reveal screen in two columns.
- **The upload keystore does not exist.** Nothing can be published until it does; see above.
- **Contact email** is not filled in. It is required and becomes public on the listing, which
  makes it the developer's to choose, not something to commit on their behalf.
- Emulator only, arm64 only. Not yet run on physical hardware.
