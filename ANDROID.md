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

## Known gaps

- **Nothing here has been run on a device or emulator.** The web bundle is verified in a
  browser and the APK builds and contains the right assets, but the back button, the safe-area
  insets and the status bar are reasoned about, not observed. Install the debug APK and check
  those three first.
- No adaptive icon: the launcher icon is still the Capacitor default. The generated
  `public/icons/*.png` cover the web manifest, not `android/app/src/main/res/mipmap-*`.
- No splash screen.
- Portrait is declared in the web manifest but not pinned in `AndroidManifest.xml`.
