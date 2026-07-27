import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, useSyncExternalStore } from 'react';
import { applyAction } from '../engine/apply';
import {
  PIECE_VALUE,
  findKing,
  initialState,
  opposite,
  random960Back,
  squareName,
} from '../engine/board';
import {
  BUDGET,
  POWER_TEXT,
  applyLoadout,
  emptyLoadout,
  fitLoadout,
  loadoutSummary,
  validateLoadout,
  type Loadout,
} from '../engine/loadout';
import { TIME_CONTROLS, formatClock, newClock, timePowerEffect } from '../engine/clock';
import {
  armorArmy,
  CAMPAIGN,
  HOUSE,
  innkeeperLoadout,
  fortifyRooks,
  raiseArchbishops,
  raiseDragons,
  venomPawn,
  searchOptionsFor,
  type House,
} from '../engine/ai';
import { bindActions, inCheck, legalMoves, shieldBreakActions, swapActions } from '../engine/movegen';
import { toSan } from '../engine/notation';
import { REVIVE_COST, powerActions, powerReason, powerUnavailableReason } from '../engine/powers';
import {
  isError,
  type Action,
  type Color,
  type GameState,
  type MoveAction,
  type SwapAction,
  type PieceType,
  type PowerName,
  type TimeControlId,
} from '../engine/types';
import { Board } from './Board';
import { LoadoutBuilder } from './Loadout';
import { ENCH_NAME, EnchRune, ManaMeter, PieceGlyph, PIECE_NAME } from './Pieces';
import { Rules } from './Rules';
import { DrillsPage } from './DrillsPage';
import {
  houseCommentary,
  houseSays,
  INNKEEPER_FAREWELL,
  TRAVELLER_LINES,
  type BanterMood,
} from './banter';
import { describeHead, headIndex, jumpHead, stepHead } from './rewind';
import { dressStatusBar, onBackButton } from './native';
import { strangerReset } from './stranger';
import { LESSON_TEXT, loadLearned, lessonFor, remember, type Lesson } from './tutorial';
import { lastPower, powerSquares } from './powerFx';
import {
  ARDAX,
  ARDAX_PALETTE,
  ARMORED,
  ARMORED_PALETTE,
  DRUNKARD,
  DRUNKARD_PALETTE,
  KYRAX,
  KYRAX_PALETTE,
  ROLAIN,
  ROLAIN_PALETTE,
  INNKEEPER,
  INNKEEPER_PALETTE,
  TRAVELLER,
  TRAVELLER_PALETTE,
  WIT,
  WIT_PALETTE,
  WITTEX_PALETTE,
} from './portraits';
import { isMuted, play, setMuted } from './sound';
import { LOCALE_NAME, LOCALES, locale, setLocale, subscribeLocale, t as T, type Locale } from './i18n';
import {
  availableEnchantments,
  beginRun,
  canRideBackUp,
  isOpen,
  learn,
  lendDragon,
  loadRun,
  loseRun,
  lessonEarned,
  nextSeat,
  purseFor,
  purseSoFar,
  roadFor,
  TRIAL,
  TRIALS,
  toggleTrial,
  type Trial,
  PRICE,
  SPELLBOOK,
  resetRun,
  campaignBudget,
  carriedBy,
  clearsUntilTruth,
  knowsTheTruth,
  MANA_CAP,
  oddsInWords,
  offerSpoils,
  POWERUP,
  powerupEffect,
  takePowerup,
  type Powerup,
  opensTheShop,
  RELIC,
  rollDrop,
  seeSorcerer,
  takeRelic,
  winSeat,
  type BoardMode,
  type RunState,
  hasUnreadableSave,
  recoverSave,
} from './run';
import { Shop } from './Shop';
import { Stats } from './StatsPage';
import {
  KYRAX_BOUND_STILL,
  KYRAX_RETURN,
  PROLOGUE,
  ROLAIN_LENDS,
  STORY,
  drawCard,
  seatFallCard,
  relicCard,
  runOverCard,
  type DrawReason,
  type StoryCard,
} from './story';
import { online, type OnlineSnapshot } from './online';
import { forgetPendingThoughts, think } from './think';
import { recordGame, sideOf } from './stats';

const STORAGE_KEY = 'enchanted-chess:v2';

/** Whether this build has a game server behind it.
 *
 *  The campaign is entirely client-side — engine, search and all seven seats run in a worker
 *  in the browser — so it ships as a static bundle with no backend at all. Online play is the
 *  one thing that needs the Node process, and a static host has none. Rather than let the
 *  matchmaking screen sit spinning against nothing, the build that ships without a server says
 *  "coming soon" and means it. The container sets `VITE_ONLINE=1` and gets the real thing. */
const ONLINE_ENABLED =
  (import.meta as { env?: Record<string, string> }).env?.VITE_ONLINE === '1';

/** Whether the board shows the tools that exist for building the game rather than playing it.
 *
 *  Undo, Load position and Export are how a designer interrogates a position; against a seat
 *  on the road they are a cheat button, a save-state editor and a debug dump sitting next to
 *  Resign. They stay on in `npm run dev`, where the whole point is to interrogate positions,
 *  and are absent from anything shipped. `VITE_PLAYTEST=1` puts them back in a built copy for
 *  a playtest build.
 *
 *  Flip and Leave go with them: a shipped board offers Resign and Offer draw and nothing else,
 *  so the only ways out of a duel are the two that the game has an opinion about. */
const PLAYTEST_ENABLED =
  (import.meta as { env?: Record<string, string | boolean> }).env?.DEV === true ||
  (import.meta as { env?: Record<string, string> }).env?.VITE_PLAYTEST === '1';
const BENCH_KEY = 'enchanted-chess:bench';
const PROMO_ORDER: PieceType[] = ['q', 'r', 'b', 'n'];
const FACE: Record<House | 'you', { rows: string[]; palette: Record<string, string>; key: string; asset: string }> = {
  drunkard: { rows: DRUNKARD, palette: DRUNKARD_PALETTE, key: 'drunkard', asset: 'drunkard' },
  innkeeper: { rows: INNKEEPER, palette: INNKEEPER_PALETTE, key: 'innkeeper', asset: 'innkeeper' },
  wit: { rows: WIT, palette: WIT_PALETTE, key: 'wit', asset: 'wit' },
  rolain: { rows: ROLAIN, palette: ROLAIN_PALETTE, key: 'rolain', asset: 'rolain' },
  armored: { rows: ARMORED, palette: ARMORED_PALETTE, key: 'armored', asset: 'armored' },
  ardax: { rows: ARDAX, palette: ARDAX_PALETTE, key: 'ardax', asset: 'ardax' },
  kyrax: { rows: KYRAX, palette: KYRAX_PALETTE, key: 'kyrax', asset: 'kyrax' },
  /* The Wit's own face, in Shivlar's colours. Recognising it is the point — he has been sitting
   * in the middle of the road wearing a smaller name, and the eighth table is where the player
   * is supposed to look up and know him.
   *
   * `rows`/`palette` drive the pixel portrait and already recoloured him. `asset` drives the
   * painted one, and pointed at `wit` — so on story cards and the seat card he was the Wit
   * exactly, same pixels, no recolour at all. Half the reveal was landing. */
  wittex: { rows: WIT, palette: WITTEX_PALETTE, key: 'wittex', asset: 'wittex' },
  you: { rows: TRAVELLER, palette: TRAVELLER_PALETTE, key: 'traveller', asset: 'traveller' },
};

function faceAsset(face: (typeof FACE)[House | 'you']): string {
  // WebP, not PNG: identical pixels at roughly a seventh of the bytes, and these portraits were
  // 2.3 MB of a 5 MB download. Re-encode with `npx tsx scripts/portraits.ts`; the PNG masters
  // live in `media/portraits/` and are not shipped.
  return `/portraits/${face.asset}.webp`;
}

/** Story cards are intentionally data-first. This small index lets the presentation layer
 *  give each beat a face without duplicating prose or adding UI-only story objects. */
const STORY_FACE_BY_TITLE: Record<string, House | 'you'> = {
  'The Law of Lothar': 'you',
  'Nowhere To Put A Hand': 'you',
  'A Drawn Board': 'you',
  'The Door Behind The Bar': 'innkeeper',
  'Back To The Inn': 'innkeeper',
  'The Drunken Knight': 'drunkard',
  'A Cup, Freely Given': 'drunkard',
  'The Innkeeper': 'innkeeper',
  'A Fine Game Indeed': 'innkeeper',
  'Princess Rolain': 'rolain',
  'Two Warnings': 'rolain',
  'What Are You Doing Here': 'rolain',
  'The Wit': 'wit',
  'When To Spend It': 'wit',
  'The Armored Knight': 'armored',
  'The Seams': 'armored',
  'Prince Ardax': 'ardax',
  'What Does Not Stay Down': 'ardax',
  'Dark Lord Wittex': 'wittex',
  'The Town Wakes': 'wittex',
  'Dragonlord Kyrax': 'kyrax',
  'The Valley, After': 'kyrax',
  'The Name': 'kyrax',
  'Not A Costume': 'kyrax',
  'The Dragonlord, Still Bound': 'kyrax',
  'He Has Not Moved': 'kyrax',
};

function storyFace(card: StoryCard): House | 'you' {
  // A card that names its own speaker is believed. The title table below it is the older
  // mechanism, kept for the fixed cards that predate `face` — but it can only ever guess, and
  // a title it has never seen becomes the traveller talking to themselves, which is how a
  // drunk knight's dialogue ended up over the player's own portrait.
  return card.face ?? STORY_FACE_BY_TITLE[card.title] ?? 'you';
}

const isHouse = (o: Setup['opponent']): o is House => o !== 'table' && o !== 'online';

/* How a drawn game is announced.
 *
 * This interpolated the reason straight out of the status object, so the line that closes a
 * game read "Draw by fifty-move", "Draw by threefold" and "Draw by material" — enum keys with
 * a preposition in front of them. Every other ending on this screen is a sentence: "Checkmate.
 * White wins", "Stalemate. The game is drawn", "Black wins on time". These are now too. */
const DRAW_REASON: Record<DrawReason, string> = {
  'fifty-move': 'Drawn. Fifty moves with nothing taken and no pawn moved',
  threefold: 'Drawn. The same position for the third time',
  material: 'Drawn. Neither side has the material to mate',
  agreement: 'Draw by agreement',
  stalemate: 'Stalemate. The game is drawn',
};

const POWER_NAME: Record<PowerName, string> = {
  teleport: 'Teleport',
  relocate: 'Relocate',
  decree: 'Decree',
  revive: 'Revive',
  doom: 'Destined Death',
  chrono: 'Time Manipulation',
};

type Phase =
  | 'home'
  | 'story'
  | 'online'
  | 'house'
  | 'rules'
  | 'drills'
  | 'chest'
  | 'friendly'
  | 'spoils'
  | 'trials'
  | 'shop'
  | 'ledger'
  | 'mode'
  | 'build-w'
  | 'build-b'
  | 'reveal'
  | 'game';

/** How long a speech bubble stays up, from how long it takes to read.
 *
 *  It used to be a flat three seconds, which was right when every line was "Mnnf." or "Taken."
 *  The road talks properly now: the Wit gives himself away in twenty words when he loses, and
 *  Rolain's one lucid moment runs to twenty-three. Three seconds is about half what those need,
 *  and hers surfaces on roughly one beating in five — so the most important line in the story
 *  was the one most likely to be missed. Roughly 200 words a minute, with a floor for the short
 *  jabs and a ceiling so nothing parks on the board. */
function dwellFor(text: string): number {
  return Math.min(11_000, 2_200 + text.trim().split(/\s+/).length * 300);
}

/** The cheapest thing the Sorcerer still has for you, or Infinity when the book is full. Used
 *  only to decide whether the home screen should say he has something in your price range,
 *  which is the nudge that turns "I have gold" into "I should go spend it". */
function cheapestUnlearned(run: RunState): number {
  const left = SPELLBOOK.filter((e) => !run.taught.includes(e)).map((e) => PRICE[e]);
  return left.length ? Math.min(...left) : Infinity;
}

/** The bench stores a standing loadout written from White's side. Mirrored onto Black's
 *  squares when it is used as a prefill (a1↔a8, b2↔b7, …). */
function mirrorLoadout(loadout: Loadout): Loadout {
  const enchantments: Record<string, (typeof loadout.enchantments)[string]> = {};
  for (const [square, ench] of Object.entries(loadout.enchantments)) {
    enchantments[`${square[0]}${9 - Number(square[1])}`] = ench;
  }
  // The words come across too. Mirroring dropped them, so a standing loadout reused from the
  // other side of the board silently fell back to a single-word King.
  return { enchantments, power: loadout.power, powers: loadout.powers };
}

function loadBench(): Loadout {
  try {
    const raw = localStorage.getItem(BENCH_KEY);
    return raw ? (JSON.parse(raw) as Loadout) : emptyLoadout();
  } catch {
    return emptyLoadout();
  }
}

interface Setup {
  back: PieceType[] | null;
  white: Loadout;
  black: Loadout;
  control: TimeControlId;
  /** Who is opposite: the person next to you, one of the regulars, or a stranger online. */
  opponent: 'table' | 'online' | House;
  /** Rolain's dragon, lent after your first fall at Kyrax's table. Shielded, and yours for
   *  every attempt on him after that. */
  boon?: boolean;
  /** Set on the road until Rolain has fallen: the traveller's King may not call at all. */
  silentKing?: boolean;
  /** The player's mana on the road, which grows with powerups. Carried on the setup rather than
   *  passed alongside it so a saved game replays against the purse it was actually built with;
   *  a traveller who gained a point mid-save would otherwise fail to reload. Absent means the
   *  duelling four, which is what every game away from the road uses. */
  budget?: number;
  /** Knights turned to Dragons by Dragonblood. Road only, same reasoning as `budget`. */
  dragons?: number;
  /** Bishops raised by Holy Orders. Road only, same reasoning as `dragons`. */
  archbishops?: number;
  /** Files whose pawns the road has poisoned this walk, fixed for the whole run. */
  venom?: string[];
  /** Rooks carrying Taunt from the Gift of Fortification, this walk. */
  fortifiedRooks?: number;
  /** The keeper's cruelties in force for this game. Road only. */
  trials?: Trial[];
  /** Which colour the traveller has. White everywhere except The Second Chair, where the keeper
   *  turns the board round and the seats move first. */
  player?: Color;
}

interface Saved extends Setup {
  actions: Action[];
}

/** A pending power activation being aimed on the board. */
type PowerMode =
  | { kind: 'teleport'; from: number | null }
  | { kind: 'relocate' }
  | { kind: 'decree' }
  | { kind: 'doom' }
  | { kind: 'revive'; piece: PieceType | null }
  | { kind: 'chrono' };

/** Before Rolain falls, the traveller's King has no Divine Call at all. The cleanest way to
 *  say that to an engine that assumes every King has one is to hand him a power he has already
 *  spent: `powerActions` returns nothing, the button greys out, and mate detection is untouched
 *  because powers are never legal in check anyway. */
/** Lay the run's gifts onto a bare board, for a screen that needs to show what the player has
 *  rather than what they have bought. Mirrors the order `startingState` uses, so the builder and
 *  the board it leads to cannot disagree. `run` is null off the road, where there are no gifts. */
function withRoadGifts(state: GameState, color: Color, run: RunState | null): GameState {
  if (!run) return state;
  let board = state;
  if (run.dragons) board = raiseDragons(board, color, { count: run.dragons });
  if (run.archbishops) board = raiseArchbishops(board, color, { count: run.archbishops });
  if (run.venom.length) board = venomPawn(board, color, run.venom);
  if (run.fortifiedRooks) board = fortifyRooks(board, color, { count: run.fortifiedRooks });
  return board;
}

function silenceKing(state: GameState, color: Color): GameState {
  return {
    ...state,
    // Knows nothing, rather than having already spent it. With three words the old trick — mark
    // it used — would have silenced one of three and left two speakable.
    powers: { ...state.powers, [color]: { ...state.powers[color], powers: [], spent: [] } },
  };
}

/** The board a game starts from. `budget` is the *player's* purse, which on the road grows
 *  with every seat ever beaten; the house always spends the duelling four. */
function startingState(setup: Setup): GameState {
  const control = setup.control === 'untimed' ? null : TIME_CONTROLS[setup.control];
  const base = initialState({
    ...(setup.back ? { back: setup.back } : {}),
    clock: control ? newClock(control) : null,
  });
  // Who is who. Everything below is written in terms of these rather than of white and black,
  // because The Second Chair swaps them and the run's flags — mana, Dragonblood, Rolain's loan,
  // a silent King — belong to the traveller whichever side of the board they sit on.
  const player: Color = setup.player ?? 'w';
  const house: Color = player === 'w' ? 'b' : 'w';
  const ready = applyLoadout(
    applyLoadout(base, player, player === 'w' ? setup.white : setup.black, setup.budget ?? BUDGET),
    house,
    house === 'w' ? setup.white : setup.black,
    // The seat spends its own mana, not the duelling budget. Without this every seat spent
    // whatever `BUDGET` happened to be — which is how raising the duelling purse from four to
    // ten briefly armed the Drunken Knight like the Dragonlord.
    isHouse(setup.opponent) ? HOUSE[setup.opponent].mana : undefined,
  );
  const profile = isHouse(setup.opponent) ? HOUSE[setup.opponent] : undefined;
  const mounted = profile?.dragons ? raiseDragons(ready, house, profile.dragons) : ready;
  const ordained = profile?.archbishops
    ? raiseArchbishops(mounted, house, profile.archbishops)
    : mounted;
  const armored = profile?.armored ? armorArmy(ordained, house, profile.armored) : ordained;
  // The first two tables bring no King's word at all. Teaching seats: a power at the first
  // board is one more rule to explain before the player has even met a shield, and Rolain is
  // where the Divine Call is introduced on both sides at once.
  const spoken = profile && profile.power === null ? silenceKing(armored, house) : armored;

  // `boon` and `silentKing` describe a *run*, and `Setup` is reused between games, so a stale
  // one has leaked into a hotseat duel and into an online match before now. Both call sites
  // clear them — but relying on every future call site to remember is how this family of bug
  // keeps happening. They are re-derived from the opponent here instead: no House opposite,
  // no run, and the flags cannot apply whatever they say.
  const onTheRoad = profile !== undefined;
  // Dragonblood first, then Rolain's loan on top: hers is shielded and yours are not, and
  // `raiseDragons` turns knights nearest the edge inwards, so the counts simply add.
  const evolved =
    onTheRoad && setup.dragons
      ? raiseDragons(spoken, player, { count: setup.dragons, taunt: false })
      : spoken;
  const mounted2 =
    onTheRoad && setup.boon ? raiseDragons(evolved, player, { count: 1, taunt: true }) : evolved;
  const ordained2 =
    onTheRoad && setup.archbishops
      ? raiseArchbishops(mounted2, player, { count: setup.archbishops, taunt: false })
      : mounted2;
  // The road's own gifts, applied after the loadout so they can never overwrite an enchantment
  // the player spent mana on: both helpers skip a piece that already carries one.
  const venomed =
    onTheRoad && setup.venom?.length
      ? venomPawn(ordained2, player, setup.venom)
      : ordained2;
  const fortified =
    onTheRoad && setup.fortifiedRooks
      ? fortifyRooks(venomed, player, { count: setup.fortifiedRooks })
      : venomed;
  return onTheRoad && setup.silentKing ? silenceKing(fortified, player) : fortified;
}

/* Replay the log, and say whether it reached the end.
 *
 * An action log is only meaningful under the rules that produced it, and the rules here move:
 * a power's cost changes, a bind lasts two turns instead of one, and a move that was legal in
 * the version that wrote the save is refused by the version reading it. The old code broke out
 * of the loop on the first refusal and returned the states it had — so an update could sit the
 * player back down twelve moves earlier in the same game, with no sign anything had happened,
 * and the save effect would then write that shortened log straight back over the full one.
 *
 * Losing an unfinished game to an update is a fair price. Silently rewinding one, and then
 * destroying the record of what really happened, is not. */
function replay(saved: Saved): { states: GameState[]; complete: boolean } {
  const states = [startingState(saved)];
  for (const action of saved.actions) {
    const next = applyAction(states[states.length - 1], action);
    if (isError(next)) return { states, complete: false };
    states.push(next);
  }
  return { states, complete: true };
}

/** The board in progress, or null — but never a partial one.
 *
 *  Only the unfinished *game* is at stake here. Campaign progress lives under a different key
 *  and is never touched by this path, which is the division that matters: an update may cost
 *  you the game you were halfway through, and must never cost you the road you walked to reach
 *  it. See `loadRun`. */
function loadSaved(): { setup: Setup; states: GameState[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    const { states, complete } = replay(saved);
    if (!complete) {
      // Written under rules this build no longer plays. Drop the board, keep the log where it
      // is: it costs nothing, and it is the only evidence of what the old rules allowed.
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem('enchanted-chess:v2.stale', raw);
      return null;
    }
    return { setup: saved, states };
  } catch {
    return null;
  }
}

export default function App() {
  const restored = useMemo(loadSaved, []);
  const [phase, setPhase] = useState<Phase>('home');
  const [setup, setSetup] = useState<Setup>(
    restored?.setup ?? {
      back: null,
      white: emptyLoadout(),
      black: emptyLoadout(),
      control: '3+2',
      opponent: 'innkeeper',
    },
  );
  const [bench, setBench] = useState<Loadout>(loadBench);
  /* The screen listens for the language, because the screen is what renders the strings. */
  useSyncExternalStore(subscribeLocale, locale);
  const [run, setRun] = useState<RunState>(loadRun);
  const [salvage, setSalvage] = useState(hasUnreadableSave);
  const won = run.progress;
  const [net, setNet] = useState<OnlineSnapshot>(online.current);
  const [card, setCard] = useState<{ card: StoryCard; then: () => void } | null>(null);
  /** The purse landing after a seat falls, shown for a beat before the story card. */
  const [paid, setPaid] = useState<number | null>(null);
  /** The three spoils on the table after a seat's first fall, and where to go once one is
   *  taken. Held here rather than derived because the draw must not be re-rolled on re-render:
   *  a player watching the options shuffle under the cursor is a player who has been robbed. */
  const [offer, setOffer] = useState<{ spoils: Powerup[]; then: 'home' | 'house' } | null>(null);
  useEffect(() => online.subscribe(setNet), []);

  /* A change of screen is a change of page, and a page starts at the top.
   *
   * Found on an Android emulator, invisible on a desktop where every screen fits without
   * scrolling: the prologue is long enough on a phone to need two swipes, and the inn then
   * inherited that offset. You arrived at the road already scrolled past the one seat you are
   * allowed to play, looking at a column of LOCKED — the game's first impression being that it
   * is closed. Phase only, deliberately: `game` covers the whole duel, so this never yanks the
   * board out from under a player mid-move. */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  // The server drives an online game: when it sends a position, that is the position.
  useEffect(() => {
    if (!net.state) return;
    const arrived = net.state;
    // Keep the positions we have seen so the chronicle reads like any other game. The server
    // is still the only board: we append what it sends, we never derive a position ourselves.
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      return last && arrived.ply > last.ply ? [...prev, arrived] : [arrived];
    });
    setPhase((current) => (current === 'reveal' ? current : 'game'));
  }, [net.state]);

  // Being matched drops you straight into building your army for that board.
  useEffect(() => {
    if (net.you) setFlipped(net.you === 'b');
  }, [net.you]);

  useEffect(() => {
    if (net.status === 'loadout' && net.you) {
      setSetup((s) => ({
        ...s,
        back: net.back,
        control: net.control,
        opponent: 'online',
        // A stranger's game inherits nothing from the road: what that means, and why this is
        // the one path that has to say so itself, is in `strangerReset`.
        ...strangerReset(net.you),
      }));
      setPhase(net.you === 'w' ? 'build-w' : 'build-b');
    }
  }, [net.status, net.you]);
  const [history, setHistory] = useState<GameState[]>(restored?.states ?? []);
  const [selected, setSelected] = useState<number | null>(null);
  const [powerMode, setPowerMode] = useState<PowerMode | null>(null);
  const [deny, setDeny] = useState<number | null>(null);
  // Black at the bottom when the keeper has turned the board round: a traveller should always
  // be looking at their own men.
  const [flipped, setFlipped] = useState(false);
  /** Rewind. An index into `history`, or null for "the board as it stands". Looking back is
   *  not taking back: the position on screen changes, the game does not. Undo is a playtest
   *  tool and stays one; this is the thing every traveller wants mid-game — to see the board
   *  three moves ago without asking anyone's permission. */
  const [reviewAt, setReviewAt] = useState<number | null>(null);
  /** `commit` is a stable callback, so it reads the house's colour through a ref rather than
   *  closing over it and going stale the moment a trial is toggled. */
  const houseColorRef = useRef<Color>('b');
  const [muted, setMutedState] = useState(isMuted());
  const [promo, setPromo] = useState<{ from: number; to: number; swap?: boolean } | null>(null);
  /** A square an Archbishop can both take and bind. Taking and binding are different turns with
   *  different prices, so the choice is the player's — same reasoning as the promotion picker,
   *  and the same shape. Without it the capture simply won and the binding was unreachable. */
  const [bindChoice, setBindChoice] = useState<{ from: number; to: number } | null>(null);
  /* Chess960 can start a King next door to the square it castles onto — King on b1 with a rook
   * on a1, and queen-side castling lands the King on c1, which is also an ordinary step. Both
   * are legal, they are different moves, and the square cannot be allowed to pick one quietly:
   * it did, and it always picked the step, so castling from those back ranks was unreachable. */
  const [castleChoice, setCastleChoice] = useState<{ step: MoveAction; castle: MoveAction } | null>(
    null,
  );
  const [loader, setLoader] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const keepSelectionRef = useRef(false);
  // Speech shows as a bubble beside the speaker's portrait and fades after a few seconds.
  const [bubbles, setBubbles] = useState<{ house: string | null; you: string | null }>({
    house: null,
    you: null,
  });
  const [retortOpen, setRetortOpen] = useState(false);
  /** A story card sitting on a finished board can be pushed aside to look at the position. */
  const [cardAside, setCardAside] = useState(false);

  /* Android's back button, and the status bar. Both no-ops in a browser — see `native.ts`.
   *
   * Back is read as "up one screen", innermost thing first: a modal, then a story card that is
   * standing on a board, then the board itself, then any screen that is not the inn. Only at
   * the inn does back mean leave, which is what an Android user expects and what a Play
   * reviewer will check within the first minute. The handler is bound once and reads live
   * state through a ref, because re-registering it on every phase change would race. */
  const backRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    void dressStatusBar();
    let remove = () => {};
    void onBackButton(() => backRef.current()).then((off) => {
      remove = off;
    });
    return () => remove();
  }, []);
  // A new beat always arrives in front of the board, never behind it.
  useEffect(() => {
    setCardAside(false);
  }, [card]);
  const bubbleTimers = useRef<{ house?: number; you?: number }>({});
  const sayRef = useRef<(who: 'house' | 'you', text: string, teaching?: boolean) => void>(() => {});
  /* When the house bubble comes free, and until when a lesson owns it.
   *
   * Teaching and banter share one bubble, and the seat talks on nearly every move. A lesson was
   * being posted and then overwritten a beat later by the greeting or by "…that's a good
   * question, that" — while still being recorded as taught. Told once, ever, and never read.
   * Banter is worth nothing and can be dropped; a lesson is worth the whole tutorial and waits
   * its turn instead. Arbitrated here rather than at each call site because there are five of
   * them and the sixth is the one that would break it again. */
  const houseFreeAt = useRef(0);
  const teachingUntil = useRef(0);
  const say = useCallback((who: 'house' | 'you', text: string, teaching = false) => {
    if (who === 'house' && !teaching && Date.now() < teachingUntil.current) return;
    setBubbles((prev) => ({ ...prev, [who]: text }));
    window.clearTimeout(bubbleTimers.current[who]);
    const dwell = dwellFor(text);
    if (who === 'house') houseFreeAt.current = Date.now() + dwell;
    if (teaching) teachingUntil.current = Date.now() + dwell;
    bubbleTimers.current[who] = window.setTimeout(() => {
      setBubbles((prev) => ({ ...prev, [who]: null }));
    }, dwell);
  }, []);
  /* `commit` and the tutorial effect reach the bubble through this ref rather than through `say`
   * directly, so that neither has to list it as a dependency and re-run on every render. It was
   * declared and never assigned, which made both of them call the no-op default: the Innkeeper's
   * lessons and every line of commentary on the player's own moves went nowhere, quietly, while
   * the lessons were still recorded as taught. `say` is stable, so one assignment holds. */
  sayRef.current = say;
  const [drag, setDrag] = useState<{
    from: number;
    x: number;
    y: number;
    over: number | null;
  } | null>(null);

  const state = history[history.length - 1] ?? null;

  /* The Innkeeper teaching the parts that are not chess.
   *
   * He speaks when the situation is actually on the board — a warning about Poison on move one
   * is a rule, the same warning as your knight lines the pawn up is advice — and once each,
   * ever, across the whole campaign. Only on the road: a duel between two people who chose
   * their own armies does not need coaching, and hearing it there would be the game explaining
   * a decision they had just made on purpose.
   */
  const [learned, setLearned] = useState<Lesson[]>(loadLearned);
  useEffect(() => {
    if (!state || state.status.kind !== 'ongoing') return;
    if (!isHouse(setupRef.current.opponent)) return;
    const player: Color = setupRef.current.player ?? 'w';
    const lesson = lessonFor(state, player, learned);
    if (!lesson) return;
    // A beat behind the move, so his line lands after the board has settled rather than on top
    // of the piece still arriving.
    // Re-checked at fire time, not just scheduled around: the seat's greeting lands in the same
    // breath as the first lesson of a run, and whichever spoke second used to win.
    let timer = 0;
    const speak = () => {
      const busy = houseFreeAt.current - Date.now();
      if (busy > 0) {
        timer = window.setTimeout(speak, busy + 400);
        return;
      }
      sayRef.current('house', LESSON_TEXT[lesson], true);
      setLearned((prev) => remember(prev, lesson));
    };
    timer = window.setTimeout(speak, 700);
    return () => window.clearTimeout(timer);
  }, [state?.ply, state?.status.kind, learned]);

  /* A King power costs a whole turn and can move a piece across the board, freeze one, or
   * bring one back from the dead — and the board used to simply look different afterwards,
   * with no sign that anything had been spent. Reported as: "it seems very abrupt as to what
   * happened." A move at least has a piece leaving somewhere and arriving somewhere; a power
   * had nothing to watch.
   *
   * Read off the state's own log rather than off the click handler, so your power, the
   * opponent's, and one replayed from a server all announce themselves the same way instead of
   * each needing its own hook. */
  const [powerFx, setPowerFx] = useState<{ power: PowerName; squares: number[] } | null>(null);
  useEffect(() => {
    const played = lastPower(state);
    if (!played) return;
    const before = history[history.length - 2];
    if (!before) return;
    setPowerFx({ power: played.power, squares: powerSquares(before, state!, played) });
    // Long enough to notice and follow, short enough not to sit in the way of the reply.
    const done = setTimeout(() => setPowerFx(null), 1800);
    return () => clearTimeout(done);
  }, [state?.ply]);

  /* A shield-break announced the same way a power is: derived from the log, so mine, the
   * seat's, and a replayed one all flash alike. The ring bursts on the *target* — the attacker
   * staying put is the entire content of rule T2, and the effect is how the rule is felt. */
  const [breakFx, setBreakFx] = useState<number | null>(null);
  useEffect(() => {
    const last = state?.log[state.log.length - 1];
    if (!last || last.type !== 'shieldBreak') return;
    setBreakFx(last.target);
    const done = setTimeout(() => setBreakFx(null), 600);
    return () => clearTimeout(done);
  }, [state?.ply]);

  /** Every rule, every legal move and every commit reads `state`, which is always the live
   *  position. Only the display reads `shown`. Keeping those two names apart is what makes
   *  rewind safe: there is no path by which a rewound board can be played from. */
  const reviewing = reviewAt !== null && history.length > 0;

  // Android back, read as "up one screen", innermost thing first. Each branch returns true to
  // say the press was used; falling off the end returns false and only then does the shell
  // close the app. Assigned on every render so it always sees live state, and deliberately
  // placed above the phase early-returns — inside one of those, `phase` is already narrowed
  // and the last branch silently becomes unreachable.
  backRef.current = () => {
    if (loader !== null) {
      setLoader(null);
      return true;
    }
    if (promo || bindChoice || castleChoice) {
      setPromo(null);
      setBindChoice(null);
      setCastleChoice(null);
      return true;
    }
    if (card && !cardAside) {
      // Step the card aside rather than dismissing it: `card.then` carries the run forward.
      setCardAside(true);
      return true;
    }
    if (reviewing) {
      setReviewAt(null);
      return true;
    }
    if (powerMode || selected !== null) {
      setPowerMode(null);
      setSelected(null);
      return true;
    }
    if (phase !== 'home') {
      setPhase('home');
      return true;
    }
    return false;
  };
  const shown = reviewing ? (history[headIndex(reviewAt, history.length)] ?? state) : state;
  const setupRef = useRef(setup);
  setupRef.current = setup;

  const moves = useMemo(() => (state ? legalMoves(state) : []), [state]);
  const breaks = useMemo(() => (state ? shieldBreakActions(state) : []), [state]);
  const binds = useMemo(() => (state ? bindActions(state) : []), [state]);
  /* The Squire's trade. It is a turn like any other and the board had no idea it existed:
   * `swap` appeared nowhere in this file, so an enchantment a player can buy from the Sorcerer
   * for twelve gold — with a drill of its own teaching how it works — could not be played once
   * in a real game. */
  const swaps = useMemo(() => (state ? swapActions(state, state.turn) : []), [state]);
  const powers = useMemo(
    () => (state && powerMode ? powerActions(state) : []),
    [state, powerMode],
  );

  const targets = useMemo(() => {
    const map = new Map<number, MoveAction[]>();
    if (selected === null) return map;
    for (const m of moves) {
      if (m.from !== selected) continue;
      map.set(m.to, [...(map.get(m.to) ?? []), m]);
    }
    return map;
  }, [moves, selected]);

  const breakTargets = useMemo(() => {
    if (selected === null) return new Set<number>();
    return new Set(breaks.filter((b) => b.from === selected).map((b) => b.target));
  }, [breaks, selected]);

  /** Where the selected Squire may send its Herald — and back. */
  const swapTargets = useMemo(() => {
    const map = new Map<number, SwapAction[]>();
    if (selected === null) return map;
    for (const s of swaps) {
      if (s.from !== selected) continue;
      map.set(s.to, [...(map.get(s.to) ?? []), s]);
    }
    return map;
  }, [swaps, selected]);

  const bindTargets = useMemo(() => {
    if (selected === null) return new Set<number>();
    return new Set(binds.filter((b) => b.from === selected).map((b) => b.target));
  }, [binds, selected]);

  /* Empty while rewinding: a flash belongs to the live board, and lighting squares on a
     position the player has scrolled back to would claim something just happened when it did
     not. */
  const powerFlashSquares = useMemo(
    () => new Set<number>(reviewing ? [] : (powerFx?.squares ?? [])),
    [powerFx, reviewing],
  );

  const powerTargets = useMemo(() => {
    if (!powerMode) return new Set<number>();
    const out = new Set<number>();
    for (const action of powers) {
      const args = action.args;
      if (powerMode.kind === 'teleport' && args.kind === 'teleport') {
        if (powerMode.from === null) out.add(args.from);
        else if (args.from === powerMode.from) out.add(args.to);
      } else if (powerMode.kind === 'relocate' && args.kind === 'relocate') {
        out.add(args.with);
      } else if (powerMode.kind === 'decree' && args.kind === 'decree') {
        out.add(args.target);
      } else if (powerMode.kind === 'doom' && args.kind === 'doom') {
        out.add(args.target);
      } else if (powerMode.kind === 'revive' && args.kind === 'revive') {
        if (powerMode.piece && args.piece === powerMode.piece) out.add(args.to);
      }
    }
    return out;
  }, [powerMode, powers]);

  useEffect(() => {
    if (phase !== 'game' || !history.length) return;
    const actions = history.slice(1).map((s) => s.log[s.log.length - 1]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...setup, actions } satisfies Saved));
  }, [history, setup, phase]);

  // Tally every finished game for the balance slate at the bar (spec §7).
  useEffect(() => {
    if (!state || state.status.kind === 'ongoing' || phase !== 'game') return;
    const outcome =
      state.status.kind === 'checkmate' || state.status.kind === 'resigned'
        ? state.status.winner
        : 'draw';
    const reason =
      state.status.kind === 'draw' ? state.status.reason : state.status.kind;
    if (isHouse(setup.opponent)) {
      const decisive =
        state.status.kind === 'checkmate' ||
        state.status.kind === 'resigned' ||
        state.status.kind === 'flagged';
      const seat = setup.opponent;

      if (decisive && state.status.winner === 'w') {
        // The seat falls: it pays its purse, and whatever gate it guards opens for good.
        // The drop is rolled once, here, and only against a book that does not already hold it.
        const found = rollDrop(run, seat);
        // Spoils are offered on a seat's *first* fall only. A powerup you can farm is a chore
        // with a reward attached — beat the drunk, resign, repeat — so the only way to get more
        // of them is to get further, which is the direction the game wants the player facing.
        // Every seat that falls puts something on the table, not only the first time it does.
        // Spoils on first blood alone meant a run's shape was fixed by which seats you had ever
        // beaten rather than by this walk, and a walk with nothing to decide between boards is
        // a ladder with a story on it.
        const spoils = offerSpoils(run);
        setRun((r) => (found ? takeRelic(winSeat(r, seat), found) : winSeat(r, seat)));
        setPaid(purseFor(run, seat));
        // The Dragonlord tells you a little more each time he falls, and the fifth time he
        // gives you the name. Read *before* `winSeat` lands, so the count is what it was when
        // he sat down.
        // What a seat says on a return depends on how much of the story the traveller is
        // carrying: before the Dragonlord gives up the name, after it, and after that name has
        // been taken south and turned out not to be the end of it.
        const base = seatFallCard(seat, run.beaten[seat] ?? 0, {
          knowsTruth: knowsTheTruth(run),
          freed: run.freed,
        });
        const beat = found ? relicCard(base, found) : base;
        // Beating the last seat ends the attempt, so the epilogue returns to the inn. Sending
        // it back to the road put the player on a ladder they had just finished, every seat
        // marked beaten and still clickable, under a counter reading "seat 8/7".
        // The last seat of *this* traveller's road, which grows by one once the truth is out.
        const road = roadFor(run);
        const cleared = seat === road[road.length - 1];
        const onwards = () => {
          if (spoils.length) {
            setOffer({ spoils, then: cleared ? 'home' : 'house' });
            setPhase('spoils');
            return;
          }
          setPhase(cleared ? 'home' : 'house');
        };
        setTimeout(() => setCard({ card: beat, then: onwards }), 1900);
      } else if (seat === 'kyrax' && canRideBackUp(run)) {
        // The one defeat the road is built around, and the only one that does not end an
        // attempt: Rolain is in the road with her dragon off her hand before you have finished
        // walking out of the hall. Once, ever.
        setRun((r) => lendDragon(r));
        setTimeout(() => setCard({ card: ROLAIN_LENDS, then: returnToKyrax }), 900);
      } else {
        // Any other defeat, and a draw, ends the attempt. The gold is already banked.
        const purse = purseSoFar(run);
        const reached = run.progress.length;
        // Both asked before `loseRun`, which is what actually opens the room and banks the
        // mana — afterwards `best` has already risen and the lesson reads as zero.
        const opening = opensTheShop(run);
        const lesson = lessonEarned(run);
        setRun((r) => loseRun(r));
        // A draw is not a defeat and must not be narrated as one. A stalemate especially: it is
        // usually something the player *did*, and telling them "the walk back is short and
        // nobody comments on it" for a result they engineered reads as the game not watching.
        const drawn =
          state.status.kind === 'stalemate'
            ? drawCard('stalemate', opening)
            : state.status.kind === 'draw'
              ? drawCard(state.status.reason, opening)
              : null;
        setTimeout(
          () =>
            setCard({
              card: drawn ?? runOverCard(reached, purse, run.sorcerer, opening, lesson, run.attempts, run.best),
              then: () => setPhase('home'),
            }),
          900,
        );
      }
    }
    recordGame({
      at: Date.now(),
      mode: setup.back ? '960' : 'classic',
      outcome,
      reason,
      sides: {
        w: sideOf(setup.white, state.powers.w.reserve),
        b: sideOf(setup.black, state.powers.b.reserve),
      },
    });
    // Only tally the transition into a finished status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status.kind]);

  useEffect(() => {
    if (deny === null) return;
    const timer = setTimeout(() => setDeny(null), 320);
    return () => clearTimeout(timer);
  }, [deny]);

  useEffect(() => {
    if (paid === null) return;
    const timer = setTimeout(() => setPaid(null), 1900);
    return () => clearTimeout(timer);
  }, [paid]);

  // A finished or abandoned attempt has no ladder to stand on: every seat on the road would be
  // clickable and would deal a fresh duel outside any run. Belt and braces — the epilogue now
  // routes to the inn directly, but nothing should be able to strand a player there.
  useEffect(() => {
    if (phase === 'house' && !run.active) setPhase('home');
  }, [phase, run.active]);

  /** The lifted piece follows the finger through the DOM rather than through React state.
   *
   *  Reported from a phone as "jitter on the board", and it was two separate things. The
   *  browser was running its own pan gesture at the same time as the drag, so the board scrolled
   *  under the finger while the piece tracked it — that half is `touch-action: none` in the
   *  stylesheet. The other half was here: every `pointermove` called `setDrag`, re-rendering
   *  sixty-four squares and every overlay on them, at pointer rate — which on a modern phone is
   *  faster than the display can draw. Now the ghost's position is written straight to its own
   *  element, and React is only told when the square *under* the finger changes, which is the
   *  only part of the drag it actually renders. */
  const ghostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!drag) return;
    const from = drag.from;
    let frame = 0;
    let last: { x: number; y: number } | null = null;

    const paint = () => {
      frame = 0;
      if (!last || !ghostRef.current) return;
      ghostRef.current.style.transform = `translate3d(${last.x}px, ${last.y}px, 0)`;
      const over = squareUnder(last.x, last.y);
      // Only a change of square is worth a render; the pixels are already on screen.
      setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
    };

    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      // Coalesce to one update per frame however fast the pointer reports.
      if (!frame) frame = requestAnimationFrame(paint);
      // Stop the page treating the same gesture as a scroll on browsers that ignore
      // `touch-action` for an already-started gesture.
      if (e.cancelable) e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (frame) cancelAnimationFrame(frame);
      const target = squareUnder(e.clientX, e.clientY);
      setDrag(null);
      if (target !== null && target !== from) dropOn(from, target);
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // Bound once per lift. Without this the listeners were torn down and rebuilt on every
    // render, which during a drag meant every frame.
  }, [drag?.from]);

  // --- clocks -------------------------------------------------------------
  const turnStartRef = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    turnStartRef.current = Date.now();
    setNow(Date.now());
  }, [state?.ply, phase]);

  useEffect(() => {
    if (!state?.clock || state.status.kind !== 'ongoing' || phase !== 'game') return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [state?.clock, state?.status.kind, phase]);

  const elapsedMs =
    state?.clock && state.status.kind === 'ongoing' && phase === 'game'
      ? Math.max(0, now - turnStartRef.current)
      : 0;

  const remainingFor = (color: Color): number | null => {
    if (!state?.clock) return null;
    return state.clock[color].ms - (state.turn === color ? elapsedMs : 0);
  };


  const refuse = useCallback((square: number | null) => {
    play('illegal');
    if (square !== null) setDeny(square);
  }, []);

  const commit = useCallback(
    (raw: Action) => {
      // Every turn-consuming action carries the time the mover burned on it, so the action
      // log alone replays the clocks exactly.
      const spentMs = Math.max(0, Date.now() - turnStartRef.current);
      const action: Action =
        raw.type === 'move' || raw.type === 'shieldBreak' || raw.type === 'power' || raw.type === 'flag'
          ? { ...raw, spentMs }
          : raw;
      if (setupRef.current.opponent === 'online') {
        // The server owns the board. Send the intent and wait to be told what happened.
        online.play(action);
        if (action.type === 'move') play(state?.board[action.to] ? 'capture' : 'move');
        setSelected(null);
        setPowerMode(null);
        setPromo(null);
        return;
      }
      setHistory((prev) => {
        const current = prev[prev.length - 1];
        const next = applyAction(current, action);
        if (isError(next)) {
          refuse(action.type === 'move' ? action.to : null);
          return prev;
        }
        if (action.type === 'shieldBreak') play('shieldBreak');
        else if (action.type === 'power') play('power');
        else if (action.type === 'move') {
          if (action.promo) play('promote');
          else if (current.board[action.to]) play('capture');
          else play('move');
        }
        if (next.status.kind !== 'ongoing') setTimeout(() => play('gameEnd'), 220);
        else if (inCheck(next, next.turn)) setTimeout(() => play('check'), 150);
        if (
          isHouse(setupRef.current.opponent) &&
          current.turn !== houseColorRef.current &&
          worthRemarking(current, action, next, HOUSE[setupRef.current.opponent as House].banter)
        ) {
          sayRef.current(
            'house',
            houseCommentary(
              current,
              action,
              next,
              houseColorRef.current,
              setupRef.current.opponent as House,
            ),
          );
        }
        return [...prev, next];
      });
      setSelected(null);
      setPowerMode(null);
      setPromo(null);
    },
    [refuse],
  );

  /** The Innkeeper says something about the position it just found itself in. */
  const houseSpeaks = useCallback(
    (mood: BanterMood, voice: House) => say('house', houseSays(voice, mood)),
    [say],
  );

  // The house plays its own colour on its own, after a short pause so the move can be seen
  // landing. Black in every ordinary walk; White when the keeper has turned the board round.
  const houseColor: Color = (setup.player ?? 'w') === 'w' ? 'b' : 'w';
  houseColorRef.current = houseColor;
  /* The first two seats bring no King's word, and the engine expresses that by handing their
   * King a power already spent — which is the right trick for legality and the wrong thing to
   * say out loud. Without this the Drunken Knight's bar reads "⚡ Teleport · used" from move
   * one: a power he never had, marked as though he had already spent it. On a board whose whole
   * law is that everything is knowable, that is not a cosmetic slip, it is a false statement. */
  const houseSilent = isHouse(setup.opponent) && HOUSE[setup.opponent].power === null;
  const silentFor = (color: Color) => (color === houseColor ? houseSilent : Boolean(setup.silentKing));
  // A traveller in the second chair looks at their own men, so the board turns with them. Set
  // when a game begins rather than held as derived state, because the manual flip button has to
  // keep working afterwards.
  useEffect(() => {
    if (phase === 'game') setFlipped((setup.player ?? 'w') === 'b');
  }, [phase, setup.player]);
  const thinking = useRef(false);
  const [pondering, setPondering] = useState(false);
  useEffect(() => {
    if (
      phase !== 'game' ||
      !state ||
      !isHouse(setup.opponent) ||
      state.turn !== houseColor ||
      state.status.kind !== 'ongoing' ||
      thinking.current
    ) {
      return;
    }
    thinking.current = true;
    setPondering(true);
    const voice = setup.opponent as House;
    const profile = HOUSE[voice];
    let dropped = false;

    // A short beat so the move can be seen landing, then the search, off the main thread.
    const timer = setTimeout(() => {
      void think(state, searchOptionsFor(profile)).then((choice) => {
        thinking.current = false;
        setPondering(false);
        if (dropped || !choice) return;
        const before = state;
        commit(choice.action);
        const after = applyAction(before, choice.action);
        const settled = isError(after) ? before : after;
        if (profile.random && Math.random() < 0.35) play('drink');
        if (worthRemarking(before, choice.action, settled, profile.banter)) {
          say('house', houseCommentary(before, choice.action, settled, houseColor, voice));
        }
      });
    }, profile.pauseMs);

    return () => {
      dropped = true;
      clearTimeout(timer);
      thinking.current = false;
      setPondering(false);
    };
  }, [state, phase, setup.opponent, commit, houseSpeaks]);

  // It also has opinions about how the game ended, and about losing pieces.
  useEffect(() => {
    if (phase !== 'game' || !state || !isHouse(setup.opponent)) return;
    const status = state.status;
    if (status.kind === 'ongoing') return;
    const voice = setup.opponent as House;
    if (voice === 'innkeeper') {
      // He says nothing all game, and one thing at the end of it.
      say('house', INNKEEPER_FAREWELL);
    } else if (status.kind === 'checkmate' || status.kind === 'resigned' || status.kind === 'flagged') {
      say('house', houseSays(voice, status.winner === 'b' ? 'win' : 'lose'));
    } else {
      say('house', houseSays(voice, 'draw'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status.kind]);

  useEffect(() => {
    if (phase === 'game' && isHouse(setup.opponent) && HOUSE[setup.opponent].banter > 0) {
      houseSpeaks('greeting', setup.opponent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);


  // Flag fall: the moment the mover's clock reaches zero the game is over on time.
  useEffect(() => {
    if (!state?.clock || state.status.kind !== 'ongoing' || phase !== 'game') return;
    if (state.clock[state.turn].ms - elapsedMs > 0) return;
    commit({ type: 'flag' });
  }, [elapsedMs, state, phase, commit]);

  /** Which board square sits under the pointer right now. */
  const squareUnder = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const attr = el?.closest('[data-square]')?.getAttribute('data-square');
    return attr == null ? null : Number(attr);
  };

  /** Resolve a drop: a move, a promotion prompt, or a shield-break. */
  const dropOn = (from: number, to: number) => {
    const candidates = moves.filter((m) => m.from === from && m.to === to);
    if (candidates.length) {
      if (candidates.some((m) => m.promo)) setPromo({ from, to });
      else commit(candidates[0]);
      return;
    }
    if (breaks.some((b) => b.from === from && b.target === to)) {
      commit({ type: 'shieldBreak', from, target: to });
      return;
    }
    refuse(to);
  };

  const beginDrag = (square: number, event: ReactPointerEvent) => {
    if (reviewing) return;
    if (!state || state.status.kind !== 'ongoing' || powerMode || event.button !== 0) return;
    const piece = state.board[square];
    if (!piece || piece.color !== state.turn) return;
    const hasAction =
      moves.some((m) => m.from === square) || breaks.some((b) => b.from === square);
    if (!hasAction) return;
    if (selected !== square) play('select');
    keepSelectionRef.current = true;
    setSelected(square);
    setDrag({ from: square, x: event.clientX, y: event.clientY, over: square });
  };

  const onSquare = (square: number) => {
    // A rewound board is a picture, not a table. Touching it returns you to the game rather
    // than doing nothing, because a board that ignores you reads as broken.
    if (reviewing) {
      setReviewAt(null);
      return;
    }
    if (!state || state.status.kind !== 'ongoing') return;

    if (powerMode) {
      if (!powerTargets.has(square)) {
        // Not a target: stand the King down and fall through, so the same tap is handled as an
        // ordinary board tap — tapping your own piece goes straight to selecting it. The old
        // code buzzed and stayed armed, which on a phone (no Escape key) had no exit.
        setPowerMode(null);
        play('select');
      } else {
        switch (powerMode.kind) {
        case 'teleport':
          if (powerMode.from === null) {
            play('select');
            setPowerMode({ kind: 'teleport', from: square });
          } else {
            commit({
              type: 'power',
              power: 'teleport',
              args: { kind: 'teleport', from: powerMode.from, to: square },
            });
          }
          return;
        case 'relocate':
          commit({ type: 'power', power: 'relocate', args: { kind: 'relocate', with: square } });
          return;
        case 'decree':
          commit({ type: 'power', power: 'decree', args: { kind: 'decree', target: square } });
          return;
        case 'doom':
          commit({ type: 'power', power: 'doom', args: { kind: 'doom', target: square } });
          return;
          case 'revive':
            if (powerMode.piece) {
              commit({
                type: 'power',
                power: 'revive',
                args: { kind: 'revive', piece: powerMode.piece, to: square },
              });
            }
            return;
        }
      }
    }

    const candidates = targets.get(square);
    if (candidates?.length) {
      const castle = candidates.find((m) => (m.flags ?? []).some((f) => f.startsWith('castle')));
      const step = candidates.find((m) => !(m.flags ?? []).some((f) => f.startsWith('castle')));
      if (candidates.some((m) => m.promo)) setPromo({ from: candidates[0].from, to: square });
      else if (bindTargets.has(square) && selected !== null)
        setBindChoice({ from: selected, to: square });
      // Only in 960, and only from the back ranks that produce the collision.
      else if (castle && step) setCastleChoice({ step, castle });
      else commit(castle ?? candidates[0]);
      return;
    }
    if (breakTargets.has(square) && selected !== null) {
      commit({ type: 'shieldBreak', from: selected, target: square });
      return;
    }
    const trade = swapTargets.get(square);
    if (trade?.length && selected !== null) {
      /* A Herald landing on its crowning rank crowns on arrival, and the engine will not guess
       * which piece — it refuses the swap and says so. Rather than work out here which trades
       * crown, which is the sort of duplicated rule that rots the first time crowning changes,
       * offer the action and let the engine answer: a legal swap is refused for exactly one
       * reason, and that reason is the missing promotion.
       *
       * The first version of this checked `s.promo` on the offered action, which is never set —
       * so it committed an illegal swap, the board buzzed, and the Squire looked broken. */
      if (isError(applyAction(state, trade[0]))) {
        setPromo({ from: selected, to: square, swap: true });
      } else {
        commit(trade[0]);
      }
      return;
    }
    if (bindTargets.has(square) && selected !== null) {
      commit({ type: 'bind', from: selected, target: square });
      return;
    }

    const piece = state.board[square];
    if (piece && piece.color === state.turn) {
      const hasAction =
        moves.some((m) => m.from === square) ||
        breaks.some((b) => b.from === square) ||
        binds.some((b) => b.from === square);
      if (!hasAction) {
        refuse(square);
        setSelected(null);
        return;
      }
      // A press that started a drag already selected this square; don't toggle it back off.
      const keep = keepSelectionRef.current && square === selected;
      keepSelectionRef.current = false;
      if (keep) return;
      play('select');
      setSelected(square === selected ? null : square);
      return;
    }
    if (selected !== null) refuse(square);
    setSelected(null);
  };

  const startPower = (power: PowerName) => {
    if (!state) return;
    // Arming is not committing: the word is only spoken when a target is chosen, so the button
    // is a toggle and a second press stands the King down. Without this, pressing ⚡ meant the
    // power *had* to be used — a misclick became a spent Divine Call.
    if (powerMode?.kind === power) {
      play('select');
      setPowerMode(null);
      return;
    }
    // Per word, not per King: two of the three may be unusable while the third is fine, and a
    // single yes/no for the whole set would refuse a legal call.
    if (powerReason(state, state.turn, power)) {
      refuse(null);
      return;
    }
    play('select');
    setSelected(null);
    if (power === 'chrono') {
      commit({ type: 'power', power: 'chrono', args: { kind: 'chrono' } });
      return;
    }
    setPowerMode(
      power === 'teleport'
        ? { kind: 'teleport', from: null }
        : power === 'revive'
          ? { kind: 'revive', piece: null }
          : { kind: power },
    );
  };

  const sanList = useMemo(
    () => history.slice(1).map((s, i) => toSan(history[i], s.log[s.log.length - 1])),
    [history],
  );

  /** The keyboard handler is bound once and must not go stale as the game grows, so it reads
   *  the length through a ref rather than closing over the array. */
  const historyRef = useRef(history);
  historyRef.current = history;

  /** Jump the review head to the position a chronicle entry produced. */
  const jumpTo = useCallback((ply: number) => {
    setReviewAt(jumpHead(ply, historyRef.current.length));
    setSelected(null);
    setPowerMode(null);
  }, []);

  /** Walk the review head by whole plies. */
  const stepReview = useCallback((delta: number) => {
    setReviewAt((at) => stepHead(at, delta, historyRef.current.length));
    setSelected(null);
    setPowerMode(null);
  }, []);

  useEffect(() => {
    if (phase !== 'game') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepReview(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepReview(1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setReviewAt(historyRef.current.length > 1 ? 0 : null);
        setSelected(null);
        setPowerMode(null);
      } else if (event.key === 'End' || event.key === 'Escape') {
        if (reviewAt === null) return;
        event.preventDefault();
        setReviewAt(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, stepReview, reviewAt]);

  /** The board-style screen. At this table it just starts the duel; on the road it starts the
   *  whole attempt, because the style is the walk's and asking again at every seat was seven
   *  identical decisions per run. */
  /** The board question only exists for the two-player boards now. The road is always classic
   *  and never asks. */
  const chooseBoard = (mode: BoardMode) => {
    beginBuild(mode);
  };

  /** `overrides` exists because of a stale-closure trap: the road calls this from a story
   *  card's callback, and that callback was created during the render where the seat was
   *  clicked — before `setSetup` had landed. Reading `setup` here would therefore see the
   *  *previous* seat's settings, which is how a road duel once handed the Drunken Knight Time
   *  Manipulation in a game with no clock. Anything the caller already knows, it passes. */
  const beginBuild = (mode: 'classic' | '960', overrides: Partial<Setup> = {}) => {
    play('select');
    const merged = { ...setup, ...overrides };
    const back = mode === '960' ? random960Back() : null;
    const base = initialState(back ? { back } : {});
    // The Second Chair puts the traveller on the black side, so the seat builds White's army.
    const asBlack = isHouse(merged.opponent) && run.trials.includes('black');
    const playerColor: Color = asBlack ? 'b' : 'w';
    const seatColor: Color = asBlack ? 'w' : 'b';
    const seatLoadout = isHouse(merged.opponent)
      ? innkeeperLoadout(base, seatColor, {
          timed: merged.control !== 'untimed',
          power: HOUSE[merged.opponent as House].power,
          budget: HOUSE[merged.opponent as House].mana,
        })
      : mirrorLoadout(bench);
    /* The standing army, cut down to what tonight allows: mana falls to the floor when a run
     * ends, the book grows, and the road puts its own gifts on pieces the bench had plans for.
     * Without this a remembered loadout could open the builder already illegal. */
    const playerBudget = isHouse(merged.opponent) ? run.mana : (merged.budget ?? BUDGET);
    const fitted = fitLoadout(withRoadGifts(base, playerColor, isHouse(merged.opponent) ? run : null), playerColor, bench, {
      book: isHouse(merged.opponent) ? availableEnchantments(run) : undefined,
      budget: playerBudget,
      powers: isHouse(merged.opponent) && !run.divineCall ? [] : undefined,
    });
    const next: Setup = {
      back,
      white: asBlack ? seatLoadout : fitted,
      black: asBlack ? fitted : seatLoadout,
      player: playerColor,
      // The Glass puts five minutes on every board, all the way to the wings.
      control:
        isHouse(merged.opponent) && run.trials.includes('timed') ? '5+5' : merged.control,
      opponent: merged.opponent,
      // Both of these are facts about a *road* run — Rolain's lent dragon, and a King who has
      // not yet learned the Divine Call. They live on `setup`, which is reused between games,
      // so without this they leak: a hotseat duel or an online match played after a campaign
      // game inherited the silenced King and told the player to go and beat Princess Rolain.
      boon: isHouse(merged.opponent) ? merged.boon : false,
      silentKing: isHouse(merged.opponent) ? merged.silentKing : false,
      // The road's traveller spends mana and rides whatever Dragonblood has made of his
      // knights. A duel between strangers gets neither: four points each, knights are knights.
      budget: isHouse(merged.opponent) ? campaignBudget(run) : BUDGET,
      dragons: isHouse(merged.opponent) ? run.dragons : 0,
      archbishops: isHouse(merged.opponent) ? run.archbishops : 0,
      venom: isHouse(merged.opponent) ? run.venom : [],
      fortifiedRooks: isHouse(merged.opponent) ? run.fortifiedRooks : 0,
      trials: isHouse(merged.opponent) ? run.trials : [],
    };
    setSetup(next);

    // A builder with nothing in it is a screen you click past. On the road, a traveller who has
    // learned no enchantment and has no Divine Call has literally no decision to make there:
    // 0/4 points, every row greyed, the King silent. Skip straight to the reveal, which is the
    // screen that actually tells them something — what the seat opposite brought.
    const nothingToSpend =
      isHouse(merged.opponent) && !availableEnchantments(run).length && !run.divineCall;
    if (nothingToSpend) {
      setHistory([startingState(next)]);
      setPhase('reveal');
      return;
    }
    setPhase('build-w');
  };

  /** A board that has been dealt but not played on is worth less than the loadout you just
   *  chose, so changing your standing army throws it away and the seat deals again.
   *
   *  Found by playing: buy two enchantments from the Sorcerer, lay them out in the chest, walk
   *  to the table — and sit down to the army you had *before* the shop, silently. The seat
   *  click resumes an in-progress duel rather than dealing a new one, and "in progress" was
   *  true of a board nobody had touched. A game with moves on it is left alone: that one is
   *  real, and taking it away would be worse than the stale army. */
  const discardUnstartedDuel = () => {
    if (history.length > 1) return;
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  };

  /** Play the same pairing again, either straight away or back through the builders. */
  const rematch = (reEdit: boolean) => {
    play('select');
    localStorage.removeItem(STORAGE_KEY);
    setSelected(null);
    setPowerMode(null);
    if (reEdit) {
      setHistory([]);
      setPhase('build-w');
    } else {
      setHistory([startingState(setup)]);
      setPhase('game');
    }
  };

  /** Back up the mountain, this time with Rolain's dragon on your side. Same seat, same army
   *  you built, one shielded dragon more. */
  const returnToKyrax = () => {
    play('select');
    localStorage.removeItem(STORAGE_KEY);
    setSelected(null);
    setPowerMode(null);
    const next: Setup = {
      ...setup,
      opponent: 'kyrax',
      control: 'untimed',
      boon: true,
      // Reaching Kyrax at all means Rolain has fallen, so the King can speak. Spelled out
      // rather than inherited: this was previously right only because of what `setup` happened
      // to be carrying.
      silentKing: false,
    };
    setSetup(next);
    setHistory([startingState(next)]);
    setPhase('game');
  };

  /** Scenario loader: accepts either an exported action log or a serialized GameState, and
   *  continues play from it. Every balance question becomes a 30-second experiment (§3.3). */
  const loadPosition = (text: string) => {
    try {
      const parsed = JSON.parse(text) as Partial<Saved> & Partial<GameState>;
      if (Array.isArray(parsed.board)) {
        setHistory([parsed as GameState]);
      } else if (Array.isArray(parsed.actions)) {
        const loaded: Setup = {
          back: parsed.back ?? null,
          white: parsed.white ?? emptyLoadout(),
          black: parsed.black ?? emptyLoadout(),
          control: parsed.control ?? 'untimed',
          opponent: parsed.opponent ?? 'table',
        };
        const { states, complete } = replay({ ...loaded, actions: parsed.actions });
        if (!complete) {
          // An imported log that stops short is the interesting case, not the boring one: it
          // means this build refuses a move the build that recorded it allowed. Say which move,
          // and load what did replay — that position is the bug report.
          setLoadError(
            `Log diverges at move ${states.length}: this build refuses the action recorded there. ` +
              `Loaded the ${states.length - 1} moves that still replay.`,
          );
        }
        setSetup(loaded);
        setHistory(states);
      } else {
        setLoadError('Expected an exported log (with "actions") or a serialized state.');
        play('illegal');
        return;
      }
      setSelected(null);
      setPowerMode(null);
      setLoadError(null);
      setLoader(null);
      setPhase('game');
      play('power');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'could not parse that');
      play('illegal');
    }
  };

  const saveBench = (next: Loadout) => {
    setBench(next);
    localStorage.setItem(BENCH_KEY, JSON.stringify(next));
  };

  const resumable = Boolean(state && state.status.kind === 'ongoing');
  // A duel already under way on the road *is* the attempt. Offering "continue the attempt"
  // above it sends the player to the ladder, where clicking the same seat starts a fresh
  // game and throws the live one away without asking. Resuming has to be the primary action.
  const midRoadDuel = resumable && isHouse(setup.opponent) && run.active;

  if (phase === 'home') {
    return (
      <Shell bare muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="home">
          <h2 className="home-title">Enchanted Chess</h2>
          <p className="home-sub">{T('home.tagline')}</p>
          {/* No standing explanation here. How the run economy works is told once, on the
              prologue card, when a campaign begins — a home screen is a place to choose from,
              and prose sitting on it permanently gets read once and then becomes furniture. */}
          {(run.gold > 0 || run.attempts > 0) && (
            <div className="run-strip">
              <span className="coin-pill coin-pill-dark">
                <span className="coin-mark">◈</span>
                {run.gold}
              </span>
              <span>
                attempt <strong>{run.attempts + (run.active ? 0 : 1)}</strong>
              </span>
              <span>
                mana <strong>{campaignBudget(run)}</strong>/{MANA_CAP}
              </span>
              <span>
                deepest <strong>{run.best}</strong>/{roadFor(run).length}
              </span>
            {run.trials.length > 0 && (
              /* What you agreed to, kept visible for the whole walk. A player who took three
                 cruelties a week ago and came back to a turned board deserves to be told why
                 rather than left to work it out from the pieces. */
              <span className="trial-strip">
                {run.trials.map((t) => (
                  <span className="trial-chip" key={t}>
                    {TRIAL[t].name}
                  </span>
                ))}
              </span>
            )}

              {run.clears > 0 && (
                <span>
                  cleared <strong>{run.clears}×</strong>
                </span>
              )}
            </div>
          )}
          <div className="home-buttons">
            {midRoadDuel ? (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  play('select');
                  setPhase('game');
                }}
              >
                Back to the table
                <span className="soon">
                  {HOUSE[setup.opponent as House].label} · game in progress
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  play('select');
                  // An attempt is one unbroken walk. Starting one is a decision, not a resume,
                  // and the board style is part of that decision rather than of every seat.
                  if (!run.active) {
                    setSetup((x) => ({ ...x, opponent: nextSeat(run) ?? 'drunkard' }));
                    const walking = beginRun(run);
                    setRun(walking);
                    // The road is always a classic start, so setting out asks nothing: the
                    // first traveller gets the prologue and then the ladder. It used to route
                    // through the board question, which put a Chess960 decision in front of a
                    // player before anything had told them where they were or who holds the
                    // valley.
                    if (walking.attempts === 1) {
                      setCard({ card: PROLOGUE, then: () => setPhase('house') });
                      setPhase('story');
                      return;
                    }
                    setPhase('house');
                    return;
                  }
                  setPhase('house');
                }}
              >
                {run.active ? T('home.road.continue') : T('home.road')}
                {run.active && nextSeat(run) ? (
                  <span className="soon">next: {HOUSE[nextSeat(run)!].label}</span>
                ) : (
                  <span className="soon">
                    {run.attempts === 0 ? T('home.road.first') : T('home.road.again')}
                  </span>
                )}
              </button>
            )}
            {/* A save the browser handed back damaged. It is set aside rather than overwritten
                (see `loadRun`), so the campaign is still there and the usual cause — a write cut
                short — does not repeat. Offering the retry is the whole recovery. */}
            {salvage && (
              <button
                type="button"
                onClick={() => {
                  play('select');
                  const back = recoverSave();
                  if (back) {
                    setRun(back);
                    setSalvage(false);
                  } else {
                    setSalvage(false);
                    play('illegal');
                  }
                }}
              >
                Recover your progress
                <span className="soon">a saved road was unreadable last time — try it again</span>
              </button>
            )}
            {midRoadDuel && (
              <button
                type="button"
                onClick={() => {
                  play('select');
                  setPhase('house');
                }}
              >
                The road
                <span className="soon">see how far you have come</span>
              </button>
            )}
            {/* The Dragonlord falls, and the game does not say that anything is left. He tells
                you himself — "there is a thing I would tell you, and I find I cannot" — but he
                tells you at his table, an hour's walk and a whole run away from the decision to
                go back. A player who clears the road once and stops has not been given a reason
                on the screen where stopping happens. This is that reason, and it counts down. */}
            {(run.beaten.kyrax ?? 0) > 0 && !run.freed && (
              <button
                type="button"
                className="is-new"
                onClick={() => {
                  play('select');
                  setPhase('house');
                }}
              >
                {knowsTheTruth(run) ? 'Go south' : 'Seek the truth'}
                <span className="soon">
                  {knowsTheTruth(run)
                    ? 'the road did not end at his table'
                    : clearsUntilTruth(run) === 1
                      ? 'the Dragonlord will say the name next time he falls'
                      : `something has hold of the Dragonlord · ${clearsUntilTruth(run)} more falls`}
                </span>
              </button>
            )}
            {run.sorcerer ? (
              <button
                type="button"
                // Glistens once, the first time the back room is open, and never again.
                className={run.sorcererSeen ? undefined : 'is-new'}
                onClick={() => {
                  play('select');
                  setRun((r) => seeSorcerer(r));
                  setPhase('shop');
                }}
              >
                The Sorcerer
                <span className="soon">
                  {run.gold} gold · {run.taught.length}/{SPELLBOOK.length} learned
                  {run.gold >= cheapestUnlearned(run) ? ' · he has something you can afford' : ''}
                </span>
              </button>
            ) : null}
            {run.freed && (
              <button type="button" onClick={() => { play('select'); setPhase('trials'); }}>
                The Keeper's Offer
                <span className="soon">
                  {run.trials.length
                    ? `${run.trials.length} of 3 taken`
                    : 'make the road worse'}
                </span>
              </button>
            )}
            <button type="button" onClick={() => { play('select'); setPhase('chest'); }}>
              {T('home.chest')}
              <span className="soon">
                {run.taught.length === 0
                  ? T('home.chest.empty')
                  : `lay out your ${run.taught.length === 1 ? 'enchantment' : 'enchantments'} · ${campaignBudget(run)} mana`}
              </span>
            </button>
            {/* Everything below the rule is a different game from the road: two captains, every
                enchantment on the table from the first move, and nothing you do here touches
                the run. Separated so it cannot be mistaken for progress. */}
            <div className="menu-rule">
              <span>{T('home.away')}</span>
            </div>
            <button type="button" onClick={() => { play('select'); setPhase('friendly'); }}>
              {T('home.duel')}
              <span className="soon">{T('home.duel.sub')}</span>
            </button>
            <button type="button" onClick={() => { play('select'); setPhase('rules'); }}>
              {T('home.rules')}
            </button>
            <button type="button" onClick={() => { play('select'); setPhase('drills'); }}>
              {T('home.table')}
              <span className="soon">{T('home.table.sub')}</span>
            </button>
            <button type="button" onClick={() => { play('select'); setPhase('ledger'); }}>
              {T('home.ledger')}
              <span className="soon">{T('home.ledger.sub')}</span>
            </button>
            {resumable && !midRoadDuel && (
              <button type="button" onClick={() => { play('select'); setPhase('game'); }}>
                Resume duel
              </button>
            )}
            {(run.attempts > 0 || run.gold > 0) && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  play('select');
                  // Wipes the book as well as the road: a genuinely new traveller, and one who
                  // gets the same opening as any other — prologue, then the board question.
                  // It used to call `beginRun` here and jump straight to the ladder, which
                  // silently kept whichever board style the last traveller had chosen.
                  setRun(beginRun(resetRun()));
                  setSetup((x) => ({ ...x, opponent: 'drunkard' }));
                  setCard({ card: PROLOGUE, then: () => setPhase('house') });
                  setPhase('story');
                }}
              >
                Begin a new adventure
                <span className="soon">forget the gold and the book too</span>
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  /** One card, rendered the same way whether it fills the screen between encounters or lands
   *  over a board that has just finished. */
  /** `onSeeBoard` is only passed by the copy that is sitting on top of a finished board. A
   *  story card between screens has no position behind it to look at. */
  const storyCard = (onSeeBoard?: () => void) => {
    if (!card) return null;
    const speaker = storyFace(card.card);
    const face = FACE[speaker];
    const speakerName = speaker === 'you' ? 'The traveller' : HOUSE[speaker].label;
    const beatLabel = card.card.title === 'The Law of Lothar'
      ? 'THE OPENING'
      : card.card.cta
      ? 'AFTER THE BOARD'
      : card.card.lesson
        ? 'AN ENCOUNTER'
        : 'A BEAT FROM THE ROAD';

    return (
      <div className={`story story-face-${face.key}`}>
        <aside className="story-portrait" aria-label={`Portrait of ${speakerName}`}>
          <div className="story-portrait-frame">
            <span className="story-portrait-glow" aria-hidden="true" />
            <img src={faceAsset(face)} alt={speakerName} />
          </div>
          <span className="story-portrait-kicker">{beatLabel}</span>
          <strong>{speakerName}</strong>
          <span>{speaker === 'you' ? 'the one who kept walking' : 'waiting at the next table'}</span>
        </aside>
        <div className="story-copy">
          <span className="story-eyebrow">THE CHRONICLE · {beatLabel}</span>
          <h2 className="story-title">{card.card.title}</h2>
          {card.card.lines.map((line, i) => (
            <p key={i} className="story-line">
              {line}
            </p>
          ))}
          {card.card.lesson && <p className="story-lesson">{card.card.lesson}</p>}
          <div className="menu-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                play('select');
                const go = card.then;
                setCard(null);
                go();
              }}
            >
              {card.card.cta ?? T('act.onward')}
            </button>
            {onSeeBoard && (
              <button type="button" className="quiet" onClick={onSeeBoard}>
                See the board
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };
  const storyBody = storyCard();

  if (phase === 'story' && card) {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        {storyBody}
      </Shell>
    );
  }

  if (phase === 'online') {
    const busy = net.status === 'seeking';
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="menu">
          <h2 className="menu-title">Find a traveller</h2>
          <p className="menu-copy">
            {net.status === 'offline'
              ? 'Looking for the tavern…'
              : busy
                ? `Waiting at the door. ${net.waiting} other${net.waiting === 1 ? '' : 's'} in this queue.`
                : 'Pick a board and a clock. You will be paired with whoever wants the same.'}
          </p>
          {net.error && <p className="load-error">{net.error}</p>}

          <div className="control-row">
            {(['3+2', '5+5', '10+0', 'untimed'] as TimeControlId[]).map((id) => (
              <button
                type="button"
                key={id}
                className={`control-pick ${setup.control === id ? 'is-active' : ''}`}
                disabled={busy}
                onClick={() => {
                  play('select');
                  setSetup((s) => ({ ...s, control: id }));
                }}
              >
                <span className="control-label">
                  {id === 'untimed' ? 'No clock' : TIME_CONTROLS[id].label}
                </span>
              </button>
            ))}
          </div>

          <div className="menu-actions">
            {busy ? (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  play('select');
                  online.cancelSeek();
                }}
              >
                Stop looking
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    play('select');
                    online.seek('classic', setup.control);
                  }}
                >
                  Classic
                </button>
                <button
                  type="button"
                  onClick={() => {
                    play('select');
                    online.seek('960', setup.control);
                  }}
                >
                  Chess960
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                online.leave();
                setPhase('home');
              }}
            >
              ← Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'house') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="menu">
          <h2 className="menu-title">The road</h2>
          <p className="menu-copy">
            One unbroken walk from the taps to the wings. Lose anywhere and it starts at the
            taps again, with everyone on it carrying something different.
          </p>
          <div className="run-strip">
            <span className="coin-pill coin-pill-dark">
              <span className="coin-mark">◈</span>
              {run.gold}
            </span>
            <span>
              seat <strong>{Math.min(won.length + 1, roadFor(run).length)}</strong>/
              {roadFor(run).length}
            </span>
            <span>
              mana <strong>{campaignBudget(run)}</strong>/{MANA_CAP}
            </span>
            <span>
              this walk <strong>+{purseSoFar(run)}</strong>
            </span>
            {run.trials.length > 0 && (
              /* What you agreed to, kept visible for the whole walk. A player who took three
                 cruelties a week ago and came back to a turned board deserves to be told why
                 rather than left to work it out from the pieces. */
              <span className="trial-strip">
                {run.trials.map((t) => (
                  <span className="trial-chip" key={t}>
                    {TRIAL[t].name}
                  </span>
                ))}
              </span>
            )}

          </div>
          <div className="cast">
            {roadFor(run).map((who, i) => {
              const open = isOpen(run, who);
              const done = won.includes(who);
              return (
              <button
                type="button"
                key={who}
                disabled={!open}
                className={`cast-card ${HOUSE[who].boss ? 'cast-boss' : ''} ${
                  done ? 'cast-done' : ''
                } ${open || done ? '' : 'cast-locked'}`}
                onClick={() => {
                  play('select');
                  // Already sitting at this table? Go back to it. Rebuilding the game here
                  // would discard a live duel without asking, and on the road that duel is
                  // the attempt.
                  if (who === setup.opponent && state && state.status.kind === 'ongoing') {
                    setPhase('game');
                    return;
                  }
                  // Only Kyrax is ridden into, and only after he has put you on the road once.
                  const boon = who === 'kyrax' && run.dragon;
                  // No clocks on the road. Take as long as the dragon will allow.
                  setSetup((s) => ({
                    ...s,
                    opponent: who,
                    control: 'untimed',
                    boon,
                    silentKing: !run.divineCall,
                  }));
                  setCard({
                    // The style was settled when you set out; the seat only needs its story
                    // card and then a board. A 960 walk still deals a fresh back rank here.
                    // Once he has said the name, sitting down opposite him is a different
                    // scene: he is on your side and it changes nothing about the game.
                    card: boon
                      ? KYRAX_RETURN
                      : who === 'kyrax' && knowsTheTruth(run)
                        ? KYRAX_BOUND_STILL
                        : STORY[who].before,
                    then: () =>
                      beginBuild(run.mode, {
                        opponent: who,
                        control: 'untimed',
                        boon,
                        silentKing: !run.divineCall,
                      }),
                  });
                  setPhase('story');
                }}
              >
                <img
                  alt=""
                  className="cast-face"
                  src={faceAsset(FACE[who])}
                />
                <span className="cast-name">
                  <span className="cast-step">{i + 1}</span>
                  {HOUSE[who].label}
                  {done && <span className="cast-tag cast-tag-done">beaten</span>}
                  {!open && !done && <span className="cast-tag">locked</span>}
                  {who === setup.opponent && state?.status.kind === 'ongoing' && (
                    <span className="cast-tag cast-tag-live">at this table</span>
                  )}
                </span>
                <span className="cast-blurb">
                  {open || done ? HOUSE[who].blurb : 'Beat the one before to earn this seat.'}
                </span>
                {open && !done && (
                  <span className="cast-purse">
                    <span className="coin-mark">◈</span> {purseFor(run, who)}
                  </span>
                )}
                {/* Shown on locked seats too — that is the whole point. A relic you cannot
                    reach yet is the reason to walk far enough to reach it. */}
                {carriedBy(run, who).map(({ relic, chance }) => (
                  <span className="cast-carries" key={relic}>
                    <EnchRune ench="immolation" />
                    <span className="cast-carries-name">{RELIC[relic].name}</span>
                    <span className="cast-carries-odds">{oddsInWords(chance)}</span>
                  </span>
                ))}
              </button>
              );
            })}
          </div>
          <p className="run-locked">
            {run.taught.length === 0
              ? run.keeper
                ? 'You carry no enchantments yet, and the Sorcerer is open. Spend what the road paid you before you walk it again.'
                : 'You carry no enchantments yet. The road can be walked without any — beat the keeper, and the room behind the bar opens the next time a walk ends.'
              : `Your book: ${availableEnchantments(run).map((e) => ENCH_NAME[e]).join(', ')}.` +
                (run.divineCall ? ' Your King may call.' : ' Your King has no power until Rolain falls.')}
          </p>
          <div className="menu-actions">
            <button type="button" onClick={() => setPhase('home')}>
              ← Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'ledger') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <Stats onBack={() => setPhase('home')} />
      </Shell>
    );
  }

  if (phase === 'shop') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <Shop
          run={run}
          onBuy={(ench) => setRun((r) => learn(r, ench))}
          onBack={() => {
            play('select');
            // Learning something new and then sitting down to a board dealt before you learned
            // it is the same trap the chest has; same answer.
            discardUnstartedDuel();
            setPhase('home');
          }}
        />
      </Shell>
    );
  }

  if (phase === 'rules') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <Rules onBack={() => setPhase('home')} />
      </Shell>
    );
  }

  if (phase === 'drills') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <DrillsPage onBack={() => setPhase('home')} />
      </Shell>
    );
  }

  if (phase === 'spoils' && offer) {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="menu">
          <h2 className="menu-title">The Spoils</h2>
          <p className="menu-copy">
            He had these on him, and he will not be needing them. Take one. Whatever you leave
            here, you leave for good — this seat has fallen to you now, and it will not offer
            again.
          </p>
          <div className="spoils">
            {offer.spoils.map((up) => (
              <button
                key={up}
                type="button"
                className="spoil"
                onClick={() => {
                  play('power');
                  setRun((r) => takePowerup(r, up));
                  setOffer(null);
                  setPhase(offer.then);
                }}
              >
                <span className="spoil-name">{POWERUP[up].name}</span>
                <span className="spoil-flavour">{POWERUP[up].flavour}</span>
                <span className="spoil-effect">{powerupEffect(run, up)}</span>
              </button>
            ))}
          </div>
          <p className="run-locked">
            <ManaMeter filled={campaignBudget(run)} total={MANA_CAP} />
            Mana {campaignBudget(run)} of {MANA_CAP} · gold {run.gold}
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === 'trials') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="menu">
          <h2 className="menu-title">The Keeper's Offer</h2>
          <p className="menu-copy">
            The valley is awake and the story is over, and the keeper is still drying the same
            glass. "It is still there," he says, "the road, if you want it. I can make it worse.
            That is the only thing I have left to give you."
          </p>
          <div className="spoils">
            {TRIALS.map((trial) => {
              const on = run.trials.includes(trial);
              return (
                <button
                  key={trial}
                  type="button"
                  className={`spoil ${on ? 'spoil-taken' : ''}`}
                  onClick={() => {
                    play('select');
                    setRun((r) => toggleTrial(r, trial));
                  }}
                >
                  <span className="spoil-name">
                    {TRIAL[trial].name}
                    {on && <span className="cast-tag cast-tag-done">taken</span>}
                  </span>
                  <span className="spoil-flavour">{TRIAL[trial].flavour}</span>
                  <span className="spoil-effect">{TRIAL[trial].effect}</span>
                </button>
              );
            })}
          </div>
          <p className="run-locked">
            They stack, and nothing stops you taking all three. Changed between walks, never
            during one.
          </p>
          <div className="menu-actions">
            <button type="button" onClick={() => setPhase('home')}>
              ← Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'friendly') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="menu">
          <h2 className="menu-title">{T('home.away')}</h2>
          <p className="menu-copy">
            A duel between captains is not part of the campaign. Both sides get all six
            enchantments and every King power from the first move, there is no gold in it, and
            nothing that happens here moves you up or down the ladder.
          </p>
          <div className="home-buttons">
            <button
              type="button"
              className="primary"
              onClick={() => {
                play('select');
                setSetup((s) => ({ ...s, opponent: 'table' }));
                setPhase('mode');
              }}
            >
              At this table
              <span className="soon">both captains on this device, one after the other</span>
            </button>
            {/* Online needs a server to talk to, and the static build does not ship one. A
                button that opens a queue nobody is listening to is worse than one that says
                so, so the whole path is gated on the build knowing a server exists. */}
            <button
              type="button"
              disabled={!ONLINE_ENABLED}
              title={ONLINE_ENABLED ? undefined : 'Not on this table yet.'}
              onClick={() => {
                if (!ONLINE_ENABLED) return;
                play('select');
                online.connect();
                setPhase('online');
              }}
            >
              Against a stranger
              <span className="soon">
                {ONLINE_ENABLED ? 'find another traveller online' : 'coming soon'}
              </span>
            </button>
            {resumable && !midRoadDuel && (
              <button type="button" onClick={() => { play('select'); setPhase('game'); }}>
                Resume duel
                <span className="soon">the board you left standing</span>
              </button>
            )}
            <button type="button" onClick={() => { play('select'); setPhase('ledger'); }}>
              {T('home.ledger')}
              <span className="soon">{T('home.ledger.sub')}</span>
            </button>
            <button type="button" className="quiet" onClick={() => setPhase('home')}>
              ← Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase === 'chest') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <LoadoutBuilder
          state={initialState()}
          color="w"
          loadout={bench}
          onChange={saveBench}
          onBack={() => {
            discardUnstartedDuel();
            setPhase('home');
          }}
          onDone={() => {
            play('power');
            discardUnstartedDuel();
            setPhase('home');
          }}
          heading="The Sorting Chest"
          doneLabel="Keep this loadout →"
          // Gated by the campaign book. The chest used to offer all six whatever you owned,
          // which made the Sorcerer look pointless: a traveller who has bought nothing could
          // lay out Poison and Herald here and reasonably conclude the shop was decoration.
          book={availableEnchantments(run)}
          budget={campaignBudget(run)}
          subtitle={
            availableEnchantments(run).length
              ? `Your standing loadout, laid out from what the Sorcerer has taught you. ${campaignBudget(run)} mana, one enchantment per piece. Every seat on the road faces this army, and you can still change it at the board before a duel starts.`
              : 'The chest is empty: the Sorcerer has taught you nothing yet. Beat the Innkeeper, then buy from him, and what you own turns up here to be laid out across your mana.'
          }
        />
      </Shell>
    );
  }

  if (phase === 'mode') {
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="menu">
          <h2 className="menu-title">
            {setup.opponent === 'table' ? 'Which board tonight?' : 'Which board?'}
          </h2>
          <p className="menu-copy">
            {setup.opponent === 'table'
              ? 'Both captains build their loadouts on this device, one after the other. Everything is shown before White moves.'
              : 'Both sides see the same start, and both see the whole loadout before White moves.'}
          </p>
          {setup.opponent === 'table' && (
          <div className="control-row">
            {(['3+2', '5+5', '10+0', 'untimed'] as TimeControlId[]).map((id) => (
              <button
                type="button"
                key={id}
                className={`control-pick ${setup.control === id ? 'is-active' : ''}`}
                onClick={() => {
                  play('select');
                  setSetup((s) => ({ ...s, control: id }));
                }}
              >
                <span className="control-label">
                  {id === 'untimed' ? 'No clock' : TIME_CONTROLS[id].label}
                </span>
                <span className="control-note">
                  {id === '3+2'
                    ? 'blitz. 3 min, 2 s increment'
                    : id === '5+5'
                      ? '5 min, 5 s increment'
                      : id === '10+0'
                        ? '10 min, no increment'
                        : 'unlimited thinking time'}
                </span>
                <span className="control-power">
                  Time Manipulation:{' '}
                  {id === 'untimed'
                    ? 'unusable'
                    : TIME_CONTROLS[id].incrementMs > 0
                      ? '+1 s per move'
                      : '+30 s once'}
                </span>
              </button>
            ))}
          </div>
          )}
          <div className="menu-actions">
            <button type="button" className="primary" onClick={() => chooseBoard('classic')}>
              Classic start
            </button>
            <button type="button" onClick={() => chooseBoard('960')}>
              Chess960 start
            </button>
            <button type="button" onClick={() => setPhase('home')}>
              ← Back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (!state && phase !== 'build-w' && phase !== 'build-b') {
    setPhase('home');
    return null;
  }

  if (phase === 'build-w' || phase === 'build-b') {
    const color: Color = phase === 'build-w' ? 'w' : 'b';
    /* The board the builder draws has to be the board the game will deal, or it lies about what
     * the player owns. It used to be a bare starting position, so a traveller who had taken
     * Venom saw eight identical pawns and no way to find out which one the road had poisoned —
     * information they need *while choosing*, since a Poison pawn is worth building around and
     * the gift lands on a pawn they did not pick. Same for a fortified rook, and for knights
     * and bishops that are Dragons and Archbishops by now. */
    const base = withRoadGifts(
      initialState(setup.back ? { back: setup.back } : {}),
      color,
      isHouse(setup.opponent) && color === (setup.player ?? 'w') ? run : null,
    );
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <LoadoutBuilder
          state={base}
          color={color}
          loadout={color === 'w' ? setup.white : setup.black}
          onChange={(next) =>
            setSetup((s) => (color === 'w' ? { ...s, white: next } : { ...s, black: next }))
          }
          // On the road you may only spend what the Sorcerer has taught, and your King is
          // silent until Rolain falls. At this table and online, everything is open.
          book={color === 'w' && isHouse(setup.opponent) ? availableEnchantments(run) : undefined}
          // The traveller spends mana on the road; Black and every duel spend the flat four.
          budget={color === 'w' ? (setup.budget ?? BUDGET) : BUDGET}
          powers={
            color === 'w' && isHouse(setup.opponent)
              ? run.divineCall
                ? // The standard four, plus the Dark Word if the road has handed it over.
                  (['teleport', 'relocate', 'decree', 'revive', 'chrono'] as PowerName[]).concat(
                    run.doomCall ? (['doom'] as PowerName[]) : [],
                  )
                : []
              : undefined
          }
          onBack={() => {
            // Black backs up to White's builder in a hotseat duel. White backs out to wherever
            // the game was chosen from — and on the road that is the ladder, not the
            // board-style screen: the style is settled once when you set out, so sending a
            // traveller back there offers them a decision they already made.
            if (color === 'b') {
              setPhase('build-w');
              return;
            }
            setPhase(isHouse(setup.opponent) ? 'house' : 'mode');
          }}
          doneLabel={
            setup.opponent === 'online'
              ? 'Seal your army →'
              : color === 'w' && isHouse(setup.opponent)
                ? `See what ${HOUSE[setup.opponent as House].label} brought →`
                : undefined
          }
          onDone={() => {
            play('power');
            /* Remember it. The builder edits `setup`, which is rebuilt from the bench every
             * time a game starts, so an army assembled here was thrown away the moment the
             * game ended and the next evening opened on an empty board. Reported from play:
             * "once I've set my loadout, it should persist unless I make a change".
             *
             * Only the traveller's own side is remembered — in a hotseat duel the second
             * builder belongs to the other person at the table, and their army is not the
             * standing one. */
            const mine: Color = isHouse(setup.opponent) ? (setup.player ?? 'w') : 'w';
            if (color === mine) saveBench(color === 'w' ? setup.white : setup.black);
            if (setup.opponent === 'online') {
              online.submitLoadout(color === 'w' ? setup.white : setup.black);
              setPhase('reveal');
              return;
            }
            if (color === 'w' && isHouse(setup.opponent)) {
              setHistory([startingState(setup)]);
              setPhase('reveal');
            } else if (color === 'w') setPhase('build-b');
            else {
              setHistory([startingState(setup)]);
              setPhase('reveal');
            }
          }}
        />
      </Shell>
    );
  }

  if (phase === 'reveal') {
    const base = initialState(setup.back ? { back: setup.back } : {});
    const netReveal = setup.opponent === 'online' ? net.loadouts : null;
    if (setup.opponent === 'online' && (!netReveal?.white || !netReveal.black)) {
      return (
        <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
          <div className="menu">
            <h2 className="menu-title">Army sealed</h2>
            <p className="menu-copy">
              {net.status === 'abandoned'
                ? 'Your opponent left the table.'
                : `Waiting for ${net.opponent ?? 'your opponent'} to finish building.`}
            </p>
            <div className="menu-actions">
              <button
                type="button"
                onClick={() => {
                  online.leave();
                  setPhase('home');
                }}
              >
                ← Leave the table
              </button>
            </div>
          </div>
        </Shell>
      );
    }
    return (
      <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
        <div className="reveal">
          <h2 className="screen-title">The Open Board</h2>
          <p className="screen-sub">
            Both loadouts in full, before White moves. {setup.back ? 'Chess960 start.' : 'Classic start.'}
          </p>
          <div className="reveal-grid">
            {(['w', 'b'] as Color[]).map((color) => {
              const loadout =
                netReveal?.white && netReveal.black
                  ? color === 'w'
                    ? netReveal.white
                    : netReveal.black
                  : color === 'w'
                    ? setup.white
                    : setup.black;
              /* Each side against its own purse. Black was checked against the ten-point duel
               * budget even when the seat opposite was the Drunken Knight with his single point
               * of mana — so the reveal printed "0/10 spent · 10 reserve" for a man the ladder
               * gives one. On a board whose law is that everything shown is true, a wrong number
               * here is not cosmetic. */
              const budgetFor =
                color === 'w'
                  ? (setup.budget ?? BUDGET)
                  : isHouse(setup.opponent)
                    ? HOUSE[setup.opponent].mana
                    : BUDGET;
              const check = validateLoadout(base, color, loadout, budgetFor);
              return (
                <div className="panel reveal-side" key={color}>
                  <h3>
                    {color === 'w'
                      ? 'White'
                      : isHouse(setup.opponent)
                        ? `Black, ${HOUSE[setup.opponent].label}`
                        : setup.opponent === 'online' && net.you === 'w'
                          ? `Black, ${net.opponent ?? 'a traveller'}`
                          : 'Black'}
                  </h3>
                  <ul className="reveal-list">
                    {loadoutSummary(base, loadout).map((row) => (
                      <li key={row.square}>
                        <EnchRune ench={row.ench} shield={row.ench === 'taunt' ? 'dormant' : undefined} />
                        <span className="reveal-piece">
                          <PieceGlyph type={row.piece} color={color} ench={row.ench} />
                        </span>
                        <span>
                          <strong>{ENCH_NAME[row.ench]}</strong> on {PIECE_NAME[row.piece]} ({row.square})
                        </span>
                        <span className="reveal-cost">{row.cost}</span>
                      </li>
                    ))}
                    {!Object.keys(loadout.enchantments).length && (
                      <li className="muted">No enchantments. A plain army.</li>
                    )}
                  </ul>
                  {color === 'b' && isHouse(setup.opponent) && HOUSE[setup.opponent].dragons && (
                    <p className="reveal-dragons">
                      Rides with{' '}
                      {HOUSE[setup.opponent].dragons!.count === 1
                        ? 'a dragon'
                        : `${HOUSE[setup.opponent].dragons!.count} dragons`}{' '}
                      in place of {HOUSE[setup.opponent].dragons!.count === 1 ? 'a knight' : 'knights'}
                      . A dragon moves as knight and bishop both.
                    </p>
                  )}
                  {/* The armour is not in the loadout list, because it is not bought — it is
                      strapped on afterwards by `armorArmy`. Leaving it off the reveal makes the
                      single most important fact about this opponent a surprise, which is exactly
                      what the Open Board forbids. */}
                  {color === 'b' && isHouse(setup.opponent) && HOUSE[setup.opponent].armored && (
                    <p className="reveal-dragons">
                      {/* One line per scope. `few` fell through to the "every piece" branch, so
                          the Armored Knight — who plates exactly two pawns — was announced as
                          fielding an entirely armoured army. On a board whose law is that
                          everything shown is true, that is the worst kind of wrong: it is a
                          promise the position cannot keep. */}
                      {HOUSE[setup.opponent].armored === 'few'
                        ? 'His centre is armoured: the two pawns in front of his gate carry Taunt on top of anything listed above, and that pair costs him nothing from his mana. '
                        : HOUSE[setup.opponent].armored === 'half'
                          ? 'His middle four pawns are armoured: each carries Taunt on top of anything listed above, and they cost him nothing from his mana. '
                          : HOUSE[setup.opponent].armored === 'pawns'
                            ? 'Every pawn he owns is armoured: each carries Taunt on top of whatever is listed above, and it costs him nothing from his mana. '
                            : 'Every piece he owns is armoured: each one carries Taunt on top of whatever is listed above, and it costs him nothing from his mana. '}
                      While one of them is defended and standing in his own half, you cannot take
                      it at all — you must spend a whole turn breaking the shield first. Plate is
                      for standing in: the moment one of his crosses the middle, it is wearing
                      weight and nothing else.
                    </p>
                  )}
                  {color === 'w' && setup.boon && (
                    <p className="reveal-dragons">
                      Rides Princess Rolain’s dragon in place of a knight, shielded by Taunt. A
                      dragon moves as knight and bishop both. Lent, not bought: it costs you
                      nothing from the four.
                    </p>
                  )}
                  <div className="reveal-power">
                    {silentFor(color) ? (
                      color === houseColor ? (
                        <>
                          <strong>No power</strong>
                          <span className="muted">
                            {' '}
                            This King brings no Divine Call at all. The first tables of the road
                            are chess with a little magic on it, and nothing more.
                          </span>
                        </>
                      ) : (
                        <>
                          <strong>No power</strong>
                          <span className="muted">
                            {' '}
                            Your King has no Divine Call yet. Beat Princess Rolain and he learns
                            three words, each spoken once; until then he only moves.
                          </span>
                        </>
                      )
                    ) : (
                      /* Every word, not the first one.
                       *
                       * This read `loadout.power` — the single field kept only so old saves
                       * still deserialize — so a King who had been taught three was announced
                       * as carrying one. The reveal is the Open Board's whole promise: what is
                       * on this screen is what you will be playing against, in full. */
                      <ul className="reveal-words">
                        {(loadout.powers?.length ? loadout.powers : [loadout.power]).map(
                          (word) => (
                            <li key={word}>
                              <strong>{POWER_NAME[word]}</strong>
                              <span className="muted"> {POWER_TEXT[word]}</span>
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="reveal-budget">
                    <ManaMeter
                      filled={check.spent}
                      total={budgetFor}
                      reserved={
                        (loadout.powers?.length ? loadout.powers : [loadout.power]).includes(
                          'revive',
                        )
                          ? check.reserve
                          : 0
                      }
                    />
                    {check.spent}/{budgetFor} spent · {check.reserve} reserve
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="primary" onClick={() => { play('power'); setPhase('game'); }}>
            {T('act.begin')}
          </button>
        </div>
      </Shell>
    );
  }

  if (!state) return null;

  const checkedKing = inCheck(shown, shown.turn) ? findKing(shown, shown.turn) : null;
  const last = shown.log[shown.log.length - 1];
  const lastMove =
    last && last.type === 'move'
      ? { from: last.from, to: last.to }
      : last && last.type === 'shieldBreak'
        ? { from: last.from, to: last.target }
        : null;
  const reviewHead = headIndex(reviewAt, history.length);
  const online_ = setup.opponent === 'online';

  return (
    <Shell muted={muted} onMute={() => toggleMute(muted, setMutedState)}>
      <div className={`layout ${isHouse(setup.opponent) ? 'layout-run' : ''}`}>
        {/* The ladder, visible the whole time you are on it. A run should never make you
            go and look up how far you have come. */}
        {isHouse(setup.opponent) && (
          <aside className="rail" aria-label="the road">
            <span className="rail-purse">
              <span className="coin-mark">◈</span>
              {run.gold}
            </span>
            {CAMPAIGN.map((who) => {
              const done = won.includes(who);
              const here = who === setup.opponent;
              return (
                <span
                  key={who}
                  className={`rail-seat ${done ? 'rail-done' : ''} ${here ? 'rail-here' : ''}`}
                  title={`${HOUSE[who].label}${done ? ' — beaten' : here ? ' — at this table' : ''} · pays ${purseFor(run, who)}`}
                >
                  <img alt="" src={faceAsset(FACE[who])} />
                </span>
              );
            })}
          </aside>
        )}
        <section className="board-column">
          <PlayerBar
            state={shown}
            reviewing={reviewing}
            color={flipped ? 'w' : 'b'}
            onPower={startPower}
            powerMode={powerMode}
            setPowerMode={setPowerMode}
            remainingMs={remainingFor(flipped ? 'w' : 'b')}
            house={isHouse(setup.opponent) && (flipped ? 'w' : 'b') === houseColor && setup.opponent}
            silent={silentFor(flipped ? 'w' : 'b')}
            pondering={pondering && (flipped ? 'w' : 'b') === houseColor}
            bubble={(flipped ? 'w' : 'b') === houseColor ? bubbles.house : bubbles.you}
            bubbleSide="below"
            retorts={
              setup.opponent === 'table' || (flipped ? 'w' : 'b') !== houseColor
                ? { open: retortOpen, setOpen: setRetortOpen, say: (t: string) => say('you', t) }
                : undefined
            }
          />
          <Board
            state={shown}
            selected={selected}
            hoverSquare={drag?.over ?? null}
            draggingFrom={drag?.from ?? null}
            onLift={beginDrag}
            targets={targets}
            breakTargets={breakTargets}
            bindTargets={bindTargets}
            tradeTargets={new Set(swapTargets.keys())}
            powerTargets={powerTargets}
            powerFlash={powerFlashSquares}
            shatterSquare={reviewing ? null : breakFx}
            lastMove={lastMove}
            checkedKing={checkedKing}
            denySquare={deny}
            flipped={flipped}
            onSquare={onSquare}
          />
          {powerFx && !reviewing ? (
            <div className="power-called" role="status">
              <span className="power-called-bolt">⚡</span>
              {POWER_NAME[powerFx.power]}
            </div>
          ) : null}
          <PlayerBar
            state={shown}
            reviewing={reviewing}
            color={flipped ? 'b' : 'w'}
            onPower={startPower}
            powerMode={powerMode}
            setPowerMode={setPowerMode}
            remainingMs={remainingFor(flipped ? 'b' : 'w')}
            house={isHouse(setup.opponent) && (flipped ? 'b' : 'w') === houseColor && setup.opponent}
            silent={silentFor(flipped ? 'b' : 'w')}
            pondering={pondering && (flipped ? 'b' : 'w') === houseColor}
            bubble={(flipped ? 'b' : 'w') === houseColor ? bubbles.house : bubbles.you}
            bubbleSide="above"
            retorts={
              setup.opponent === 'table' || (flipped ? 'b' : 'w') !== houseColor
                ? { open: retortOpen, setOpen: setRetortOpen, say: (t: string) => say('you', t) }
                : undefined
            }
          />
          {reviewing && (
            <div className="review-bar" role="status">
              <span className="review-mark">◷</span>
              <span>Looking back — {describeHead(reviewHead)}</span>
              <button type="button" onClick={() => setReviewAt(null)}>
                Back to the game
              </button>
            </div>
          )}
        </section>

        <aside className="side">
          {setup.opponent === 'online' && (
            <div className={`panel ${net.status === 'abandoned' ? 'status-over' : ''}`}>
              <h3>Across the board</h3>
              <p className="status-text">{net.opponent ?? 'a traveller'}</p>
              <p className="muted">
                {net.status === 'abandoned'
                  ? 'They left the table.'
                  : net.error
                    ? net.error
                    : `You are ${net.you === 'w' ? 'White' : 'Black'}.`}
              </p>
            </div>
          )}
          <StatusPanel state={shown} powerMode={reviewing ? null : powerMode} />
          <div className="panel moves">
            <h3>
              Chronicle
              {/* Rewind lives beside the record of the game, which is where a traveller looks
                  when they want to go back. The arrow keys do the same thing. */}
              <span className="rewind">
                <button
                  type="button"
                  aria-label="back to the opening"
                  title="the opening (Home)"
                  disabled={history.length < 2 || reviewHead === 0}
                  onClick={() => {
                    setReviewAt(0);
                    setSelected(null);
                    setPowerMode(null);
                  }}
                >
                  ⏮
                </button>
                <button
                  type="button"
                  aria-label="one move back"
                  title="one move back (←)"
                  disabled={history.length < 2 || reviewHead === 0}
                  onClick={() => stepReview(-1)}
                >
                  ◀
                </button>
                <button
                  type="button"
                  aria-label="one move on"
                  title="one move on (→)"
                  disabled={!reviewing}
                  onClick={() => stepReview(1)}
                >
                  ▶
                </button>
                <button
                  type="button"
                  aria-label="back to the game"
                  title="back to the game (End)"
                  disabled={!reviewing}
                  onClick={() => setReviewAt(null)}
                >
                  ⏭
                </button>
              </span>
            </h3>
            <ol className="movelist">
              {Array.from({ length: Math.ceil(sanList.length / 2) }, (_, i) => (
                <li key={i}>
                  <span className="num">{i + 1}.</span>
                  <San
                    text={sanList[i * 2]}
                    onGo={() => jumpTo(i * 2 + 1)}
                    here={reviewHead === i * 2 + 1}
                  />
                  <San
                    text={sanList[i * 2 + 1] ?? ''}
                    onGo={() => jumpTo(i * 2 + 2)}
                    here={reviewHead === i * 2 + 2}
                  />
                </li>
              ))}
              {!sanList.length && <li className="muted">{T('game.noMoves')}</li>}
            </ol>
          </div>
          {/* Against a stranger these stop being playtest tools and start being cheating.
              Taking a move back is meaningless when the server holds the position, and pasting
              a state is an attempt to overwrite a game somebody else is also playing — the
              server rejects both, but offering them at all is wrong. Rewind stays: looking
              back at a position is not changing it. */}
          <div className="panel tools">
            <h3>{PLAYTEST_ENABLED ? T('game.tools') : T('game.table')}</h3>
            {PLAYTEST_ENABLED && (
            <div className="tool-row">
              {!online_ && (
                <button
                  type="button"
                  onClick={() => {
                    forgetPendingThoughts();
                    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
                    setSelected(null);
                    setPowerMode(null);
                    setReviewAt(null);
                  }}
                  disabled={history.length < 2}
                >
                  Undo
                </button>
              )}
              <button type="button" onClick={() => setFlipped((f) => !f)}>
                Flip
              </button>
              <button type="button" onClick={() => exportLog(setup, history)}>
                Export
              </button>
              {!online_ && (
                <button type="button" onClick={() => setLoader('')}>
                  {T('act.loadPosition')}
                </button>
              )}
            </div>
            )}

            {/* The way out of a duel, for the games where walking away means something.
                Stepping away from a board is not the same as ending the game on it: the board
                is kept and the inn hands it straight back, which is why this is safe to offer
                where Undo is not. Online has no equivalent — the position lives on the server
                and somebody else is sitting at it, so leaving is either resigning or rudeness,
                and both of those already have buttons. */}
            {!online_ && (
              <div className="tool-row tool-row-quiet">
                <button
                  type="button"
                  onClick={() => setPhase('home')}
                  title="The board keeps. Pick it up again from here."
                >
                  {isHouse(setup.opponent) ? T('act.backToInn') : T('act.mainMenu')}
                </button>
              </div>
            )}
            {state.status.kind === 'ongoing' && (
              <div className="tool-row tool-row-quiet">
                <button type="button" onClick={() => commit({ type: 'resign' })}>
                  {T('act.resign')}
                </button>
                {state.drawOfferedBy && state.drawOfferedBy !== state.turn ? (
                  <button type="button" onClick={() => commit({ type: 'drawAccept' })}>
                    {T('act.acceptDraw')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => commit({ type: 'drawOffer' })}
                    disabled={state.drawOfferedBy === state.turn}
                  >
                    {state.drawOfferedBy === state.turn ? T('act.drawOffered') : T('act.offerDraw')}
                  </button>
                )}
              </div>
            )}
          </div>

          {state.status.kind !== 'ongoing' && (
            <div className="panel status-over">
              <h3>
                {isHouse(setup.opponent)
                  ? run.active
                    ? 'The road goes on'
                    : 'The attempt ends'
                  : 'Game over'}
              </h3>
              {isHouse(setup.opponent) ? (
                // No rematch on the road. A seat you have sat at is behind you either way, and
                // being able to replay a defeat would make the whole economy meaningless.
                <div className="tool-row">
                  {run.active ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        play('select');
                        setPhase('house');
                      }}
                    >
                      Continue the journey →
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        play('select');
                        setPhase('home');
                      }}
                    >
                      {T('act.toInn')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="tool-row">
                  <button type="button" className="primary" onClick={() => rematch(false)}>
                    {T('act.rematch.same')}
                  </button>
                  <button type="button" onClick={() => rematch(true)}>
                    {T('act.rematch.edit')}
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {paid !== null && (
        <div className="gold-pop">
          <span className="coin-mark">◈</span> +{paid}
        </div>
      )}

      {/* A beat of the road landing on a finished board: the position stays behind it.
          It used to stay behind it permanently — the card covered the final position and the
          only button led away from the table, so a game you had just won or lost could not be
          looked at. The card steps aside now instead of being dismissed: the run's next step
          lives on `card.then`, so losing the card would mean losing the spoils screen and the
          seat you just earned. Stepping aside keeps it one click away. */}
      {card && !cardAside && (
        <div className="modal-backdrop">
          <div className="modal modal-wide story-modal">{storyCard(() => setCardAside(true))}</div>
        </div>
      )}

      {card && cardAside && (
        <div className="card-peek" role="status">
          <span className="review-mark">◷</span>
          <span>The board as it finished. The arrows walk back through it.</span>
          <button type="button" className="primary" onClick={() => setCardAside(false)}>
            {card.card.cta ?? 'Onward →'}
          </button>
        </div>
      )}

      {drag && state.board[drag.from] && (
        // Positioned by transform from the pointer handler, so following the finger never
        // costs a React render. The initial transform is the lift point.
        <div
          className="drag-ghost"
          ref={ghostRef}
          style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }}
        >
          <PieceGlyph
            type={state.board[drag.from]!.type}
            color={state.board[drag.from]!.color}
            ench={state.board[drag.from]!.ench}
          />
        </div>
      )}

      {loader !== null && (
        <div className="modal-backdrop" onClick={() => setLoader(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Load a position</h3>
            <p className="muted">
              Paste an exported log or a serialized game state, then play on from there.
            </p>
            <textarea
              className="loader-box"
              value={loader}
              spellCheck={false}
              onChange={(e) => setLoader(e.target.value)}
              placeholder='{"back":null,"white":{...},"black":{...},"control":"3+2","actions":[...]}'
            />
            {loadError && <p className="load-error">{loadError}</p>}
            <div className="tool-row">
              <button type="button" className="primary" onClick={() => loadPosition(loader)}>
                Load
              </button>
              <button type="button" onClick={() => setLoader(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {castleChoice && (
        <div className="modal-backdrop" onClick={() => setCastleChoice(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Step, or castle</h3>
            <p className="muted">
              Your King begins beside the square he castles onto, so this one square is two
              different moves. Castling brings the rook across with him and spends the right for
              good; stepping is an ordinary King move and spends it just as surely.
            </p>
            <div className="promo-row">
              <button
                type="button"
                onClick={() => {
                  const { step } = castleChoice;
                  setCastleChoice(null);
                  commit(step);
                }}
              >
                Step
              </button>
              <button
                type="button"
                onClick={() => {
                  const { castle } = castleChoice;
                  setCastleChoice(null);
                  commit(castle);
                }}
              >
                Castle
              </button>
            </div>
          </div>
        </div>
      )}

      {bindChoice && (
        <div className="modal-backdrop" onClick={() => setBindChoice(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Take it, or bind it</h3>
            <p className="muted">
              Taking removes the piece and moves your Archbishop onto the square. Binding leaves
              both where they are and stops it moving on its owner's next turn.
            </p>
            <div className="promo-row">
              <button
                type="button"
                onClick={() => {
                  const move = targets.get(bindChoice.to)?.[0];
                  setBindChoice(null);
                  if (move) commit(move);
                }}
              >
                Take
              </button>
              <button
                type="button"
                onClick={() => {
                  const { from, to } = bindChoice;
                  setBindChoice(null);
                  commit({ type: 'bind', from, target: to });
                }}
              >
                Bind
              </button>
            </div>
          </div>
        </div>
      )}

      {promo && (
        <div className="modal-backdrop" onClick={() => setPromo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Promote to</h3>
            <div className="promo-row">
              {PROMO_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="promo-pick"
                  onClick={() =>
                    commit(
                      promo.swap
                        ? { type: 'swap', from: promo.from, to: promo.to, promo: t }
                        : { type: 'move', from: promo.from, to: promo.to, promo: t },
                    )
                  }
                >
                  <PieceGlyph type={t} color={state.turn} />
                  <span>{PIECE_NAME[t]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** The house keeps its mouth shut on quiet moves. It speaks on a capture, a power or a check,
 *  and even then only half the time. A finished game always gets the last word. */
function worthRemarking(
  before: GameState,
  action: Action,
  after: GameState,
  chance: number,
): boolean {
  if (after.status.kind !== 'ongoing') return chance > 0;
  const notable =
    (action.type === 'move' && before.board[action.to] != null) ||
    action.type === 'power' ||
    action.type === 'shieldBreak' ||
    inCheck(after, after.turn);
  return notable && Math.random() < chance;
}

function toggleMute(muted: boolean, set: (v: boolean) => void) {
  setMuted(!muted);
  set(!muted);
  if (muted) play('select');
}

function exportLog(setup: Setup, history: GameState[]) {
  const actions = history.slice(1).map((s) => s.log[s.log.length - 1]);
  const blob = new Blob([JSON.stringify({ ...setup, actions }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `enchanted-chess-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A speaker, and the same speaker with a line through it. Two paths, no text, no library. */
function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg className="mute-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? (
        <path className="mute-slash" d="M16 9l5 6M21 9l-5 6" />
      ) : (
        <path className="mute-waves" d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />
      )}
    </svg>
  );
}

/** The chrome around every screen. Deliberately almost nothing: a mark, the name, and the
 *  sound toggle. The home screen sets the title in type three times this size, so the bar does
 *  not repeat it there — one wordmark per screen is the whole rule. */
function Shell({
  children,
  muted,
  onMute,
  bare,
}: {
  children: React.ReactNode;
  muted: boolean;
  onMute: () => void;
  /** Home: the big title carries the name, so the bar shows only the mark. */
  bare?: boolean;
}) {

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♜
          </span>
          {!bare && <h1>Enchanted Chess</h1>}
        </div>
        {/* Language and sound are the same kind of thing — a preference belonging to the
            person rather than to the game — so they sit together at the right-hand end. Loose
            in the bar they were three children under `space-between`, which planted the
            language box in the exact middle of the header looking like a title. */}
        <div className="topbar-tools">
        <select
          className="lang"
          value={locale()}
          aria-label={T('app.language')}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAME[l]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`mute ${muted ? 'is-muted' : ''}`}
          onClick={onMute}
          aria-pressed={muted}
          aria-label={muted ? 'Sound off. Turn it on' : 'Sound on. Turn it off'}
          title={muted ? 'Sound off' : 'Sound on'}
        >
          <SoundIcon muted={muted} />
        </button>
        </div>
      </header>
      {children}
    </div>
  );
}

/** One entry in the chronicle.
 *
 *  The engine annotates shield-breaks with ⊘ and powers with ⚡, and those two characters are
 *  part of the exported log, so they stay exactly as they are in `notation.ts`. They are also
 *  the two characters in the whole app most likely to be missing from whatever font the panel
 *  resolves to: at 12.5px a fallback ⊘ is indistinguishable from a letter ø, which reads as a
 *  typo rather than as "this move broke a shield". So the marker is pulled out and rendered in
 *  its own span, bigger and in the accent colour, with a stack chosen for glyph coverage.
 */
const MARKERS = /([⊘⚡])/;

/** One move in the chronicle. Clicking it rewinds the board to the position it produced,
 *  which is the shortest path from "what happened on move nine" to seeing move nine. */
function San({ text, onGo, here }: { text: string; onGo?: () => void; here?: boolean }) {
  const body = !MARKERS.test(text)
    ? text
    : text.split(MARKERS).map((part, i) =>
        MARKERS.test(part) ? (
          <b key={i} className="san-mark">
            {part}
          </b>
        ) : (
          part
        ),
      );
  if (!text || !onGo) return <span className="san">{body}</span>;
  return (
    <button type="button" className={`san san-go ${here ? 'san-here' : ''}`} onClick={onGo}>
      {body}
    </button>
  );
}

function StatusPanel({ state, powerMode }: { state: GameState; powerMode: PowerMode | null }) {
  const s = state.status;
  const text =
    s.kind === 'checkmate'
      ? `Checkmate. ${s.winner === 'w' ? 'White' : 'Black'} wins`
      : s.kind === 'stalemate'
        ? 'Stalemate. The game is drawn'
        : s.kind === 'draw'
          ? DRAW_REASON[s.reason]
          : s.kind === 'resigned'
            ? `${s.winner === 'w' ? 'White' : 'Black'} wins by resignation`
            : s.kind === 'flagged'
              ? `${s.winner === 'w' ? 'White' : 'Black'} wins on time`
            : `${state.turn === 'w' ? 'White' : 'Black'} to move${
                inCheck(state, state.turn) ? ', in check' : ''
              }`;
  const hint =
    powerMode?.kind === 'teleport'
      ? powerMode.from === null
        ? 'Teleport: choose a piece to send.'
        : 'Teleport: choose an unattacked empty square.'
      : powerMode?.kind === 'relocate'
        ? 'Relocate: choose the friendly piece to swap with your King.'
        : powerMode?.kind === 'decree'
          ? 'Decree: name the enemy piece to still.'
          : powerMode?.kind === 'doom'
            ? 'Destined Death: name the piece that will not see the end of this.'
          : powerMode?.kind === 'revive'
            ? powerMode.piece
              ? 'Revive: choose an unattacked square in your own half.'
              : 'Revive: choose a piece from your graveyard.'
            : null;

  return (
    <div className={`panel status ${s.kind !== 'ongoing' ? 'status-over' : ''}`}>
      <h3>{T('game.status')}</h3>
      <p className="status-text">{text}</p>
      {/* Every armed state carries its exit: the hint says what to tap, this says you don't have to. */}
      {hint && <p className="status-hint">{hint} Tap elsewhere to cancel.</p>}
      <p className="muted">
        move {state.fullmove}
        {/* The rule only deserves the room once it is in sight: the last quarter of the count.
            Phrased as what will happen, not as the engine's internal counter. */}
        {state.halfmove >= 75 ? ` · draw in ${100 - state.halfmove} half-moves` : ''}
        {state.ep !== null ? ` · en passant ${squareName(state.ep)}` : ''}
      </p>
    </div>
  );
}

function PlayerBar({
  state,
  color,
  onPower,
  powerMode,
  setPowerMode,
  remainingMs,
  house,
  pondering,
  bubble,
  bubbleSide = 'below',
  retorts,
  silent,
  reviewing,
}: {
  state: GameState;
  color: Color;
  onPower: (power: PowerName) => void;
  powerMode: PowerMode | null;
  setPowerMode: (m: PowerMode | null) => void;
  remainingMs: number | null;
  house?: House | false;
  pondering?: boolean;
  bubble?: string | null;
  bubbleSide?: 'above' | 'below';
  retorts?: { open: boolean; setOpen: (v: boolean) => void; say: (text: string) => void };
  /** This side's King has not learned the Divine Call yet (road only, before Rolain). */
  silent?: boolean;
  /** The board is rewound: this bar describes a position that has already been played, so
   *  nothing on it may be acted upon. */
  reviewing?: boolean;
}) {
  const ps = state.powers[color];
  const lost = state.graveyard[color];
  const taken = [...state.graveyard[opposite(color)]].sort(
    (a, b) => PIECE_VALUE[b] - PIECE_VALUE[a],
  );
  const value = (list: readonly PieceType[]) =>
    list.reduce((sum, t) => sum + PIECE_VALUE[t], 0);
  const edge = value(taken) - value(lost);
  const active = state.turn === color && state.status.kind === 'ongoing' && !reviewing;
  // A King with no Divine Call is modelled as one who has already spent it, so relabel the
  // "used" it would otherwise report into the truth: he was never taught to speak.
  const rawReason = powerUnavailableReason(state, color);
  // While the board is rewound this bar is describing a position that has already been played,
  // so the chip must not read as an offer — "not your turn" is wrong too, since in the position
  // being looked at it may well have been.
  const reason = reviewing
    ? 'looking back'
    : silent && rawReason === 'used'
      ? 'no Divine Call'
      : rawReason;
  const face = FACE[house ? house : 'you'];
  // Named by who they are, not by which colour they drew. The Second Chair turns the board
  // round, and the seat opposite is White then — labelling it "White" hid the Drunken Knight
  // behind his own colour.
  const name = house ? HOUSE[house].label : color === 'w' ? 'White' : 'Black';
  const choosingRevive = powerMode?.kind === 'revive' && !powerMode.piece && active;

  return (
    <div className={`player ${active ? 'player-active' : ''}`}>
      {(house || retorts) && (
        <span
          className={`portrait ${house ? 'portrait-house' : 'portrait-you'} ${
            house === 'kyrax' ? 'portrait-kyrax' : ''
          }`}
          onClick={() => retorts?.setOpen(!retorts.open)}
          onContextMenu={(e) => {
            if (!retorts) return;
            e.preventDefault();
            retorts.setOpen(!retorts.open);
          }}
          title={retorts ? 'Right click to say something' : 'The Innkeeper'}
        >
          <img
            alt=""
            src={faceAsset(face)}
          />
          {bubble && <span className={`bubble bubble-${bubbleSide}`}>{bubble}</span>}
          {retorts?.open && (
            <span
              className={`retort-tray retort-${bubbleSide}`}
              onClick={(e) => e.stopPropagation()}
            >
              {TRAVELLER_LINES.map((quip) => (
                <button
                  key={quip}
                  type="button"
                  className="retort-bubble"
                  onClick={() => {
                    play('select');
                    retorts.say(quip);
                    retorts.setOpen(false);
                  }}
                >
                  {quip}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
      <span className="player-name">{name}</span>
      {/* Always in the row, only sometimes visible. Rendering it conditionally added and
          removed 26px of flex content on every single reply, which on a phone — where the bar
          is allowed to wrap — tipped it onto a second line and back, and the whole board
          stepped down and up with it. Reserving the space costs nothing and holds the layout
          still. */}
      <span
        className={`pondering ${pondering ? '' : 'pondering-idle'}`}
        title={pondering ? 'thinking' : undefined}
        aria-hidden={!pondering}
      />

      {remainingMs !== null && (
        <span
          className={`clock ${active ? 'clock-running' : ''} ${
            remainingMs < 20_000 ? 'clock-low' : ''
          }`}
          title={
            state.clock
              ? `${state.clock.control.label}${
                  state.clock[color].bonusIncrementMs
                    ? ` · +${state.clock[color].bonusIncrementMs / 1000}s bonus increment`
                    : ''
                }`
              : ''
          }
        >
          {formatClock(remainingMs)}
        </span>
      )}

      {/* One button per word the King knows. He may hold three, each spent once, and which one
          this position wants is the decision the whole feature exists for — so they are all on
          the bar at once rather than behind a menu. */}
      {silent || !ps.powers.length ? (
        <button type="button" className="power-btn" disabled>
          ⚡ No power
          {/* Only a reason that adds something: "No power · no power" was the bar stuttering. */}
          {reason && reason !== 'no power' ? (
            <span className="power-reason"> · {reason}</span>
          ) : null}
        </button>
      ) : (
        <span className="player-words">
        {ps.powers.map((word) => {
          // Once the game is over there are no turns, so "not your turn" is a false statement
          // on a finished board. A spent word keeps its strikethrough; the rest just go quiet.
          const live = powerReason(state, color, word);
          const why = state.status.kind === 'ongoing' ? live : live === 'used' ? 'used' : null;
          return (
            <button
              key={word}
              type="button"
              className={`power-btn ${
                powerMode && active && powerMode.kind === word ? 'is-armed' : ''
              } ${why === 'used' ? 'is-spent' : ''}`}
              onClick={() => onPower(word)}
              disabled={!active || Boolean(why)}
              title={`${POWER_NAME[word]}: ${POWER_TEXT[word]}${
                word === 'chrono' ? `\n\nWorth here: ${timePowerEffect(state.clock)}` : ''
              }${
                why ? `\n\nUnavailable: ${why}` : ''
              }\n\nReserve: ${ps.reserve} point${ps.reserve === 1 ? '' : 's'}\n\nThe King bows to no enchantment.`}
            >
              ⚡ {POWER_NAME[word]}
              {why ? <span className="power-reason"> · {why}</span> : null}
            </button>
          );
        })}
        </span>
      )}

      <span className="reserve" title="Unspent enchantment points, usable only by Revive">
        reserve {ps.reserve}
      </span>

      <span className="tray" title="Pieces you have captured">
        {taken.map((t, i) => (
          <span className="tomb" key={i}>
            <PieceGlyph type={t} color={opposite(color)} />
          </span>
        ))}
        {edge > 0 && <span className="edge">+{edge}</span>}
      </span>

      {choosingRevive && (
        <span className="revive-pick">
          {[...new Set(lost)]
            .filter((t) => REVIVE_COST[t] <= ps.reserve)
            .map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  play('select');
                  setPowerMode({ kind: 'revive', piece: t });
                }}
              >
                <PieceGlyph type={t} color={color} />
                <span>{REVIVE_COST[t]}</span>
              </button>
            ))}
        </span>
      )}
    </div>
  );
}
