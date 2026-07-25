/* What changes when the game is an installed app rather than a tab.
 *
 * Deliberately the only file that knows Capacitor exists, and it is loaded lazily so a plain
 * web build never pays for it and never breaks if the packages are absent. Everything here is
 * a no-op in a browser: `isNative()` is false, and nothing else runs.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** True only inside the Android (or iOS) shell. A browser — including a phone browser and an
 *  installed PWA — is not "native" and keeps the browser's own back and status bar. */
export function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

/** Android's hardware back button.
 *
 *  Android users expect back to mean "up one screen", and an app that exits from the middle of
 *  a game instead is the single most common complaint about wrapped web apps — and something a
 *  Play reviewer will hit within a minute. The game has no router, so "up" is expressed as a
 *  stack of handlers: the top one that claims the press wins, and only when nothing claims it
 *  does the app close.
 *
 *  Returns a function that removes the listener again. */
export async function onBackButton(handle: () => boolean): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const listener = await App.addListener('backButton', () => {
      // `handle` returns true when the press has been used for something. Nothing used it
      // means we are at the top of the game, and back should do what back does.
      if (!handle()) void App.exitApp();
    });
    return () => void listener.remove();
  } catch {
    // The packages are optional; a build without them is a web build.
    return () => {};
  }
}

/** Paint the status bar to match the tavern rather than leaving a white strip above the game. */
export async function dressStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#140c06' });
  } catch {
    /* no status bar to dress */
  }
}
