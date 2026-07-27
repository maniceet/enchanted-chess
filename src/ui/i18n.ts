/* Language.
 *
 * English is the source. Every other locale is a partial map over it, so a string nobody has
 * translated yet renders in English rather than as a key — a half-translated screen is ugly,
 * but `home.play` where a button should be is broken.
 *
 * Scope, stated plainly because it matters more than the mechanism: this covers the *chrome* —
 * menus, buttons, status lines, the words a player needs in order to operate the game. The
 * story is roughly seven thousand words of deliberately-voiced English, and the seats' dialogue
 * is the best thing in the game; translating it is a job for someone who can hear the result in
 * German and in Spanish. The machinery below is ready for it whenever that decision is made,
 * and until then a German player gets a German game with an English story, which is a state
 * plenty of games ship in and is honest about what it is.
 */

export type Locale = 'en' | 'de' | 'es' | 'hi';
export const LOCALES: Locale[] = ['en', 'de', 'es', 'hi'];
/* The picker shows codes rather than names. "English / Deutsch / Español / हिन्दी" is four
 * different widths in four different scripts sitting in a header that also has to hold a title
 * and a mute button on a 320px phone; the codes are two characters each, always. */
export const LOCALE_NAME: Record<Locale, string> = {
  en: 'en',
  de: 'de',
  es: 'es',
  hi: 'hi',
};

/** The long name, for anywhere with room to say it properly. */
export const LOCALE_FULL: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  hi: 'हिन्दी',
};

const KEY = 'enchanted-chess:lang';

/* Off for v1, and deliberately not deleted.
 *
 * The chrome translates cleanly — menus, the board, the builder, the reveal, every
 * enchantment's name in four languages — but the story is seven thousand words of voiced
 * English and it is the best thing in the game. Shipping German menus over an English story is
 * a worse experience than shipping English, and translating the story properly is a decision
 * about the game rather than a task to be finished quietly overnight. So v1 is English.
 *
 * This flag hides the picker *and* stops the device's own language being honoured, which is
 * the half of it that matters: without the second part a phone set to German would still get
 * German menus and an English road, which is the exact state this is avoiding. Everything
 * underneath — the tables, the fallback, the tests — stays where it is and works; turning it
 * back on is this one line. */
export const LANGUAGES_ENABLED = false;

/** The canonical table. Keys are `screen.thing`; English is what everything falls back to. */
const EN = {
  'app.title': 'Enchanted Chess',
  'app.sound.on': 'Sound on',
  'app.sound.off': 'Sound off',
  'app.language': 'Language',

  'home.road': 'Set out on the road',
  'home.road.continue': 'Continue the attempt',
  'home.road.first': 'one walk, from the taps up',
  'home.road.again': 'from the taps, again',
  'home.chest': 'The Sorting Chest',
  'home.duel': 'Duel another captain',
  'home.duel.sub': 'every enchantment, no gold, no ladder',
  'home.rules': 'Rules',
  'home.table': 'The Innkeeper’s table',
  'home.table.sub': 'learn each enchantment on a small board',
  'home.ledger': 'The Ledger',
  'home.ledger.sub': 'what has been winning, and how often',
  'home.tagline': 'Magic here has rules, a price, and no secrets.',
  'home.away': 'Away from the road',
  'home.chest.empty': 'nothing to sort yet',

  'game.status': 'Status',
  'game.chronicle': 'Chronicle',
  'game.table': 'The table',
  'game.tools': 'Playtest tools',
  'game.move': 'move',
  'game.toMove.w': 'White to move',
  'game.toMove.b': 'Black to move',
  'game.inCheck': ', in check',
  'game.checkmate.w': 'Checkmate. White wins',
  'game.checkmate.b': 'Checkmate. Black wins',
  'game.stalemate': 'Stalemate. The game is drawn',
  'game.resigned.w': 'White wins by resignation',
  'game.resigned.b': 'Black wins by resignation',
  'game.flagged.w': 'White wins on time',
  'game.flagged.b': 'Black wins on time',
  'game.draw.agreement': 'Draw by agreement',
  'game.draw.fifty': 'Drawn. Fifty moves with nothing taken and no pawn moved',
  'game.draw.threefold': 'Drawn. The same position for the third time',
  'game.draw.material': 'Drawn. Neither side has the material to mate',
  'game.noMoves': 'No moves yet.',

  'act.resign': 'Resign',
  'act.offerDraw': 'Offer draw',
  'act.drawOffered': 'Draw offered',
  'act.acceptDraw': 'Accept draw',
  'act.undo': 'Undo',
  'act.flip': 'Flip',
  'act.export': 'Export',
  'act.back': 'Back',
  'act.onward': 'Onward →',
  'act.begin': 'Begin the game →',
  'act.rematch.same': 'Rematch, same loadouts',
  'act.rematch.edit': 'Rematch, re-edit',
  'act.mainMenu': '← Main menu',
  'act.backToInn': '← Back to the inn',
  'act.toInn': 'Back to the inn →',
  'act.loadPosition': 'Load position',

  'build.title.w': 'White: choose your enchantments',
  'build.title.b': 'Black: choose your enchantments',
  'build.used': 'used',
  'build.reserved': 'reserved',
  'build.forRevive': ' for Revive',
  'build.pickPiece': 'Pick a piece',
  'build.pickPiece.sub': 'Click any piece above to enchant it.',
  'build.words': 'King’s words, choose up to three',
  'build.wordsHeld': 'King’s words:',

  'reveal.title': 'The Open Board',
  'reveal.spent': 'spent',
  'reveal.reserve': 'reserve',
  'reveal.plain': 'No enchantments. A plain army.',
  'reveal.noPower': 'No power',
  'ench.squire': 'Squire',
  'ench.taunt': 'Taunt',
  'ench.martyr': 'Martyr',
  'ench.outpost': 'Outpost',
  'ench.swift': 'Swift',
  'ench.herald': 'Herald',
  'ench.poison': 'Poison',
  'ench.immolation': 'Immolation',
  'power.teleport': 'Teleport',
  'power.relocate': 'Relocate',
  'power.decree': 'Decree',
  'power.revive': 'Revive',
  'power.doom': 'Destined Death',
  'power.chrono': 'Time Manipulation',
} as const;

export type StringKey = keyof typeof EN;

const DE: Partial<Record<StringKey, string>> = {
  'app.sound.on': 'Ton an',
  'app.sound.off': 'Ton aus',
  'app.language': 'Sprache',

  'home.road': 'Mach dich auf den Weg',
  'home.road.continue': 'Versuch fortsetzen',
  'home.road.first': 'ein Weg, vom Zapfhahn an',
  'home.road.again': 'wieder vom Zapfhahn an',
  'home.chest': 'Die Sortierkiste',
  'home.duel': 'Gegen einen anderen Hauptmann',
  'home.duel.sub': 'alle Verzauberungen, kein Gold, keine Leiter',
  'home.rules': 'Regeln',
  'home.table': 'Der Tisch des Wirts',
  'home.table.sub': 'jede Verzauberung an einem kleinen Brett lernen',
  'home.ledger': 'Das Hauptbuch',
  'home.ledger.sub': 'was gewinnt, und wie oft',
  'home.tagline': 'Magie hat hier Regeln, einen Preis und keine Geheimnisse.',
  'home.away': 'Abseits des Weges',
  'home.chest.empty': 'noch nichts zu sortieren',

  'game.status': 'Stand',
  'game.chronicle': 'Chronik',
  'game.table': 'Der Tisch',
  'game.tools': 'Testwerkzeuge',
  'game.move': 'Zug',
  'game.toMove.w': 'Weiß am Zug',
  'game.toMove.b': 'Schwarz am Zug',
  'game.inCheck': ', im Schach',
  'game.checkmate.w': 'Schachmatt. Weiß gewinnt',
  'game.checkmate.b': 'Schachmatt. Schwarz gewinnt',
  'game.stalemate': 'Patt. Die Partie ist remis',
  'game.resigned.w': 'Weiß gewinnt durch Aufgabe',
  'game.resigned.b': 'Schwarz gewinnt durch Aufgabe',
  'game.flagged.w': 'Weiß gewinnt auf Zeit',
  'game.flagged.b': 'Schwarz gewinnt auf Zeit',
  'game.draw.agreement': 'Remis durch Übereinkunft',
  'game.draw.fifty': 'Remis. Fünfzig Züge ohne Schlag und ohne Bauernzug',
  'game.draw.threefold': 'Remis. Dieselbe Stellung zum dritten Mal',
  'game.draw.material': 'Remis. Keine Seite hat genug Material zum Mattsetzen',
  'game.noMoves': 'Noch keine Züge.',

  'act.resign': 'Aufgeben',
  'act.offerDraw': 'Remis anbieten',
  'act.drawOffered': 'Remis angeboten',
  'act.acceptDraw': 'Remis annehmen',
  'act.undo': 'Zurück',
  'act.flip': 'Drehen',
  'act.export': 'Exportieren',
  'act.back': 'Zurück',
  'act.onward': 'Weiter →',
  'act.begin': 'Partie beginnen →',
  'act.rematch.same': 'Revanche, gleiche Aufstellung',
  'act.rematch.edit': 'Revanche, neu aufstellen',
  'act.mainMenu': '← Hauptmenü',
  'act.backToInn': '← Zurück zum Gasthaus',
  'act.toInn': 'Zurück zum Gasthaus →',
  'act.loadPosition': 'Stellung laden',

  'build.title.w': 'Weiß: wähle deine Verzauberungen',
  'build.title.b': 'Schwarz: wähle deine Verzauberungen',
  'build.used': 'verbraucht',
  'build.reserved': 'zurückgelegt',
  'build.forRevive': ' für Wiederbelebung',
  'build.pickPiece': 'Wähle eine Figur',
  'build.pickPiece.sub': 'Klicke oben auf eine Figur, um sie zu verzaubern.',
  'build.words': 'Worte des Königs, bis zu drei',
  'build.wordsHeld': 'Worte des Königs:',

  'reveal.title': 'Das offene Brett',
  'reveal.spent': 'ausgegeben',
  'reveal.reserve': 'übrig',
  'reveal.plain': 'Keine Verzauberungen. Ein schlichtes Heer.',
  'reveal.noPower': 'Kein Wort',
  'ench.squire': 'Knappe',
  'ench.taunt': 'Spott',
  'ench.martyr': 'Märtyrer',
  'ench.outpost': 'Vorposten',
  'ench.swift': 'Flink',
  'ench.herald': 'Herold',
  'ench.poison': 'Gift',
  'ench.immolation': 'Flammenopfer',
  'power.teleport': 'Teleport',
  'power.relocate': 'Platzwechsel',
  'power.decree': 'Erlass',
  'power.revive': 'Wiederbelebung',
  'power.doom': 'Bestimmter Tod',
  'power.chrono': 'Zeitmanipulation',
};

const ES: Partial<Record<StringKey, string>> = {
  'app.sound.on': 'Sonido activado',
  'app.sound.off': 'Sonido desactivado',
  'app.language': 'Idioma',

  'home.road': 'Echarse al camino',
  'home.road.continue': 'Continuar el intento',
  'home.road.first': 'un camino, desde la taberna',
  'home.road.again': 'desde la taberna, otra vez',
  'home.chest': 'El arcón',
  'home.duel': 'Duelo con otro capitán',
  'home.duel.sub': 'todos los encantamientos, sin oro, sin escalera',
  'home.rules': 'Reglas',
  'home.table': 'La mesa del posadero',
  'home.table.sub': 'aprende cada encantamiento en un tablero pequeño',
  'home.ledger': 'El registro',
  'home.ledger.sub': 'qué está ganando, y con qué frecuencia',
  'home.tagline': 'Aquí la magia tiene reglas, un precio y ningún secreto.',
  'home.away': 'Lejos del camino',
  'home.chest.empty': 'nada que ordenar todavía',

  'game.status': 'Estado',
  'game.chronicle': 'Crónica',
  'game.table': 'La mesa',
  'game.tools': 'Herramientas de prueba',
  'game.move': 'jugada',
  'game.toMove.w': 'Juegan las blancas',
  'game.toMove.b': 'Juegan las negras',
  'game.inCheck': ', en jaque',
  'game.checkmate.w': 'Jaque mate. Ganan las blancas',
  'game.checkmate.b': 'Jaque mate. Ganan las negras',
  'game.stalemate': 'Ahogado. La partida es tablas',
  'game.resigned.w': 'Las blancas ganan por abandono',
  'game.resigned.b': 'Las negras ganan por abandono',
  'game.flagged.w': 'Las blancas ganan por tiempo',
  'game.flagged.b': 'Las negras ganan por tiempo',
  'game.draw.agreement': 'Tablas de común acuerdo',
  'game.draw.fifty': 'Tablas. Cincuenta jugadas sin capturas ni movimiento de peón',
  'game.draw.threefold': 'Tablas. La misma posición por tercera vez',
  'game.draw.material': 'Tablas. Ningún bando tiene material para dar mate',
  'game.noMoves': 'Aún no hay jugadas.',

  'act.resign': 'Abandonar',
  'act.offerDraw': 'Ofrecer tablas',
  'act.drawOffered': 'Tablas ofrecidas',
  'act.acceptDraw': 'Aceptar tablas',
  'act.undo': 'Deshacer',
  'act.flip': 'Girar',
  'act.export': 'Exportar',
  'act.back': 'Atrás',
  'act.onward': 'Adelante →',
  'act.begin': 'Comenzar la partida →',
  'act.rematch.same': 'Revancha, misma preparación',
  'act.rematch.edit': 'Revancha, volver a elegir',
  'act.mainMenu': '← Menú principal',
  'act.backToInn': '← Volver a la posada',
  'act.toInn': 'Volver a la posada →',
  'act.loadPosition': 'Cargar posición',

  'build.title.w': 'Blancas: elige tus encantamientos',
  'build.title.b': 'Negras: elige tus encantamientos',
  'build.used': 'usados',
  'build.reserved': 'reservados',
  'build.forRevive': ' para Resurrección',
  'build.pickPiece': 'Elige una pieza',
  'build.pickPiece.sub': 'Haz clic en cualquier pieza de arriba para encantarla.',
  'build.words': 'Palabras del rey, elige hasta tres',
  'build.wordsHeld': 'Palabras del rey:',

  'reveal.title': 'El tablero abierto',
  'reveal.spent': 'gastados',
  'reveal.reserve': 'reserva',
  'reveal.plain': 'Sin encantamientos. Un ejército sencillo.',
  'reveal.noPower': 'Sin palabra',
  'ench.squire': 'Escudero',
  'ench.taunt': 'Provocación',
  'ench.martyr': 'Mártir',
  'ench.outpost': 'Bastión',
  'ench.swift': 'Veloz',
  'ench.herald': 'Heraldo',
  'ench.poison': 'Veneno',
  'ench.immolation': 'Inmolación',
  'power.teleport': 'Teletransporte',
  'power.relocate': 'Intercambio',
  'power.decree': 'Decreto',
  'power.revive': 'Resurrección',
  'power.doom': 'Muerte Anunciada',
  'power.chrono': 'Manipulación del Tiempo',
};


const HI: Partial<Record<StringKey, string>> = {
  'app.sound.on': 'ध्वनि चालू',
  'app.sound.off': 'ध्वनि बंद',
  'app.language': 'भाषा',

  'home.road': 'राह पर निकलो',
  'home.road.continue': 'यात्रा जारी रखो',
  'home.road.first': 'एक सफ़र, सराय से शुरू',
  'home.road.again': 'फिर से सराय से',
  'home.chest': 'छँटाई की पेटी',
  'home.duel': 'किसी और सरदार से द्वंद्व',
  'home.duel.sub': 'हर जादू, न सोना, न सीढ़ी',
  'home.rules': 'नियम',
  'home.table': 'सरायवाले की मेज़',
  'home.table.sub': 'हर जादू छोटे बोर्ड पर सीखो',
  'home.ledger': 'बही-खाता',
  'home.ledger.sub': 'क्या जीत रहा है, और कितनी बार',
  'home.tagline': 'यहाँ जादू के नियम हैं, क़ीमत है, और कोई राज़ नहीं।',
  'home.away': 'राह से दूर',
  'home.chest.empty': 'अभी छाँटने को कुछ नहीं',

  'game.status': 'स्थिति',
  'game.chronicle': 'वृत्तांत',
  'game.table': 'मेज़',
  'game.tools': 'परीक्षण उपकरण',
  'game.move': 'चाल',
  'game.toMove.w': 'सफ़ेद की चाल',
  'game.toMove.b': 'काले की चाल',
  'game.inCheck': ', शह में',
  'game.checkmate.w': 'शहमात। सफ़ेद जीता',
  'game.checkmate.b': 'शहमात। काला जीता',
  'game.stalemate': 'गतिरोध। बाज़ी बराबर रही',
  'game.resigned.w': 'काले के हार मानने पर सफ़ेद जीता',
  'game.resigned.b': 'सफ़ेद के हार मानने पर काला जीता',
  'game.flagged.w': 'समय समाप्त — सफ़ेद जीता',
  'game.flagged.b': 'समय समाप्त — काला जीता',
  'game.draw.agreement': 'सहमति से बराबरी',
  'game.draw.fifty': 'बराबरी। पचास चालों में न कोई प्यादा चला, न कुछ मारा गया',
  'game.draw.threefold': 'बराबरी। वही स्थिति तीसरी बार',
  'game.draw.material': 'बराबरी। किसी के पास मात देने भर की सेना नहीं',
  'game.noMoves': 'अभी कोई चाल नहीं।',

  'act.resign': 'हार मानो',
  'act.offerDraw': 'बराबरी का प्रस्ताव',
  'act.drawOffered': 'बराबरी प्रस्तावित',
  'act.acceptDraw': 'बराबरी स्वीकारो',
  'act.undo': 'वापस लो',
  'act.flip': 'बोर्ड घुमाओ',
  'act.export': 'निर्यात',
  'act.back': 'वापस',
  'act.onward': 'आगे →',
  'act.begin': 'बाज़ी शुरू करो →',
  'act.rematch.same': 'फिर से, वही सेना',
  'act.rematch.edit': 'फिर से, सेना बदलकर',
  'act.mainMenu': '← मुख्य पृष्ठ',
  'act.backToInn': '← सराय लौटो',
  'act.toInn': 'सराय लौटो →',
  'act.loadPosition': 'स्थिति लोड करो',

  'build.title.w': 'सफ़ेद: अपने जादू चुनो',
  'build.title.b': 'काला: अपने जादू चुनो',
  'build.used': 'ख़र्च',
  'build.reserved': 'बचाए',
  'build.forRevive': ' पुनर्जीवन के लिए',
  'build.pickPiece': 'एक मोहरा चुनो',
  'build.pickPiece.sub': 'ऊपर किसी भी मोहरे पर क्लिक करके उसे जादू दो।',
  'build.words': 'राजा के वचन, तीन तक चुनो',
  'build.wordsHeld': 'राजा के वचन:',

  'reveal.title': 'खुला बोर्ड',
  'reveal.spent': 'ख़र्च',
  'reveal.reserve': 'बचत',
  'reveal.plain': 'कोई जादू नहीं। सादी सेना।',
  'reveal.noPower': 'कोई वचन नहीं',
  'ench.squire': 'सहायक',
  'ench.taunt': 'ललकार',
  'ench.martyr': 'बलिदान',
  'ench.outpost': 'चौकी',
  'ench.swift': 'तेज़',
  'ench.herald': 'दूत',
  'ench.poison': 'विष',
  'ench.immolation': 'अग्निबलि',
  'power.teleport': 'क्षणभंग',
  'power.relocate': 'स्थान-बदल',
  'power.decree': 'आदेश',
  'power.revive': 'पुनर्जीवन',
  'power.doom': 'नियत मृत्यु',
  'power.chrono': 'समय-नियंत्रण',
};

const TABLE: Record<Locale, Partial<Record<StringKey, string>>> = { en: EN, de: DE, es: ES, hi: HI };

/** Exported so the choice of language can be tested without a browser that will change its
 *  own locale — Chrome ignores both `--lang` and the DevTools locale override for
 *  `navigator.language`, which made the obvious end-to-end check impossible to run. */
export function pickLocale(tags: readonly string[], saved?: string | null): Locale {
  if (saved && (LOCALES as string[]).includes(saved)) return saved as Locale;
  for (const tag of tags) {
    const base = String(tag).slice(0, 2).toLowerCase();
    if ((LOCALES as string[]).includes(base)) return base as Locale;
  }
  return 'en';
}

function detect(): Locale {
  if (!LANGUAGES_ENABLED) return 'en';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && (LOCALES as string[]).includes(saved)) return saved as Locale;
  } catch {
    /* private browsing: fall through to the device's own preference */
  }
  const tags = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return pickLocale(tags);
}

let current: Locale = detect();

export const locale = (): Locale => current;

/* Anyone rendering a string needs to hear about a change, and only the component that renders
 * them can re-render them. A tick inside the top bar cannot do it: `children` is an element that
 * has already been built by the screen above, so React reuses it untouched and the menu stays
 * in the old language until a reload. (It did exactly that, while a comment beside it claimed
 * it asked the whole tree again.) A subscription lets the screen itself listen. */
const listeners = new Set<() => void>();

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice lasts the session */
  }
  for (const listener of [...listeners]) listener();
}

/* The engine keeps the canonical English name of every enchantment and word, and keeps it in a
 * package with no UI in it at all — which is the right place for it and the wrong place to put
 * a language table. So the lookup lives here, keyed by the same identifiers the engine uses,
 * and the engine never learns that translation exists. */
export const enchName = (ench: string): string => t(`ench.${ench}` as StringKey);
export const powerName = (power: string): string => t(`power.${power}` as StringKey);

/** The string for the active locale, or the English one when nobody has translated it yet. */
export function t(key: StringKey): string {
  return TABLE[current][key] ?? EN[key];
}
