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

Homebrew installs the command-line tools at `cmdline-tools/latest-2`, and `avdmanager` from the
`PATH` then fails with `Package path is not valid` and an empty list of valid paths — it is
looking for `cmdline-tools/latest`. Call the binary under `latest/bin` directly, as above.

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
  **This is read from the source, not observed** — see the gap below.
- **targetSdk 36** clears Play's current floor. `minSdk` is 24.
- **One permission**, `INTERNET`, declared by the WebView. Nothing is sent through it.

## What has actually been observed

Verified on a Pixel 6 AVD, API 35, by playing the opening of a run:

- **The back button**, all four levels: Rules → inn, reveal → inn, a live board → inn, and only
  at the inn does it leave the app. The duel in progress survived every one of those.
- **Safe-area insets**: content clears the punch-hole in portrait, the left cutout in
  landscape, and the gesture bar at the bottom in both.
- **The status bar** paints `#140c06` — no white strip above the tavern, and no white flash on
  launch now that the splash is a themed drawable rather than a bitmap.
- **No layout jitter.** The board's top edge is identical before a move, while the opponent's
  `●●●` indicator is up, and after the reply lands.
- **Persistence**: a duel survived `force-stop` and a reinstall over the top.

Two bugs were found this way and fixed, both invisible on a desktop:

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

## Known gaps

- Portrait is declared in the web manifest but deliberately **not** pinned in
  `AndroidManifest.xml` — landscape earns its keep, with the board beside the panels and the
  reveal screen in two columns.
- **The upload keystore does not exist.** Nothing can be published until it does; see above.
- **Contact email** is not filled in. It is required and becomes public on the listing, which
  makes it the developer's to choose, not something to commit on their behalf.
- **Everything has been observed on API 35, and the app targets 36.** That is the one gap that
  matters, because Android 16 is exactly where predictive back changes who receives the back
  press. The reasoning above says the AndroidX dispatcher carries it, and the reasoning is
  probably right, but the back stack is important enough here to deserve being watched rather
  than argued about. Create an Android 16 AVD and repeat the four back-button checks:

  ```bash
  sdkmanager 'system-images;android-36;google_apis_playstore;arm64-v8a'
  "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd -n ec_a16 \
    -k 'system-images;android-36;google_apis_playstore;arm64-v8a' -d pixel_6
  ```

- Emulator only, arm64 only. Not yet run on physical hardware.
