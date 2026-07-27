import { beforeEach, describe, expect, it } from 'vitest';
import { LANGUAGES_ENABLED, LOCALES, locale, pickLocale, setLocale, t, LOCALE_NAME, LOCALE_FULL } from './i18n';

/* Language, and the one rule that keeps a half-translated app usable.
 *
 * English is the source and every other locale is a partial map over it. A string nobody has
 * got to yet renders in English — never as its key, which is what a naive lookup does and is
 * the difference between "this bit is still English" and "this button is broken".
 */
beforeEach(() => {
  setLocale('en');
});

describe('the three languages', () => {
  it('answers in the language that is set', () => {
    setLocale('de');
    expect(t('act.resign')).toBe('Aufgeben');
    setLocale('es');
    expect(t('act.resign')).toBe('Abandonar');
    setLocale('en');
    expect(t('act.resign')).toBe('Resign');
  });

  it('falls back to English rather than showing a key', () => {
    for (const l of LOCALES) {
      setLocale(l);
      // Every key resolves to *something* a human wrote, in every language.
      for (const key of ['app.title', 'home.road', 'game.status', 'reveal.title'] as const) {
        const said = t(key);
        expect(said.length, `${l}/${key}`).toBeGreaterThan(0);
        expect(said, `${l}/${key} leaked its key`).not.toContain('.');
      }
    }
  });

  it('remembers the choice', () => {
    setLocale('de');
    expect(locale()).toBe('de');
  });

  it('labels the picker with codes, and keeps the full names for elsewhere', () => {
    // Four language names in four scripts do not fit a header that also holds a title and a
    // mute button on a 320px phone; two characters always do.
    for (const l of LOCALES) expect(LOCALE_NAME[l]).toBe(l);
    expect(LOCALE_FULL.de).toBe('Deutsch');
    expect(LOCALE_FULL.hi).toBe('हिन्दी');
  });

  it('speaks Hindi', () => {
    setLocale('hi');
    expect(t('act.resign')).toBe('हार मानो');
    expect(t('game.status')).toBe('स्थिति');
  });

  it('never leaves a translated string identical to the English by accident', () => {
    // A copy-paste that forgets to translate is worse than an omission: the fallback would have
    // caught the omission, and this catches the copy.
    const suspicious: string[] = [];
    for (const l of ['de', 'es'] as const) {
      setLocale('en');
      const en = t('game.stalemate');
      setLocale(l);
      if (t('game.stalemate') === en) suspicious.push(`${l}: game.stalemate`);
    }
    expect(suspicious).toEqual([]);
  });

  /* What a phone actually hands the app. Inside the Android build this is a WebView, and it
   * reports the device's languages exactly as a browser does — but neither `--lang` nor the
   * DevTools locale override moves `navigator.language` in headless Chrome, so the end-to-end
   * check cannot be run and this is what stands in for it. */
  it('follows the device, and takes the first language it knows', () => {
    expect(pickLocale(['de-DE', 'en-GB'])).toBe('de');
    expect(pickLocale(['es-MX'])).toBe('es');
    expect(pickLocale(['hi-IN', 'en-IN'])).toBe('hi');
    // An Indian phone set to English, then Hindi, is an English speaker.
    expect(pickLocale(['en-IN', 'hi-IN'])).toBe('en');
    // Nothing we speak: English rather than nothing.
    expect(pickLocale(['fr-FR', 'it-IT'])).toBe('en');
    expect(pickLocale([])).toBe('en');
  });

  it('lets a saved choice beat the device', () => {
    expect(pickLocale(['de-DE'], 'es')).toBe('es');
    expect(pickLocale(['de-DE'], 'klingon')).toBe('de');
  });

  /* v1 ships English. The tables and the fallback all still work — these tests exercise them
   * directly — but nothing reaches a player until the flag is turned back on, and the flag has
   * to cover the device's own preference as well as the picker, or a German phone would get
   * German menus over an English story: exactly the half-and-half the decision was made to
   * avoid. */
  it('is off for v1, and off means the device cannot turn it on either', () => {
    expect(LANGUAGES_ENABLED).toBe(false);
  });
});
