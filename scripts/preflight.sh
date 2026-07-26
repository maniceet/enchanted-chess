#!/usr/bin/env bash
#
# Everything that must be true before an upload, in one command.
#
#   npm run preflight
#
# These checks exist because each one caught something real, and each was written after the
# thing it catches had already shipped or nearly had:
#
#   tests        — 265 of them, and the engine is the part nobody can eyeball
#   typecheck    — the exhaustive Records are what caught a new enchantment missing from six
#                  places; they only help if this runs
#   overflow     — three sideways-scrolling screens found by hand before this existed, and a
#                  fourth found by it within a minute of being written
#   devgate      — the dev-only "start at Wittex" shortcut shipped inside the production bundle
#                  once already, unreachable but present
#   signature    — an unsigned or debug-signed artifact is rejected at the Console, after the
#                  upload rather than before it
#
# Deliberately not silent on success. The point is to read the list and see it pass.

set -uo pipefail
cd "$(dirname "$0")/.."

FAILED=0
step() {
  printf '\n\033[1m── %s\033[0m\n' "$1"
}
check() {
  if "$@"; then
    printf '   \033[32mok\033[0m\n'
  else
    printf '   \033[31mFAILED\033[0m\n'
    FAILED=1
  fi
}

step "Tests"
check npm test --silent

step "Types"
check npx tsc -b

step "Horizontal overflow, seven widths"
check npx tsx scripts/overflow.ts

step "Dev-only state absent from the bundle"
check npx tsx scripts/devgate.ts

step "Release bundle and APK"
check npm run android:bundle --silent
check bash -c 'cd android && ./gradlew assembleRelease -q'

step "Signature"
APK=android/app/build/outputs/apk/release/app-release.apk
check "${ANDROID_HOME:?set ANDROID_HOME}/build-tools/36.0.0/apksigner" verify "$APK"

step "Version code"
CODE=$(grep -oE 'versionCode [0-9]+' android/app/build.gradle | grep -oE '[0-9]+')
printf '   versionCode is %s — it must be higher than any upload the Console has seen.\n' "$CODE"

step "Download size"
OUT=${TMPDIR:-/tmp}/enchanted-chess-preflight.apks
rm -f "$OUT"
if bundletool build-apks --bundle=android/app/build/outputs/bundle/release/app-release.aab \
  --output="$OUT" --mode=universal >/dev/null 2>&1; then
  BYTES=$(bundletool get-size total --apks="$OUT" | tail -1 | cut -d, -f1)
  printf '   %.2f MB\n' "$(echo "$BYTES/1048576" | bc -l)"
else
  printf '   \033[33mskipped — bundletool not installed\033[0m\n'
fi

printf '\n'
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32mReady to upload.\033[0m %s\n' "android/app/build/outputs/bundle/release/app-release.aab"
  printf 'Paste the listing from play/listing.md. Nothing here checks the Console itself.\n'
else
  printf '\033[31mNot ready.\033[0m Fix the failures above.\n'
  exit 1
fi
