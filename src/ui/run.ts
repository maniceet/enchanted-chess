import { CAMPAIGN, FULL_ROAD, HOUSE, WITTEX_CLEARS_REQUIRED, type House } from '../engine/ai';
import type { Enchantment, PowerName } from '../engine/types';

/** The road is a run. You take the seats in order, in one sitting, and the first defeat ends
 *  the attempt and puts you back at the inn.
 *
 *  What survives a failed run is not progress, it is *knowledge*: gold you were paid for how
 *  far you got, and the enchantments you spent that gold learning. A traveller who has been
 *  broken six times walks in with a deeper book than one who has been broken once, and that is
 *  the whole shape of the thing. In theory a good enough player clears the road on the first
 *  attempt with an empty book, and that is deliberately left possible.
 *
 *  Two gates open permanently, the first time you pass them, and they never close:
 *   - beat the Innkeeper → the Sorcerer will see you, and gold becomes spendable
 *   - beat Princess Rolain → the Divine Call is yours, and your King may choose a power
 *
 *  Online play ignores all of this. A duel between two travellers offers everything from the
 *  first move, because a stranger has not earned anything off you and should not have to. */

const KEY = 'enchanted-chess:run';

/** A traveller sits down at the first table with two, and a duel between strangers is always
 *  four. Starting *below* the duelling budget is the point: the campaign is the story of
 *  someone who has nothing, and ten is what they end up with.
 *
 *  Raised from eight after playtesting the Wit: he is a wall the first several times you meet
 *  him, and the answer to a wall should be that you come back carrying more, not that you play
 *  the same army better. Two more points is another armoured knight, or a Taunt queen with a
 *  pawn's worth left over — enough that the fifth seat feels like a different fight rather than
 *  the same one with better luck. */
/** Mana is *this run's* strength, not a savings account.
 *
 *  It used to be permanent, which quietly made the road a grind: a player's power came from how
 *  many attempts they had made rather than from how this walk was going, and two runs never
 *  differed from each other. Now it starts at one every time and is only ever earned at a board,
 *  so the shape of a run is something that happens inside the run. Gold is the thing that
 *  crosses between them — see `loseRun`. */
export const MANA_START = 1;

/** The eight files a pawn can stand on, which is where Venom picks from. */
const PAWN_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const MANA_CAP = 10;

/** What each seat pays the *first* time it is beaten, whether or not the run survives
 *  afterwards. The deeper the seat, the better the purse, so a run that dies at the gate still
 *  buys something. See `purseFor` — the second time a seat falls it pays half. */
export const PURSE: Record<House, number> = {
  drunkard: 4,
  innkeeper: 6,
  rolain: 9,
  wit: 13,
  armored: 16,
  ardax: 22,
  kyrax: 34,
  // He is not on the road for the money, and neither are you by the time you meet him.
  wittex: 55,
};

/** A full clear is worth 104 gold, and the book costs 96 to fill. Nobody buys everything on
 *  one run, and nobody needs to. */
export const PRICE: Record<Enchantment, number> = {
  taunt: 8,
  martyr: 8,
  outpost: 14,
  swift: 14,
  herald: 22,
  poison: 30,
  // Not sold. The Book of Immolation is found, not taught — see `DROPS`. The price exists so
  // the record is total, and so a future Sorcerer could stock it without a type change.
  immolation: 34,
};

/** The order the Sorcerer teaches in: cheap and legible first. */
export const SPELLBOOK: Enchantment[] = [
  'taunt',
  'martyr',
  'outpost',
  'swift',
  'herald',
  'poison',
];

/** Everything a book may contain, taught or found. Wider than SPELLBOOK, and the list a saved
 *  game is checked against — filtering by SPELLBOOK would quietly burn a found relic. */
export const ALL_ENCHANTMENTS: Enchantment[] = [...SPELLBOOK, 'immolation'];

/* -- relics ---------------------------------------------------------------- */

/** Things you find on a body rather than buy over a counter.
 *
 *  The Sorcerer sells the six he understands. What the road's two cleverest men are carrying is
 *  not on his shelf, and it does not come up for sale afterwards either: a relic is a reason to
 *  beat a hard seat that has nothing to do with the purse. */
export type Relic = 'scroll-of-time' | 'book-of-immolation';

export const RELIC: Record<Relic, { name: string; flavour: string; grants: string }> = {
  // Defined, and deliberately not in `DROPS` yet. The Encore it grants — move twice, once a
  // game — needs a pending-extra-move marker carried through `endTurn` and a rule that the
  // first of the two moves may not give check, without which "check, then anything" is not a
  // power but an automatic win. A relic that grants nothing is worse than no relic, so it
  // stays off the road until the power behind it exists.
  'scroll-of-time': {
    name: 'Scroll of Time',
    flavour: 'A page torn out of an hour that had not happened yet.',
    grants: 'Your King learns the Encore: once a game, move twice.',
  },
  'book-of-immolation': {
    name: 'Book of Immolation',
    flavour: 'Warm to hold. The cover has been rebound more than once.',
    grants: 'Immolation joins your book: a pawn that burns the ground in front of it.',
  },
};

/** Who is carrying what, and how often it is on them. Small numbers on purpose — a relic that
 *  turns up every run is equipment, and equipment is not worth walking back up a road for. */
export const DROPS: Partial<Record<House, { relic: Relic; chance: number }[]>> = {
  wit: [{ relic: 'book-of-immolation', chance: 0.2 }],
  ardax: [{ relic: 'book-of-immolation', chance: 0.35 }],
};

/* -- powerups -------------------------------------------------------------- */

/** What a seat gives up the *first* time it falls, on top of its purse.
 *
 *  First fall only, and that is the whole design of it. A powerup you can farm is a chore with
 *  a reward attached: beat the drunk, resign, repeat. Tying it to first blood means the only
 *  way to get more is to get *further*, which is the direction the game wants you facing.
 *
 *  Weighted, and the good ones are rare on purpose. A traveller who walks the whole road for
 *  the first time collects seven of these, so the common ones are what usually shows up and
 *  Dragonblood is the thing you tell somebody about afterwards. */
export type Powerup =
  | 'purse'
  | 'mana'
  | 'hoard'
  | 'lesson'
  | 'whetstone'
  | 'dragonblood'
  | 'holyorders'
  | 'venom'
  | 'fortify'
  | 'doomcall';

export const POWERUP: Record<
  Powerup,
  { name: string; flavour: string; weight: number }
> = {
  purse: {
    name: 'A Purse',
    flavour: 'Ten gold, in a bag that has clearly held more.',
    weight: 32,
  },
  mana: {
    name: 'Two Points of Mana',
    flavour: 'Something settles behind your ribs. It will not last past this walk, and it is real while it does.',
    weight: 28,
  },
  hoard: {
    name: 'A Hoard',
    flavour: 'Twenty five gold. Somebody was saving this for a bad winter.',
    weight: 14,
  },
  lesson: {
    name: 'A Lesson, Free',
    flavour: 'The Sorcerer owes somebody a favour, and it turns out that somebody is you.',
    weight: 13,
  },
  whetstone: {
    name: 'The Whetstone',
    flavour: 'Four points of mana at once, and a headache that lasts a week.',
    weight: 9,
  },
  dragonblood: {
    name: 'Dragonblood',
    flavour: 'One of your knights does not sleep that night, and in the morning it is not a knight.',
    weight: 4,
  },
  holyorders: {
    name: 'Holy Orders',
    flavour:
      'A bishop of yours is called away for a night and comes back with a second peak on his hat and a great deal more to say.',
    weight: 3,
  },
  venom: {
    name: 'Venom',
    flavour:
      'A flask goes into the water butt and one of your pawns drinks before you can say which. You will find out when somebody takes it.',
    weight: 16,
  },
  fortify: {
    name: 'Gift of Fortification',
    flavour:
      'A mason spends the night on one of your towers and will not be paid for it. "You will want it standing," is all he says.',
    weight: 12,
  },
  doomcall: {
    name: 'The Dark Word',
    flavour:
      'You find it written inside the cover of a book nobody sold you, in a hand that presses hard enough to tear. Reading it once is enough to know it, and once is all anybody gets.',
    weight: 2,
  },
};

const POWERUP_ORDER: Powerup[] = [
  'purse',
  'mana',
  'hoard',
  'lesson',
  'whetstone',
  'venom',
  'fortify',
  'dragonblood',
  'holyorders',
  'doomcall',
];

/** What this powerup will actually do, given the book you already hold. */
export function powerupEffect(state: RunState, up: Powerup): string {
  switch (up) {
    case 'purse':
      return '+10 gold.';
    case 'hoard':
      return '+25 gold.';
    case 'mana':
      return state.mana >= MANA_CAP
        ? `Your meter is full, so this one is symbolic. He presses ${SYMBOLIC_GOLD.mana} gold on you instead, which is still better than nothing.`
        : `+2 mana for this walk. You would sit down with ${Math.min(MANA_CAP, state.mana + 2)} of ${MANA_CAP}.`;
    case 'whetstone':
      return state.mana >= MANA_CAP
        ? `Nothing left to sharpen. Symbolic now, and worth ${SYMBOLIC_GOLD.whetstone} gold, which is still better than nothing.`
        : `+4 mana for this walk. You would sit down with ${Math.min(MANA_CAP, state.mana + 4)} of ${MANA_CAP}.`;
    case 'venom':
      return 'One of your pawns carries Poison for the rest of the walk. Which one is not up to you.';
    case 'fortify':
      return 'One of your rooks carries Taunt for the rest of the walk — four points of mana you did not spend.';
    case 'doomcall':
      return 'Your King learns Destined Death: once a game, after move 10, mark an enemy piece and it falls three of its turns later.';
    case 'lesson':
      return unlearned(state).length
        ? 'The Sorcerer teaches you one enchantment, now, for nothing.'
        : 'Nothing left to teach you, so he pays you 20 gold instead.';
    case 'dragonblood':
      return state.dragons >= 2
        ? `Both your knights already have it, and he offers a third draught anyway. You would own an imaginary dragon: no square, no moves, entirely yours. He is not joking, and he pays ${SYMBOLIC_GOLD.mana} gold towards the upkeep.`
        : 'One of your knights becomes a Dragon, in every game from here on. A Dragon moves as knight and bishop both.';
    case 'holyorders':
      return 'One of your bishops becomes an Archbishop, in every game from here on. He walks the diagonals as before, and instead of taking a piece he can bind it where it stands for a turn.';
  }
}

function unlearned(state: RunState): Enchantment[] {
  return SPELLBOOK.filter((e) => !state.taught.includes(e));
}

/** What each powerup is really made of.
 *
 *  Two from the same family is not a choice, it is the same reward at two sizes, and with only
 *  two on the table that wastes the whole decision: a Whetstone next to a Point of Mana is just
 *  the Whetstone, and a Hoard next to a Purse is just the Hoard. One from each family, always. */
const FAMILY: Record<Powerup, string> = {
  purse: 'gold',
  hoard: 'gold',
  mana: 'mana',
  whetstone: 'mana',
  lesson: 'lesson',
  dragonblood: 'dragon',
  holyorders: 'dragon',
  // The three that change the pieces themselves share a family, so a table never offers two
  // board-altering gifts at once and the choice stays "what kind of walk is this" rather than
  // "which of these two similar things is bigger".
  venom: 'army',
  fortify: 'army',
  doomcall: 'word',
};

/** Whether this powerup would do anything at all for this traveller right now.
 *
 *  Mana stays on the table at the cap — see `powerupEffect`. A full meter makes it a gesture
 *  rather than a gift, and the card says so, but a gesture with a few coins behind it still
 *  beats an empty half of the table. */
function worthOffering(state: RunState, up: Powerup): boolean {
  // Neither exotic piece exists on the road until Princess Rolain has put a dragon on the board
  // in front of you. Handing a traveller a Dragon before the seat that teaches what one *is*
  // spends the lesson before it is taught, and the Archbishop is stranger still.
  const metTheDragon = (state.beaten.rolain ?? 0) > 0;
  if (up === 'dragonblood') return metTheDragon;
  if (up === 'holyorders') return metTheDragon && state.archbishops < 2;
  // The Dark Word is Wittex's own, and it is not put in a traveller's hands at the first table.
  // After the Innkeeper: far enough in that the board has a shape to mark, early enough that a
  // rare thing is still worth hoping for.
  if (up === 'doomcall') return state.keeper && !state.doomCall;
  if (up === 'fortify') return state.fortifiedRooks < 2;
  if (up === 'venom') return state.venom.length < 4;
  return true;
}

/** Mana at the cap is worth this much in coin instead. Deliberately small: it is a consolation,
 *  not a second purse, and it should never make filling the meter feel like a reward. */
const SYMBOLIC_GOLD: Record<'mana' | 'whetstone', number> = { mana: 4, whetstone: 8 };

/** Two to choose between, drawn by weight, one from each family.
 *
 *  A choice, not a gift. A gift is a number going up while you watch; a choice is the moment you
 *  decide what kind of traveller this walk is going to be, and it is the only decision the road
 *  offers *between* boards. Two rather than three because a third option mostly turned the
 *  decision into a scan for the obvious best, and because with two the families have to differ,
 *  which is what makes it a decision at all. */
export function offerSpoils(state: RunState, rng: () => number = Math.random, count = 2): Powerup[] {
  const pool = POWERUP_ORDER.filter((up) => worthOffering(state, up));
  const picked: Powerup[] = [];
  const families = new Set<string>();
  while (picked.length < count) {
    const left = pool.filter((up) => !picked.includes(up) && !families.has(FAMILY[up]));
    if (!left.length) break;
    const total = left.reduce((sum, up) => sum + POWERUP[up].weight, 0);
    let roll = rng() * total;
    let chosen = left[left.length - 1];
    for (const up of left) {
      roll -= POWERUP[up].weight;
      if (roll < 0) {
        chosen = up;
        break;
      }
    }
    picked.push(chosen);
    families.add(FAMILY[chosen]);
  }
  return picked;
}

/** Hand it over. Everything here is permanent and survives every defeat. */
export function takePowerup(
  state: RunState,
  up: Powerup,
  rng: () => number = Math.random,
): RunState {
  switch (up) {
    case 'purse':
      return save({ ...state, gold: state.gold + 10 });
    case 'hoard':
      return save({ ...state, gold: state.gold + 25 });
    case 'mana':
      return state.mana >= MANA_CAP
        ? save({ ...state, gold: state.gold + SYMBOLIC_GOLD.mana })
        : save({ ...state, mana: Math.min(MANA_CAP, state.mana + 2) });
    case 'whetstone':
      return state.mana >= MANA_CAP
        ? save({ ...state, gold: state.gold + SYMBOLIC_GOLD.whetstone })
        : save({ ...state, mana: Math.min(MANA_CAP, state.mana + 4) });
    case 'lesson': {
      const left = unlearned(state);
      // A free lesson with nothing left to learn is an insult, so he pays instead.
      if (!left.length) return save({ ...state, gold: state.gold + 20 });
      const taught = left[Math.floor(rng() * left.length)];
      return save({ ...state, taught: [...state.taught, taught] });
    }
    case 'dragonblood':
      // Capped at both knights. A third would have nothing left to turn.
      // There are only two knights. A third draught buys an imaginary dragon, which is worth
      // exactly what it sounds like and a few coins for the trouble.
      return state.dragons >= 2
        ? save({ ...state, gold: state.gold + SYMBOLIC_GOLD.mana })
        : save({ ...state, dragons: Math.min(2, state.dragons + 1) });
    case 'holyorders':
      return save({ ...state, archbishops: Math.min(2, state.archbishops + 1) });
    case 'venom': {
      // Chosen here, once, and kept. Eight pawns, and the road never poisons more than half of
      // them: past that it stops being a hazard the opponent must respect and becomes a wall
      // they cannot approach.
      const free = PAWN_FILES.filter((f) => !state.venom.includes(f));
      if (!free.length) return save({ ...state, gold: state.gold + SYMBOLIC_GOLD.mana });
      const chosen = free[Math.floor(rng() * free.length)];
      return save({ ...state, venom: [...state.venom, chosen] });
    }
    case 'fortify':
      return save({ ...state, fortifiedRooks: Math.min(2, state.fortifiedRooks + 1) });
    case 'doomcall':
      return save({ ...state, doomCall: true });
  }
}

export type BoardMode = 'classic' | '960';

export interface RunState {
  /** Seats beaten in the attempt currently under way, in order. Empty between runs. */
  progress: House[];
  /** Always `'classic'` on the road, and kept in the state only so old saves deserialize.
   *
   *  The campaign is a fixed sequence of characters who each teach one thing, and it is hard
   *  enough to read a stranger's enchantments without also reading a back rank you have never
   *  seen. 960 lives in hotseat and online play, where both sides opt into it together. */
  mode: BoardMode;
  /** Whether an attempt is under way at all. A run you have lost is not resumed, it is retold. */
  active: boolean;
  gold: number;
  /** Enchantments the Sorcerer has taught. Permanent, and the only ones a run may spend on. */
  taught: Enchantment[];
  /** The Innkeeper has fallen at least once, ever. Earns the *right* to the back room; it
   *  does not open it. See `sorcerer`. */
  keeper: boolean;
  /** The back room is open for business.
   *
   *  Deliberately not the same thing as beating the Innkeeper. The road is one unbroken walk,
   *  and a shop you can duck into halfway along it turns the walk into errands. So the room
   *  opens when a walk *ends* — which for almost everyone means the first time they fall —
   *  and the seat that put you there is the one who tells you to go and learn something. */
  sorcerer: boolean;
  /** Set the first time Rolain falls: the King may choose a power from here on. */
  divineCall: boolean;
  /** Rolain's dragon, lent after your first fall at the Dragonlord's table. Permanent. */
  dragon: boolean;
  /** Spent once per lifetime: the fall at Kyrax's table that Rolain does not let end a run. */
  dragonUsedThisRun: boolean;
  attempts: number;
  /** Deepest seat ever reached, as an index into CAMPAIGN, for the ledger at the bar. */
  best: number;
  /** Runs that ended with the Dragonlord beaten. */
  clears: number;
  /** How many times each seat has ever been beaten, across every attempt. Drives the halving
   *  purse — see `purseFor`. */
  beaten: Partial<Record<House, number>>;
  /** Gold actually handed over during the attempt now under way. Accumulated rather than
   *  recomputed, because with a decaying purse "what the seats in `progress` are worth" is no
   *  longer the same number as "what you were paid for them". */
  walkPurse: number;
  /** Permanent enchantment points earned from powerups, on top of the duelling four. Called
   *  mana in front of the player. */
  mana: number;
  /** Knights turned into Dragons by Dragonblood, permanently. Capped at two — there are only
   *  two knights to turn. */
  dragons: number;
  /** Bishops raised to Archbishops by Holy Orders. Capped at two, for the same reason dragons
   *  are: there are only two bishops to raise. Lost with the run. */
  archbishops: number;
  /** The files whose pawns the road has poisoned, this walk. Files rather than a count: the
   *  pawn is chosen once, when the gift is taken, and stays that pawn for the rest of the walk.
   *  Re-rolling it every board turned something to build around into weather. */
  venom: string[];
  /** Rooks given Taunt by the Gift of Fortification, this walk. */
  fortifiedRooks: number;
  /** The Dark Word: your King may speak Destined Death. Rare, and gone when the walk ends. */
  doomCall: boolean;
  /** Relics taken off the road's cleverest men. Permanent, like everything else in the book. */
  relics: Relic[];
  /** Whether the back room has been walked into since it opened. The Sorcerer's row glistens
   *  until it has, and never again: a door that opens for the first time should say so, and a
   *  thing that keeps asking for attention after you have given it is just noise. */
  sorcererSeen: boolean;
  /** Wittex has fallen at least once. The spell is lifted, the story is over, and the keeper
   *  starts offering to make the walk worse on request. */
  freed: boolean;
  /** Which of the keeper's three cruelties are switched on for the next walk. */
  trials: Trial[];
}

/* -- trials ---------------------------------------------------------------- */

/** What the keeper offers a traveller who has already finished the story.
 *
 *  Deliberately opt-in, and deliberately not a difficulty *setting* — you do not turn the game
 *  up, you agree to specific indignities, and each one is a sentence rather than a number. They
 *  stack, and nothing stops you taking all three. */
export type Trial = 'black' | 'timed' | 'deadly';

export const TRIAL: Record<Trial, { name: string; flavour: string; effect: string }> = {
  black: {
    name: 'The Second Chair',
    flavour: 'The keeper turns the board around before you sit down, and does not explain.',
    effect: 'You play Black. Every seat on the road moves first.',
  },
  timed: {
    name: 'The Glass',
    flavour: 'He puts an hourglass on the table. It is smaller than you were expecting.',
    effect: 'Five minutes each, every game, all the way to the wings. Run out and you have lost.',
  },
  deadly: {
    name: 'The Deadly Duel',
    flavour: '"They have been going easy on you," he says, which you are fairly sure is a lie about at least two of them.',
    effect: 'Every seat plays one notch above itself. The Dragonlord plays as Wittex did.',
  },
};

export const TRIALS: Trial[] = ['black', 'timed', 'deadly'];

const FRESH: RunState = {
  progress: [],
  mode: 'classic',
  active: false,
  gold: 0,
  taught: [],
  keeper: false,
  sorcerer: false,
  divineCall: false,
  dragon: false,
  dragonUsedThisRun: false,
  attempts: 0,
  best: 0,
  clears: 0,
  beaten: {},
  walkPurse: 0,
  mana: MANA_START,
  venom: [],
  fortifiedRooks: 0,
  doomCall: false,
  dragons: 0,
  archbishops: 0,
  relics: [],
  sorcererSeen: false,
  freed: false,
  trials: [],
};

function sanitize(raw: unknown): RunState {
  const value = (raw ?? {}) as Partial<RunState>;
  const progress = Array.isArray(value.progress)
    ? value.progress.filter((who): who is House => CAMPAIGN.includes(who as House))
    : [];
  const taught = Array.isArray(value.taught)
    ? value.taught.filter((e): e is Enchantment => ALL_ENCHANTMENTS.includes(e as Enchantment))
    : [];
  const relics = Array.isArray(value.relics)
    ? value.relics.filter((r): r is Relic => r === 'scroll-of-time' || r === 'book-of-immolation')
    : [];
  const beaten: Partial<Record<House, number>> = {};
  const rawBeaten = (value.beaten ?? {}) as Partial<Record<House, unknown>>;
  for (const who of CAMPAIGN) {
    const n = Math.max(0, Math.floor(Number(rawBeaten[who]) || 0));
    if (n > 0) beaten[who] = n;
  }
  return {
    ...FRESH,
    ...value,
    progress,
    taught,
    relics,
    beaten,
    walkPurse: Math.max(0, Math.floor(Number(value.walkPurse) || 0)),
    // `|| MANA_START` rather than `|| 0`: a save written before mana existed should sit down
    // with a traveller's purse, not an empty one.
    mana: Math.min(MANA_CAP, Math.max(0, Math.floor(Number(value.mana) || MANA_START))),
    dragons: Math.min(2, Math.max(0, Math.floor(Number(value.dragons) || 0))),
    archbishops: Math.min(2, Math.max(0, Math.floor(Number(value.archbishops) || 0))),
    mode: value.mode === '960' ? '960' : 'classic',
    gold: Math.max(0, Math.floor(Number(value.gold) || 0)),
    active: Boolean(value.active),
    // An older save that opened the shop on the win keeps it open: taking a room away from
    // someone who has already been shopping in it would be a worse bug than the one fixed.
    keeper: Boolean(value.keeper) || Boolean(value.sorcerer),
    sorcerer: Boolean(value.sorcerer),
    divineCall: Boolean(value.divineCall),
    dragon: Boolean(value.dragon),
    dragonUsedThisRun: Boolean(value.dragonUsedThisRun),
    attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
    best: Math.min(CAMPAIGN.length, Math.max(0, Math.floor(Number(value.best) || 0))),
    clears: Math.max(0, Math.floor(Number(value.clears) || 0)),
    sorcererSeen: Boolean(value.sorcererSeen),
    freed: Boolean(value.freed),
    trials: Array.isArray(value.trials)
      ? value.trials.filter((t): t is Trial => TRIALS.includes(t as Trial))
      : [],
  };
}

export function loadRun(): RunState {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...FRESH };
  }
}

function save(state: RunState): RunState {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* A traveller with no pockets still gets to play; the road just forgets him. */
  }
  return state;
}

/* -- the attempt ----------------------------------------------------------- */

/** Sit down at the bottom of the road with an empty ladder and whatever you have learned. */
export function beginRun(state: RunState): RunState {
  return save({
    ...state,
    progress: [],
    mode: 'classic',
    active: true,
    dragonUsedThisRun: false,
    walkPurse: 0,
    attempts: state.attempts + 1,
  });
}

/** The points the player brings to a seat on the road.
 *
 *  Four is the duelling budget and two strangers always get exactly that, because an even board
 *  is the whole point of a duel. The campaign is a different promise: it is a story about a
 *  nobody who walks into an inn with nothing and ends up at the Dragonlord's table, and that
 *  story does not work if you are the same size in the last chair as in the first.
 *
 *  So the road hands out mana, and mana is permanent. It survives defeat the way the book
 *  does — the road resets, you do not — and it is the reason to walk back up after a fall even
 *  once the purse for those seats has decayed to nothing. It arrives only through the spoils
 *  offered on a seat's *first* fall, so it cannot be farmed. */
export function campaignBudget(state: RunState): number {
  return Math.min(MANA_CAP, state.mana);
}



/** Whether beating this seat right now would be the first time, and so worth a point. */
export function firstBlood(state: RunState, who: House): boolean {
  return (state.beaten[who] ?? 0) === 0;
}

/** What this seat pays *now*, given how often it has already fallen to you.
 *
 *  Halved on every repeat and floored, so the Drunken Knight goes 4, 2, 1, 0. The road is meant
 *  to be walked, not mined: without this, the cheapest way to fill a book is to beat the first
 *  chair and resign, over and over, which is neither a game nor a story. A seat you have never
 *  reached still pays in full, so the incentive always points up the road. */
export function purseFor(state: RunState, who: House): number {
  return Math.floor(PURSE[who] / 2 ** (state.beaten[who] ?? 0));
}

/** A seat falls. Pays its purse, opens whatever gate it guards, and advances the ladder. */
export function winSeat(state: RunState, who: House): RunState {
  if (state.progress.includes(who)) return state;
  const progress = [...state.progress, who];
  const paid = purseFor(state, who);
  return save({
    ...state,
    progress,
    // The walk ends at the last seat of *this* traveller's road — which is Kyrax until he has
    // told you what he is doing there, and Wittex afterwards.
    active: who !== (knowsTheTruth(state) ? 'wittex' : 'kyrax'),
    gold: state.gold + paid,
    beaten: { ...state.beaten, [who]: (state.beaten[who] ?? 0) + 1 },
    walkPurse: state.walkPurse + paid,
    keeper: state.keeper || who === 'innkeeper',
    // Beating the last seat ends the attempt too, so a traveller who clears the road without
    // ever falling still finds the room open when they get back. Reaching Kyrax means the
    // Innkeeper fell on the way, so there is nothing further to check.
    sorcerer: state.sorcerer || who === 'kyrax',
    divineCall: state.divineCall || who === 'rolain',
    best: Math.max(state.best, progress.length),
    clears: state.clears + (who === 'kyrax' ? 1 : 0),
    freed: state.freed || who === 'wittex',
  });
}

/** What this seat is still worth robbing for: the relics it may drop that you do not own.
 *
 *  Shown on the road card, because a purse tells you what a seat is worth and nothing tells you
 *  what it is *for*. A ladder that lists who is carrying what stops being a queue and starts
 *  being a wishlist, and "Ardax has the Book" is a far better reason to walk back up than
 *  "Ardax pays 22". Nothing here is a secret; the Open Board runs to the loot as well. */
export function carriedBy(state: RunState, who: House): { relic: Relic; chance: number }[] {
  return (DROPS[who] ?? []).filter((d) => !state.relics.includes(d.relic));
}

/** How often it is actually on him, in words. A percentage reads like a spreadsheet; the road
 *  talks in odds you could say out loud. */
export function oddsInWords(chance: number): string {
  if (chance >= 0.5) return 'more often than not';
  const oneIn = Math.round(1 / chance);
  return `about one walk in ${oneIn}`;
}

/** Roll what the beaten seat was carrying, if anything.
 *
 *  Rolled once, on the win, and only for a relic you do not already own — a second Scroll of
 *  Time is not a reward, it is a shrug. Returns null far more often than not, which is the
 *  point: the drop is the reason this seat is worth reaching, and a certainty is not a reason. */
export function rollDrop(state: RunState, who: House, rng: () => number = Math.random): Relic | null {
  for (const { relic, chance } of DROPS[who] ?? []) {
    if (state.relics.includes(relic)) continue;
    if (rng() < chance) return relic;
  }
  return null;
}

/** Takes a relic and applies whatever it opens. Idempotent: finding one twice changes nothing. */
export function takeRelic(state: RunState, relic: Relic): RunState {
  if (state.relics.includes(relic)) return state;
  const taught =
    relic === 'book-of-immolation' && !state.taught.includes('immolation')
      ? [...state.taught, 'immolation' as Enchantment]
      : state.taught;
  return save({ ...state, relics: [...state.relics, relic], taught });
}

/** Mana taken home from a defeat, and the reasoning behind it.
 *
 *  A run that ends in a loss used to hand back nothing at all. Everything earned on the way was
 *  already banked, so the attempt was not *wasted* — but there was no moment of being paid for
 *  it, and a roguelike that never pays out on a loss teaches the player that losing is simply
 *  time spent. Reported as: the power scaling is tough and we do not reward for losses.
 *
 *  So falling further than you ever have before is worth a point of mana, permanently. It is
 *  tied to `best` rather than to the seat you died at, which is the whole design: you cannot
 *  farm it by losing to the Drunken Knight forty times, and it pays exactly when the road has
 *  actually taught you something — the run where you first reach the Wit, the run where you
 *  first reach Kyrax. It also eases the curve where the curve is steepest, because new ground
 *  is precisely where the seats outclass you. */
export function lessonEarned(state: RunState): number {
  return state.progress.length > state.best ? LESSON_GOLD : 0;
}

/** Gold for reaching ground you never had. Paid in coin rather than in mana because mana does
 *  not cross between runs any more — a defeat has to hand back the currency that does, or it
 *  hands back nothing. */
export const LESSON_GOLD = 15;

/** The attempt ends. Everything you were paid on the way is already banked — and if the
 *  Innkeeper has ever fallen to you, this is the walk back on which the back room opens. */
export function loseRun(state: RunState): RunState {
  const lesson = lessonEarned(state);
  return save({
    ...state,
    // `best` rises on a defeat as well as on a win: getting further and then losing is still
    // getting further, and if it did not count here the lesson could be earned twice.
    best: Math.max(state.best, state.progress.length),
    gold: state.gold + lesson,
    // Everything the walk itself built is left on the road. This is the line that makes the
    // game a roguelike rather than a ladder: strength is something you assemble inside a run
    // and lose with it, and what crosses over is gold and what gold has already taught you.
    mana: MANA_START,
    dragons: 0,
    archbishops: 0,
    venom: [],
    fortifiedRooks: 0,
    doomCall: false,
    progress: [],
    active: false,
    dragonUsedThisRun: false,
    sorcerer: state.sorcerer || state.keeper,
  });
}

/** Whether this defeat is the one that opens the back room, asked *before* `loseRun` runs. */
export function opensTheShop(state: RunState): boolean {
  return state.keeper && !state.sorcerer;
}

/** The one defeat that does not end an attempt: your first fall at the Dragonlord's table,
 *  where Rolain is waiting in the road with her dragon. Once per lifetime, and once per run
 *  after that only if it has not already been spent. */
export function canRideBackUp(state: RunState): boolean {
  return !state.dragonUsedThisRun;
}

export function lendDragon(state: RunState): RunState {
  return save({ ...state, dragon: true, dragonUsedThisRun: true, active: true });
}

/* -- the Sorcerer ---------------------------------------------------------- */

/** The back room has been seen. Idempotent, and never unset. */
export function seeSorcerer(state: RunState): RunState {
  return state.sorcererSeen ? state : save({ ...state, sorcererSeen: true });
}

export function canAfford(state: RunState, ench: Enchantment): boolean {
  return !state.taught.includes(ench) && state.gold >= PRICE[ench];
}

export function learn(state: RunState, ench: Enchantment): RunState {
  if (!canAfford(state, ench)) return state;
  return save({
    ...state,
    gold: state.gold - PRICE[ench],
    taught: [...state.taught, ench],
  });
}

/** Everything a campaign loadout is allowed to spend on. Online play does not call this.
 *  Reads the whole list rather than the Sorcerer's shelf, so a found relic is spendable. */
export function availableEnchantments(state: RunState): Enchantment[] {
  return ALL_ENCHANTMENTS.filter((e) => state.taught.includes(e));
}

/** The four the Divine Call opens. `chrono` is left out on the road because there is no clock
 *  out there for it to bend, and offering a power that cannot be used is a trap.
 *
 *  The Scroll of Time will add the Encore here once the engine can carry it. */
const DIVINE_CALL: PowerName[] = ['teleport', 'relocate', 'decree', 'revive'];

/** Before Rolain, the King has no power at all: he simply moves, like everyone else. */
export function availablePowers(state: RunState): PowerName[] | null {
  return state.divineCall ? DIVINE_CALL : [];
}

/** Turn one of the keeper's cruelties on or off. Only offered to a traveller who has finished
 *  the story, and only changeable between walks. */
export function toggleTrial(state: RunState, trial: Trial): RunState {
  const trials = state.trials.includes(trial)
    ? state.trials.filter((t) => t !== trial)
    : [...state.trials, trial];
  return save({ ...state, trials });
}

export const hasTrial = (state: RunState, trial: Trial): boolean => state.trials.includes(trial);

/* -- the ladder ------------------------------------------------------------ */

/** Whether this traveller has been told what the road is really for.
 *
 *  Kyrax cannot say it. He is under the same spell he is resisting, and the terms of it are that
 *  he may not name the man who cast it — until somebody has bested him often enough that the
 *  telling is no longer a favour he is doing them. Five times. */
export function knowsTheTruth(state: RunState): boolean {
  return (state.beaten.kyrax ?? 0) >= WITTEX_CLEARS_REQUIRED;
}

/** How many more times the Dragonlord has to fall before he will say it. */
export function clearsUntilTruth(state: RunState): number {
  return Math.max(0, WITTEX_CLEARS_REQUIRED - (state.beaten.kyrax ?? 0));
}

/** The seats this traveller's road actually has. Seven for everyone; eight for anyone who has
 *  beaten the Dragonlord enough times to be told why he was there. */
export function roadFor(state: RunState): House[] {
  return knowsTheTruth(state) ? FULL_ROAD : CAMPAIGN;
}

/** A seat is open when every seat before it has fallen *in this attempt*, and this one has not.
 *
 *  The second half matters and was missing. The first chair has no seats before it, so
 *  `slice(0, 0).every(...)` is vacuously true and the Drunken Knight stayed clickable after he
 *  had already been beaten — you could sit back down and play him again in the middle of the
 *  same walk. A seat you have beaten is behind you. */
export function isOpen(state: RunState, who: House): boolean {
  if (state.progress.includes(who)) return false;
  const road = roadFor(state);
  const index = road.indexOf(who);
  if (index < 0) return false;
  return road.slice(0, index).every((earlier) => state.progress.includes(earlier));
}

export function nextSeat(state: RunState): House | null {
  return roadFor(state).find((who) => !state.progress.includes(who)) ?? null;
}

/** What this attempt has actually been worth, for the card shown when it ends.
 *
 *  Read off the running total rather than recomputed from `progress`, because a seat's purse
 *  depends on how many times it has fallen *before* this walk. Recomputing would quote the
 *  full price of seats that paid half. */
export function purseSoFar(state: RunState): number {
  return state.walkPurse;
}

export function seatLabel(who: House): string {
  return HOUSE[who].label;
}

/** Wipe everything, including the book. The "begin a new adventure" button. */
export function resetRun(): RunState {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
  return { ...FRESH };
}
