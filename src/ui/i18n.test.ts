import { beforeEach, describe, expect, it } from 'vitest';
import { LOCALES, locale, setLocale, t, LOCALE_NAME } from './i18n';

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

  it('names each language in its own tongue', () => {
    expect(LOCALE_NAME.de).toBe('Deutsch');
    expect(LOCALE_NAME.es).toBe('Español');
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
});
