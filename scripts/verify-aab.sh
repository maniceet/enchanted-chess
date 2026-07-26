#!/usr/bin/env bash
#
# Install the release bundle on a connected device the way Play would, and report what a user
# will actually download.
#
# Why bother, when the debug APK already runs: the debug APK is not the artifact that ships.
# Play never receives it. What ships is the .aab, from which Play generates and signs a set of
# split APKs per device — a path with its own ways to fail (a missing split, an asset that only
# resolves in the base, a worker script that cannot be found once the bundle is re-packed).
# This runs that exact path locally.
#
#   npm run android:verify
#
# The APKs are signed with the standard Android *debug* keystore, whose password is the
# publicly documented "android". That is deliberate: it is a throwaway used only to make the
# splits installable on a local device. It is not, and must never be confused with, the upload
# key — see ANDROID.md.

set -euo pipefail

AAB=android/app/build/outputs/bundle/release/app-release.aab
OUT=${TMPDIR:-/tmp}/enchanted-chess-verify.apks
ADB="${ANDROID_HOME:?set ANDROID_HOME}/platform-tools/adb"

command -v bundletool >/dev/null || { echo "bundletool not found — brew install bundletool"; exit 1; }
[ -f "$AAB" ] || { echo "no bundle at $AAB — run npm run android:bundle first"; exit 1; }

rm -f "$OUT"

# --connected-device builds only the splits this device would actually be served, which is a
# sharper test than a universal APK: a universal APK hides exactly the split-related faults
# this script exists to catch.
bundletool build-apks \
  --bundle="$AAB" \
  --output="$OUT" \
  --ks="$HOME/.android/debug.keystore" --ks-pass=pass:android \
  --ks-key-alias=androiddebugkey --key-pass=pass:android \
  --connected-device --adb="$ADB"

echo
echo "splits this device would be served:"
unzip -l "$OUT" | awk '/\.apk$/ {printf "  %-28s %8.1f KB\n", $4, $1/1024}'

echo
bytes=$(bundletool get-size total --apks="$OUT" | tail -1 | cut -d, -f1)
printf "download size Play will report: %.2f MB\n" "$(echo "$bytes/1048576" | bc -l)"

echo
"$ADB" uninstall com.maniceet.enchantedchess >/dev/null 2>&1 || true
bundletool install-apks --apks="$OUT" --adb="$ADB"
"$ADB" shell am start -n com.maniceet.enchantedchess/.MainActivity >/dev/null

echo
echo "installed and launched from the bundle. Check by hand, in this order:"
echo "  1. the campaign reaches a board and the opponent replies  (the AI is a Web Worker,"
echo "     and a worker that cannot be located is the failure this path is most likely to have)"
echo "  2. The Table offers only: Back to the inn, Resign, Offer draw"
echo "  3. the hardware back button leaves the app only at the inn"
