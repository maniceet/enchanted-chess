import type { Action, Color, Enchantment, GameState } from '../engine/types';

/** House talk. The Innkeeper never shuts up, and you get to answer back. */

export type BanterMood =
  | 'greeting'
  | 'move'
  | 'captured'
  | 'lostPiece'
  | 'check'
  | 'inCheck'
  | 'win'
  | 'lose'
  | 'draw';

const INNKEEPER_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'Sit. The board is warm, the ale is not.',
    'Four points and a king’s trick. Same as everyone.',
    'I have played this table for thirty years. It has never once surprised me.',
  ],
  move: [
    'Hmm. I thought you could do better.',
    'A move. Technically.',
    'You are thinking. That is something.',
    'I have seen that idea before. It was buried out back.',
    'Take your time. The ale is already paid for.',
    'Careful now. The board remembers.',
  ],
  captured: [
    'You left that lying about. I tidied it away.',
    'Waste not.',
    'That one was always going to fall.',
    'A pity. It seemed fond of the square.',
  ],
  lostPiece: [
    'Take it. I have more.',
    'Ah. Well spotted, traveller.',
    'That was deliberate. Mostly.',
    'A calculated loss. I calculate poorly.',
  ],
  check: [
    'Your king is standing in a draught.',
    'Check. Do sit down again after.',
    'Mind him. Kings bruise easily.',
  ],
  inCheck: [
    'A moment. My king is being rude.',
    'Yes, yes, I see it.',
  ],
  win: [
    'The house wins. The house usually does.',
    'You will want another game. They always do.',
  ],
  lose: [
    'I lost on purpose. I cannot afford to lose a customer.',
    'Well played. Now buy something.',
    'Do not look so pleased. I was carrying the ale.',
  ],
  draw: [
    'A draw. Nobody drinks to a draw.',
    'Even. Like a good scale, and about as exciting.',
  ],
};

/** What you can say back, chosen from your own portrait. */
export const TRAVELLER_LINES: string[] = [
  'You did not expect that.',
  'A calculated blunder.',
  'I meant to do that.',
  'Your move, innkeeper.',
  'That was for the ale prices.',
  'Careful. I am only warming up.',
  'Hm.',
];

export function innkeeperSays(mood: BanterMood, rng: () => number = Math.random): string {
  const lines = INNKEEPER_LINES[mood];
  return lines[Math.floor(rng() * lines.length)];
}

/* ---------------------------------------------------------------------------
   Three regulars, three voices. The Innkeeper barely speaks, the Wit never
   stops, and the Drunkard is not really speaking at all.
--------------------------------------------------------------------------- */

/** He was somebody once, and the somebody he was is exactly the thing nobody in this town can
 *  remember. Three of these are the memory hole itself, said by the only man drunk enough to
 *  keep bumping into it. They read as rambling the first time through, which is the point. */
const DRUNKARD_NOISES = [
  '*hic*',
  'Mnnf.',
  'S’your go. Innit.',
  '*long swallow*',
  'Wasser that. Horse?',
  'Aye. Aye. Mm.',
  '*sets tankard down, misses table*',
  'I had a plan. Had it right here.',
  'I was at the castle, you know. Before.',
  'Before what? ...*long pause* ...that’s a good question, that.',
  'There was a year. I had it a minute ago.',
];

const WIT_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'Sit. I have already read the first eight moves you are considering.',
    'Do try something I have not buried before.',
    // A wise man on the road who talks more than he walks. He does not walk at all.
    'Everyone comes down this road eventually. I find it simpler to wait here.',
  ],
  move: [
    'Two moves ago that would have been clever.',
    'I saw that when you picked the piece up.',
    'You are playing the board. I am playing you.',
    'Go on. Take it. It is only slightly a trap.',
    'I have had this conversation further up the road. It went the same way.',
    'You are the ninth this season. I keep a count. It is not a long list.',
  ],
  captured: [
    'You left it out. I am not a charity.',
    'That was not a sacrifice, whatever you tell yourself.',
    'One down. I am counting, since you clearly are not.',
  ],
  lostPiece: [
    'Correct. Irritating, but correct.',
    'Fine. That was the one move I would have made.',
    'Enjoy it. It cost you the square.',
  ],
  check: [
    'Check. And the square after it, and the one after that.',
    'Your king has nowhere pleasant to be.',
  ],
  inCheck: ['Briefly inconvenient.', 'Yes. I had counted on that.'],
  win: [
    'Predictable, but well fought. Mostly predictable.',
    'You lost eleven moves ago. You only noticed now.',
    // The clue the whole reveal hangs on, and it has to pass for ordinary needling: a wise man
    // who has heard of the Dragonlord could say it. Only afterwards does "could not" become an
    // account of a game that was actually played, and lost.
    'The fool on the mountain could not do it either. What made you think you would?',
    'Everyone who sits here is on their way up that mountain. Almost nobody comes back down it.',
  ],
  lose: [
    // A defeat is the only thing that makes him say more than he means to. None of these name
    // anybody, and all of them are ordinary sourness on a first hearing: a clever man who has
    // heard of the Dragonlord, comparing you to him. Afterwards every one of them is an account
    // of a game that was actually played, and of a thing he is still in the middle of doing.
    'Hm. I will want that one back.',
    'How did you do that, when he could not?',
    'You broke my guard. Nobody breaks my guard. He never once managed it, and he had a whole valley behind him.',
    'Take the game. I am not playing for the game.',
    'No matter. I win in the end. Most of it is already won, and you are standing in it.',
  ],
  draw: ['A draw. Neither of us deserved better.', 'Even. Disappointing for us both.'],
};

/** The Innkeeper says one thing, and only at the end. */
export const INNKEEPER_FAREWELL = 'A fine game indeed.';

/** He is the same man who talked to you on the road, four seats ago, and he is not pretending
 *  otherwise any more. Nothing he says is a threat: he does not need to threaten. */
const WITTEX_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'You found the road under the road. Good. It was getting tedious being clever alone.',
    'The Dragonlord kept my secret for eleven years and never once asked me to. Sit.',
    'You have walked past me four times. Twice I let you win.',
  ],
  move: [
    'I know how this ends. I have known since the town.',
    'A word from me and that piece has three turns left. Choose which one you would miss.',
    'You are playing a game. I am finishing an errand.',
    'Kyrax fought me with a whole valley behind him. You have a book and a purse.',
  ],
  captured: [
    'It was already dead. I simply told it when.',
    'Everything here belongs to me eventually. Some of it early.',
  ],
  lostPiece: [
    'Take it. I have more of everything than you do.',
    'A piece. I have a kingdom asleep in its beds.',
  ],
  check: [
    'Your king. Mine, shortly.',
    'Run. There is a great deal of Shivlar to run to.',
  ],
  inCheck: [
    'Oh, well found. Nobody has done that in some time.',
    'Careful. I was beginning to enjoy this.',
  ],
  win: [
    'Go back to the inn. Drink something. Come again when you have grown.',
    'The town sleeps on. You did not wake it.',
  ],
  lose: [
    'Ah.',
    'Then it is lifted. I had almost forgotten what that would feel like for them.',
  ],
  draw: ['Neither of us. How very unsatisfying.'],
};

const KYRAX_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'You dare challenge me.',
    'Sit, small thing. The dragons are already awake.',
    'Others come here to drink. You came here to lose.',
  ],
  move: [
    'You move as though the board were flat.',
    'My dragons have been circling that square since you sat down.',
    'Go on. I have read to the bottom of this line already.',
    'That was the move I left open for you.',
  ],
  captured: [
    'Taken. Dragons do not negotiate.',
    'You fed it to me. I did not even lean.',
    'One less thing between us.',
  ],
  lostPiece: [
    'A scratch. You will not land the second.',
    'Take it. I have wings you do not.',
    'Even a dragon spares a scale now and then.',
  ],
  check: [
    'Your king runs. They always run.',
    'Check. There is no wall high enough.',
  ],
  inCheck: [
    'Amusing. Briefly.',
    'You have my attention. Do not waste it.',
    'Careful. There are worse things at the end of a road than me.',
  ],
  win: [
    'As it was always going to end.',
    'You challenged a Dragonlord. This is the price of the tale.',
  ],
  lose: [
    'You... beat me. Say nothing of this. Not yet.',
    'Impossible. And yet. Well fought, traveller.',
    // Sets up the five defeats without announcing them.
    'Again. Come back and do it again, and keep doing it, and one day I will be able to tell you why.',
    'Do not celebrate where you can be overheard. There is very little in this valley that is not.',
  ],
  draw: ['A draw. I will remember you for that alone.', 'Neither burned. Rare.'],
};

/** Rolain, for a moment, not saying the thing she always says.
 *
 *  She is inside the working as much as the town is: everything she is certain about her father
 *  she was told at six years old. It does not hold perfectly. Now and then, and only when she
 *  has just been beaten and has nothing rehearsed to fall back on, something older gets through
 *  and she cannot keep hold of it.
 *
 *  Deliberately rare and deliberately not repeatable on demand — a player should half doubt they
 *  saw it, mention it to somebody, and be told the road does that sometimes. */
const ROLAIN_LUCID: string[] = [
  '"My father was an honourable man." She stops, and looks as though she has dropped something. "I have not thought that in years."',
  'She does not say the thing she always says. "He was kind, before. Beat him. Do not kill him."',
  '"Save him." Very quietly. Then she frowns, as if somebody else had said it. "Ride on."',
  '"Something is wrong here and I cannot hold on to what." A breath. "Ignore me. Go and beat my brother."',
];

/** How often it gets through. One beating in five, so a traveller who takes her once may never
 *  see it at all and one who keeps coming back will. */
const LUCID_CHANCE = 0.2;

const ARDAX_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'My father would not have come down for this. I did.',
    'You have beaten tavern men. I brought a dragon.',
    'Try to make it interesting. I have flown a long way.',
  ],
  move: [
    'You are playing the pieces you can see.',
    'My dragon does not walk. Do keep up.',
    'Hm. Bolder than the innkeeper, at least.',
    'That square was never yours.',
  ],
  captured: [
    'Taken, and barely a detour.',
    'You left it in the open. Dragons notice.',
  ],
  lostPiece: [
    'Fairly done. It will not happen twice.',
    'Ah. You have been practising.',
  ],
  check: ['Your king is out in the wind.', 'Check. Wings reach further than horses.'],
  inCheck: ['A moment.', 'Noted. Not feared.'],
  win: [
    'Come back when you can answer a dragon.',
    'You did well. Well is not enough.',
  ],
  lose: [
    'You beat a prince. My father will hear of it, unfortunately.',
    'Take the win. He will not be so gentle.',
    // The son has noticed something and filed it under his father being difficult.
    'He will not even be angry. He has not been angry in eleven years. He has been something else.',
    'Go up, then. Ask him why he never leaves that hall. He will not answer, but ask.',
  ],
  draw: ['A draw with a dragon on the board. Respectable.', 'Neither of us wanted the risk.'],
};

const ROLAIN_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'So you are the one who means to unseat my father.',
    'Watch the dragon, not me. It is the dragon that will teach you.',
    'I will not go easy. Going easy would be a lie, and lies get people killed at that castle.',
  ],
  move: [
    'A dragon leaps like a knight and runs like a bishop. Both. Always both.',
    'You are watching the wrong half of the board.',
    'Better. Now do it when it costs you something.',
    'My father will not announce his dragons the way I do.',
  ],
  captured: [
    'That is what the second half of the move does.',
    'Taken. Remember the shape of it.',
  ],
  lostPiece: [
    'Good. You saw it coming.',
    'Yes. That is exactly how you answer a dragon.',
  ],
  check: ['Check. A dragon reaches further than you think.', 'Your king is on a diagonal. Mind it.'],
  inCheck: ['Neatly done.', 'Hm. You have been listening.'],
  win: [
    'Not yet. Learn the shape and come back.',
    'You will not beat my father with that.',
    // She was a child when the valley changed hands. Everything she is certain of, she was told.
    'He took this valley when I was six years old. Everyone knows that. Everyone says so.',
  ],
  lose: [
    'Good. Now the warnings. My brother raises what you kill, and my father shields what you cannot reach.',
    'You are ready for the road. Be wary at the gate.',
    'I have never asked him why he did it. You do not ask my father things.',
  ],
  draw: ['Even. That is more than most manage against a dragon.', 'A draw teaches almost as well.'],
};

const ARMORED_LINES: Record<BanterMood, string[]> = {
  greeting: [
    'None pass the gate.',
    'You may swing all day, traveller. The plate holds.',
  ],
  move: [
    'Hit it again.',
    'Steel does not tire.',
    'You are spending turns. I have plenty.',
  ],
  captured: ['Taken.', 'The gate stands.'],
  lostPiece: ['A dent. Nothing more.', 'You found the seam. Once.'],
  check: ['Move your king.', 'Check, traveller.'],
  inCheck: ['Hm.', 'It will hold.'],
  win: ['The gate stands. Come back in better armour.', 'None pass.'],
  lose: [
    'You found the seams. Go on, then. The gate is yours.',
    'Well struck. Few strike that well.',
    // He has stood at this gate a long time and nobody has ever told him what for.
    'Go up. I have stood here eleven years and nobody has ever told me what I am keeping out.',
  ],
  draw: ['Neither of us moved the other. Fitting.', 'A stalemate at a gate is still a gate held.'],
};

export type Voice =
  | 'drunkard'
  | 'innkeeper'
  | 'rolain'
  | 'wit'
  | 'armored'
  | 'ardax'
  | 'kyrax'
  | 'wittex';

export function houseSays(
  voice: Voice,
  mood: BanterMood,
  rng: () => number = Math.random,
): string {
  if (voice === 'drunkard') return fromPool(DRUNKARD_NOISES, rng);
  if (voice === 'wit') return fromPool(WIT_LINES[mood], rng);
  if (voice === 'kyrax') return fromPool(KYRAX_LINES[mood], rng);
  if (voice === 'wittex') return fromPool(WITTEX_LINES[mood], rng);
  if (voice === 'ardax') return fromPool(ARDAX_LINES[mood], rng);
  if (voice === 'rolain') {
    // Only when she has just lost: she has no script for that, and the spell is thinnest there.
    if (mood === 'lose' && rng() < LUCID_CHANCE) return fromPool(ROLAIN_LUCID, rng);
    return fromPool(ROLAIN_LINES[mood], rng);
  }
  if (voice === 'armored') return fromPool(ARMORED_LINES[mood], rng);
  return innkeeperSays(mood, rng);
}

/* ---------------------------------------------------------------------------
   Enchantment talk. The house has met all of this before, and says so.
   New enchantments will want their own lines here as they are added.
--------------------------------------------------------------------------- */


/** What the house says when it breaks one of your shields. */
const BREAKS_SHIELD = [
  'I break through anything, given a turn.',
  'I have countered this spell more times than you have cast it.',
  'Pretty work. Now it is scrap.',
  'A shield is only a promise. Promises break.',
];

/** What it says when you break one of its shields. */
const SHIELD_BROKEN = [
  'Fine. It was only steel.',
  'You spent a whole turn on that. I noticed.',
  'One hammer blow. How direct of you.',
];

/** What it says when it takes an enchanted piece of yours. */
const TOOK: Record<Enchantment, string[]> = {
  taunt: ['Undefended and enchanted. Bold.', 'The shield was down. So is the piece.'],
  martyr: ['Chained again. I know this trick and I take the piece anyway.', 'Hold still, would you.'],
  outpost: ['No pawn could touch it. I am not a pawn.', 'A fine little fort. I came round the side.'],
  swift: ['Fast. Not fast enough.', 'It ran the whole board to reach me. Efficient.'],
  herald: ['That one was going to be a queen. Was.', 'I do not let heralds finish their message.'],
  poison: ['Poison, in my own house. Rude.', 'Ah. That is going to sting for a while.'],
  immolation: ['It went up. Half my ground went with it.', 'Fire. In a room this small. Wonderful.'],
};

/** What it says when you take an enchanted piece of its. */
const LOST: Record<Enchantment, string[]> = {
  taunt: ['The shield was the whole idea. You found the gap.', 'Steel is expensive. Enjoy it.'],
  martyr: ['Take it. Your hand is tied for a turn now.', 'It died usefully. Most things here do not.'],
  outpost: ['You brought something bigger than a pawn. Sensible.', 'Fine. It was only holding ground.'],
  swift: ['Caught it standing still. Rare.', 'It was going somewhere. Not any more.'],
  herald: ['You stopped the message. That is the correct answer.', 'Well spotted, traveller.'],
  poison: ['Careful. That one bites on the way down.', 'Drink up. You will want to.'],
  immolation: ['Stand back, traveller. That one does not go quietly.', 'You may regret where you were standing.'],
};

const POISONED = ['That was poisoned and I knew it. I did it anyway.', 'Worth it. Probably.'];
const FROZEN_SELF = ['Now my hand is tied. Briefly.', 'Chained for a turn. I have waited longer for slower guests.'];

function fromPool(pool: string[], rng: () => number): string {
  return pool[Math.floor(rng() * pool.length)];
}

/** A line about the action that was just played, from the house's point of view. */
export function houseCommentary(
  before: GameState,
  action: Action,
  after: GameState,
  house: Color,
  voice: Voice = 'innkeeper',
  rng: () => number = Math.random,
): string {
  const mover = before.turn;
  // The drunkard has no opinions about enchantments. He has noises.
  if (voice === 'drunkard') return fromPool(DRUNKARD_NOISES, rng);

  if (action.type === 'shieldBreak') {
    return fromPool(mover === house ? BREAKS_SHIELD : SHIELD_BROKEN, rng);
  }

  if (action.type === 'power') {
    return mover === house
      ? 'A house rule, spent. I only get the one.'
      : 'So that is what you were saving.';
  }

  if (action.type === 'move') {
    const victim = before.board[action.to];
    if (victim) {
      const pool = mover === house ? TOOK : LOST;
      const ench = victim.ench;
      if (ench) return fromPool(pool[ench], rng);
      return houseSays(voice, mover === house ? 'captured' : 'lostPiece', rng);
    }
    // A capture that cost the capturer, or froze it, is worth remarking on.
    const landed = after.board[action.to];
    if (mover === house && !landed) return fromPool(POISONED, rng);
    if (mover === house && landed && after.frozen.some((f) => f.pieceId === landed.id)) {
      return fromPool(FROZEN_SELF, rng);
    }
  }

  return houseSays(voice, 'move', rng);
}
