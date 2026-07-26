import type { House } from '../engine/ai';
import { RELIC, type Relic } from './run';

/** The road, told in cards. One before each opponent and one after you beat them.
 *  Every card is short on purpose: it is a beat, not a chapter. */

export interface StoryCard {
  title: string;
  lines: string[];
  /** A single line of rules teaching, when the encounter exists to teach something. */
  lesson?: string;
  /** Overrides the default "Onward" when the card is pushing you somewhere specific. */
  cta?: string;
}

export const PROLOGUE: StoryCard = {
  title: 'The Law of Lothar',
  lines: [
    'You come down out of the hills at dusk, and the town does not look up. A woman draws water, sees the road behind you, and carries her bucket indoors. Whatever they say here, they have learned to say it quietly.',
    'A banner hangs over the well. Black, and on it a dragon, and every eye in the square has spent so long avoiding it that avoiding it has become a habit nobody remembers forming.',
    'They give you the rest in whispers, a piece at a time, none of them willing to hold the whole of it. Kyrax the Dragonlord holds this valley. No blade has taken him. No army will.',
    'But the law of Lothar is older than the Dragonlord, and older than his banner, and the law does not care which of them came first. A defeat upon the enchanted board binds as surely as a defeat in the field. He may not refuse a challenger. He has simply never needed to.',
    'So there is a way to the man after all. It is sixty four squares long. It begins at a table in this town and it ends at his.',
    'You have a season, a road, and a name nobody has heard. The inn is warm and the first board is already set. Start there.',
  ],
  // The one thing about the run economy a traveller cannot work out by clicking, said once,
  // here, where a card is already stopping them to be read. It used to stand on the home
  // screen permanently, which meant it was read once and became furniture thereafter.
  lesson:
    'The road is one unbroken walk: lose anywhere and it starts again at the taps. Every seat you beat pays gold whether or not the walk survives, and gold is the only thing that keeps. Beat the Innkeeper and then come back beaten, and the room behind the bar opens — what the Sorcerer teaches you is permanent, and the Sorting Chest is where you lay it out across the mana you have gathered.',
};

/** A seat's victory card, with what fell out of his coat added to the end of it.
 *
 *  Appended rather than replacing: the beat you earned is the beat you get, and the relic is a
 *  postscript to it. Writing a separate card would mean choosing between the story and the
 *  loot, and a player who finally beat Prince Ardax deserves both. */
export function relicCard(base: StoryCard, relic: Relic): StoryCard {
  return {
    ...base,
    lines: [
      ...base.lines,
      `He was carrying something he had no intention of giving you. ${RELIC[relic].flavour}`,
    ],
    lesson: RELIC[relic].grants,
    cta: 'Take it →',
  };
}

export const EPILOGUE: StoryCard = {
  title: 'The Valley, After',
  lines: [
    'The Dragonlord rises, looks a long moment at the board, and does not touch a piece. The law is the law, and he wrote none of it.',
    'Outside, somebody is already taking the banner down off the well.',
    'They will want to know your name at last.',
  ],
};

/** What Kyrax says on each defeat, and why he cannot simply say it on the first.
 *
 *  He is under the same working he is resisting, and its terms are that he may not name the man
 *  who cast it. What he *can* do is be beaten so often that the telling stops being a favour and
 *  starts being a fact, and that is what these are: five defeats, five pieces of it, and the
 *  last one is the name. A player who beats him once and leaves never learns any of this, which
 *  is exactly what the spell was for. */
const KYRAX_TELLS: string[][] = [
  [
    'He does not rise, and he does not sweep the pieces off, and something in the way he sits is wrong for a man who has just lost a kingdom.',
    '"There is a thing I would tell you," he says, "and I find I cannot. Not the words. Something else has them."',
    'He sets the pieces back up. All of them, his and yours, as if the next game were already arranged.',
    '"Come back and beat me again. It loosens."',
    'On the way out you notice the hall has no guards in it, and that it has never had any, and that a man holding a valley by force would have thought of that.',
  ],
  [
    '"Twice," he says. "You are becoming a nuisance, and I find I have not enjoyed anything this much in eleven years."',
    'He starts a sentence, and stops, and the stopping is not a choice — you watch it happen to him.',
    '"Nearer," he says. "Come back. I am buying something with these losses and it is not my pride."',
    'Eleven years. You do the arithmetic on the walk down. The banner over the well is newer than that. Whatever happened here, the dragon was the second thing.',
  ],
  [
    'He is quiet for a long time after this one.',
    '"You will have heard I took this valley," he says at last. "Ask the keeper how old he was when the town stopped talking. Then ask him what he remembers about the year before that."',
    '"He will not be able to tell you. That is the answer."',
    '"And I cannot tell you either, yet. Twice more. Come back twice more and I will be able to say a name out loud, and you will wish I could not."',
  ],
  [
    '"My daughter believes the story," he says. "She rode out to teach you the shape of a dragon so that you would be able to unseat me, and I have never once told her she was wrong, because the moment I do he will know that I can."',
    'He puts a piece back on its square with enormous care.',
    '"There is a man on your road who talks more than he walks. Think about how far he actually walks."',
    '"Once more. One more and the working thins enough to let the name through. Do not make me wait — I have been waiting eleven years and I have got very bad at it."',
  ],
  [
    'The fifth time, he simply says it.',
    '"Wittex. Dark Lord Wittex, of Shivlar, and he has been sitting in the middle of your road wearing a smaller name and giving you advice. He put this valley to sleep eleven years ago. I noticed. So he put something on me instead, and hung a banner over the well, and let a whole country learn to hate the only man in it who is still awake."',
    '"I could not say his name until you had beaten me enough times that saying it was not a plea. That is how the working was built. He is thorough."',
    'He stands, finally, and he looks tired rather than defeated.',
    '"Go south. The road does not end here. It never did."',
  ],
];

/** Once the name is out there is nothing left to withhold, so every later defeat is the same
 *  beat: he is glad you came, he is still bound, and he sends you south with the one piece of
 *  advice that matters at the eighth table. */
const KYRAX_BOUND: string[] = [
  'He is on his feet before the last piece is down, which he never used to be.',
  '"Good," he says. "Good. Go and do that to him."',
  'You ask him — you have to ask him — why he still plays to win, now that you both know.',
  '"Because it is not a costume." He says it without heat. "The working is still on me. It moves my hand whether I like the man it moves it for or not. Every time you sit down there I will try to end you, and every time you get up again is a piece of me he does not own."',
  '"So do not be gentle. Being gentle with me is how he wins twice."',
  'At the door he says the last of it, and it is the only time his voice goes anywhere near kind.',
  '"Beware Destined Death. He names a piece of yours and it simply dies, three turns on, and he may name another the turn after that, and another. No King alive gets to do that twice. He does. I hope you can beat him. I could not."',
];

/** The card shown when the Dragonlord falls, given how many times he has fallen before. */
export function kyraxCard(timesBeatenBefore: number): StoryCard {
  const naming = timesBeatenBefore === KYRAX_TELLS.length - 1;
  const bound = timesBeatenBefore >= KYRAX_TELLS.length;
  const tell = bound ? KYRAX_BOUND : KYRAX_TELLS[timesBeatenBefore];
  return {
    ...EPILOGUE,
    title: naming ? 'The Name' : bound ? 'Not A Costume' : EPILOGUE.title,
    lines: [...EPILOGUE.lines, ...tell],
    lesson: naming
      ? 'The road has an eighth seat now, and it always did. Dark Lord Wittex carries Destined Death: once in the game, and not before move ten, he names one of your pieces and it dies three of your turns later. It moves and captures normally until the hour comes.'
      : bound
        ? 'Destined Death comes once and lands after move ten. Trade a marked piece off, or spend it, before the third turn takes it for nothing.'
        : undefined,
    cta: naming ? 'South →' : undefined,
  };
}

/** Sitting down opposite him after the name is known. He is on your side and it changes
 *  nothing about the next two hours, which is the point of what was done to him. */
export const KYRAX_BOUND_STILL: StoryCard = {
  title: 'The Dragonlord, Still Bound',
  lines: [
    'He knows why you are here, and he knows it is not for him any more. He sets the board out anyway.',
    '"You are going south afterwards," he says. It is not a question. "Good. Then let me be the last hard thing before the worst one."',
    'He turns his King to face you, and there is nothing apologetic in it.',
    '"Understand me: I am glad you came, and I am going to try to take your head off. The working does not care that we agree. It only cares that I sit here and play well, and I have never in my life known how to do that badly."',
    '"Good luck, traveller. Sincerely, and starting after this game."',
  ],
  lesson:
    'Nothing is softer for the truth being out. He plays the same board with the same dragons, and beating him again is still the only way south.',
};

/** The interlude. Nobody takes the Dragonlord at the first sitting, and the road does not end
 *  there: it turns, once, and comes back up the mountain with a dragon on it. */
export const ROLAIN_LENDS: StoryCard = {
  title: 'What Are You Doing Here',
  lines: [
    'You do not remember leaving the hall. You remember the board, and the two dragons on it, and the particular silence of a man who never had to think.',
    'The grey horse is standing in the road outside, and Rolain is standing beside it with her arms folded.',
    '"What are you doing here," she says. It is not a question. "You went in with a season of practice and a borrowed opinion about dragons. Of course he broke you."',
    'You start to say something about the law, and about how the law is the only thing left. She is not listening. She is unbuckling the harness.',
    '"Then take mine."',
    'The dragon comes off her hand and onto yours the way a hawk changes arms: no ceremony, all weight. And it is shielded, which hers has never been. "He does not bother," she says. "He has two and he has never needed to. I have one and I am lending it to somebody he has already beaten, so it goes out wearing steel."',
    '"My father taught me that board," she says, mounting. "He did not teach me everything he knows. He taught me everything he thinks is worth knowing, which is not the same thing, and it is the gap you will beat him in."',
    'You thank her. It comes out badly. She is already riding.',
    '"Go back up," she calls, without turning. "He will not have moved."',
  ],
  lesson:
    'Her dragon takes the place of one of your knights, and it carries her Taunt. Everything else is exactly as you built it: your own enchantments are untouched, your King keeps his power, and the dragon costs you nothing from the four. It is lent, not bought.',
  cta: 'Ride back up →',
};

type Beat = { before: StoryCard; after: StoryCard };

export const STORY: Record<House, Beat> = {
  drunkard: {
    before: {
      title: 'The Drunken Knight',
      lines: [
        'He was somebody once. You can tell from the way he sits, and from the fact that nobody at the inn will take the seat opposite him.',
        'He waves you into it without looking up. His hand finds a piece the way a hand finds a cup: by habit, and not always the right one.',
      ],
      lesson:
        'Every piece moves as it always has. What is new is the mana each captain spends on enchantments before the first move, and the one power the King may call.',
    },
    after: {
      title: 'A Cup, Freely Given',
      lines: [
        'He loses, notices, and buys you a drink about it.',
        '"Talk to the keeper," he says. "He does not drink, and he does not miss."',
      ],
    },
  },

  innkeeper: {
    before: {
      title: 'The Innkeeper',
      lines: [
        'The keeper wipes the same spot on the bar until you sit down, and then sets the board between you without a word.',
        'He does not explain. He simply takes whatever you leave lying about, until you stop leaving it.',
      ],
      lesson:
        'Both loadouts are shown before White moves. Nothing here is hidden, so anything that beats you was on the table the whole time.',
    },
    after: {
      title: 'A Fine Game Indeed',
      lines: [
        '"A fine game indeed," he says, and means it, which from him is a parade.',
        'Then he sits back, and the warmth goes out of it. "Understand what you have just done. Me and the knight, that was the taps. Everyone gets the taps. What comes after does not care how you did here."',
        '"From the milestone on they bring things to the board that you have not seen and cannot yet answer, and they are not being sporting about it. You will lose. Probably several times. That is not the road going wrong, that is the road."',
        'He tells you it passes a woman on a grey horse, and that you should let her teach you what she offers, because she is the last person on it who will offer anything for free.',
      ],
    },
  },

  rolain: {
    before: {
      title: 'Princess Rolain',
      lines: [
        'She hears about you before she sees you: a traveller who means to unseat the Dragonlord, over a board, under the old law.',
        'She rides into the inn yard to see whether the story is worth anything, and brings a dragon with her.',
        '"You have never played one," she says. "He rides two. You will not learn them at his table, with both of them already on you. You will learn one here, from me, slowly."',
      ],
      lesson:
        'A Dragon moves as a knight and as a bishop, both. She brings one. Her father brings two, and neither of them wears anything: on that board the dragons are the whole of the difficulty and there is nothing else to strip off them first.',
    },
    after: {
      title: 'Two Warnings',
      lines: [
        '"Good. You saw the shape of it." She is already turning the horse.',
        '"Take this as well, since you have earned it and nobody else was going to offer. They call it the Divine Call: one word from your King, once in a game, spent instead of a move. He can throw a piece across the board, or trade places with one, or still an enemy where it stands, or call a fallen piece back up. Choose which word he knows before you sit down."',
        '"Two things, then. My brother practises necromancy, so what you take from him does not always stay taken. And there is a man in full plate at the fifth table who has spent every point he owns on shields, which is a stupid way to build an army and a very annoying one to sit opposite."',
        '"Learn the shield on him, because it is the only thing he has. It only works in his own half — a shield is a thing you stand behind, not a thing you carry, and it sleeps the moment its owner crosses the middle. Make him come to you. Everyone forgets. Do not be everyone."',
        '"Beat them anyway."',
      ],
    },
  },

  wit: {
    before: {
      title: 'The Wit',
      lines: [
        'A thin man is sitting on the milestone with a board already set, as though the road were expected to provide him an opponent and had simply been slow about it.',
        '"They call me the Wit," he says. "You will find out why, and you will not enjoy it."',
      ],
      lesson:
        'The King may call one power in the whole game, instead of moving, and never while in check.',
    },
    after: {
      title: 'When To Spend It',
      lines: [
        '"Hm," he says, which from him is an ovation.',
        '"You have the Divine Call already. The princess gave it to you, which is very like her, and she will not have told you the difficult part, which is very like her too."',
        '"The difficult part is this: it is one word, once, and every position in the game will look like the right one. Spend it early and you have bought a small advantage at full price. Hold it forever and you die with it in your mouth."',
        '"Spend it on the move that is impossible without it. Not the good move. The impossible one. If you cannot name what it makes possible, you are not ready to say it."',
      ],
    },
  },

  armored: {
    before: {
      title: 'The Armored Knight',
      lines: [
        'The gate of the castle is shut, and something in full plate is standing in front of it that has clearly been standing there a long while.',
        '"None pass," he says, and sets a board on the stone without unbuckling anything.',
      ],
      lesson:
        'Every pawn he owns is armoured, which is to say every pawn carries Taunt. On his own four ranks, any pawn he defends costs you a whole turn to strip before it can be taken at all — and a wall of them is a wall you have to open twice. Plate is for standing in, though. The moment one of his crosses the middle to come at you, it is wearing weight and nothing else.',
    },
    after: {
      title: 'The Seams',
      lines: [
        '"You found the seams," he says. "Few do."',
        '"They are always in the same place, you know. A man in plate has to come to you eventually, and no armour was ever forged that works on someone else\'s ground."',
        'He steps aside exactly one pace, which is all the gate needs.',
      ],
    },
  },

  ardax: {
    before: {
      title: 'Prince Ardax',
      lines: [
        'The Dragonlord’s son keeps the inner hall, and he has been waiting for you with the particular patience of a man who has already imagined this going well.',
        'There is a dragon behind him wearing a shield, and something under the floor that you decide not to think about.',
      ],
      lesson:
        'He calls Revive: one piece back from his graveyard, onto an unattacked square in his own half, paid for out of the points he did not spend.',
    },
    after: {
      title: 'What Does Not Stay Down',
      lines: [
        '"You beat a prince," he says. "My father will hear of it, unfortunately for me."',
        'He does not stand aside so much as stop occupying the doorway.',
      ],
    },
  },

  /** The truth, and the only seat whose "before" card is a reveal rather than a greeting. */
  wittex: {
    before: {
      title: 'Dark Lord Wittex',
      lines: [
        'You take the road out of the valley and it does not go where it went before. It bends south, past the well, past the town that is still asleep with its eyes open, and it keeps going until the country stops being a country.',
        'Shivlar has no banner. It does not need one. Nobody here is pretending to be free.',
        'The wise man is sitting at the end of it with a board already set, and he does not stand up, and he does not stop being the wise man. That is the worst part. You liked him.',
        '"You will want an explanation," says Wittex, "and I find I want to give you one, which is new. Eleven years ago I put a valley to sleep. Kyrax was the only man in it who noticed, so I put something on him instead, and he has spent eleven years being hated for a crime he was the only one resisting."',
        '"His daughter believes the story. So did you. Stories are the cheapest spell there is."',
        'He turns the board a quarter turn, the way a man does when he intends to be here a while.',
      ],
      lesson:
        'He carries Destined Death. Once in the game, and not before move ten, he names a piece of yours and it dies three of your turns later — moving it does not help, defending it does not help, and nothing lifts it. It moves and captures normally until the hour comes, so the three turns are yours to spend. He will not name your Queen.',
    },
    after: {
      title: 'Nothing Lifts',
      lines: [
        'He looks at the board for a long moment, and then he laughs, once, without any of it reaching his face.',
        '"Eleven years," he says. "And a traveller with a borrowed dragon and a book they bought secondhand."',
        'Then he stands, and he is not there. Not a door, not a flourish, not a word — the chair is simply empty and the board is still warm on his side of it.',
        'You wait a while. You are not sure what for.',
        'The walk back is the long one, and you feel it before you see it: the air over the valley has not changed. The banner is down at the well, and the shutters are still shut behind it. A woman comes out for water, looks at the road, and carries her bucket indoors.',
        'Rolain finds you on the way in. She has been to see her father. "It is still on him," she says, and there is no give in her voice at all. "He is still holding it closed. Whatever you beat down there, it was not the thing that is doing this."',
        'The keeper has your table ready and does not ask how it went, which is how you know it shows.',
        '"Then he was not the top of it," he says at last. "Somebody set that man on a road and told him to sit down. Eleven years is a long time to be somebody else\u2019s piece."',
      ],
      lesson:
        'The Dark Lord is beaten and the curse is still in the air. Something further up has not been found yet, and the road does not reach it — not this road, not yet. That much of the story is still being written, and it will arrive in a later patch.',
    },
  },

  kyrax: {
    before: {
      title: 'Dragonlord Kyrax',
      lines: [
        'The hall is cold and very quiet, and the board is already set, and it has been set for some time.',
        '"You dare challenge me," he says, without any question in it.',
        'Two dragons. Both shielded. The old law between you, and nothing else.',
      ],
      lesson: 'No lesson here. Everything he has, you have already been shown.',
    },
    after: EPILOGUE,
  },
};

/** The end of an attempt. The road resets; what you were paid for walking it does not.
 *  `reached` is how many seats fell before this one, which is the only thing worth telling
 *  a traveller about the walk back. */
/** How a drawn game ended, in the seat's own terms.
 *
 *  A draw is not a defeat and reading one as a defeat is insulting, particularly a stalemate,
 *  which is usually a thing you *did* rather than a thing that happened to you. It is also the
 *  most misread result in chess, and Enchanted Chess adds a wrinkle worth stating outright:
 *  a shield-break and a King power both consume a turn, so a player who has one of those and
 *  no move at all is not stalemated. That rule decides games and is invisible until it does.
 */
export type DrawReason = 'stalemate' | 'fifty-move' | 'threefold' | 'material' | 'agreement';

export function drawCard(reason: DrawReason, justOpened = false): StoryCard {
  // A draw ends the attempt exactly as a defeat does, so it opens the back room exactly as a
  // defeat does — and it has to say so. Finding out from a new row on the menu is finding out
  // by accident.
  const opened = justOpened
    ? ' The keeper looks up as you come in, and tips his head at the door behind the bar. "You have the coin now," he says. "Go and learn something."'
    : '';
  if (reason === 'stalemate') {
    return {
      title: 'Nowhere To Put A Hand',
      lines: [
        'It ends without ending. Nobody is in check, and nobody can legally move a piece, and under the law of Lothar that is not a victory for either of you.',
        `A stalemate is a draw. You did not lose the board. You simply left your opponent no square to touch, and the law has nothing to say about a man who cannot move except that he does not have to.${opened}`,
      ],
      lesson:
        'Stalemate is a draw, and the road only counts a win: the walk ends here and starts again at the taps. Two things are worth knowing for next time. A shield-break spends a turn, and so does a King power, so a side that has one of those and no legal move is not stalemated at all. And when you are winning, a check is worth more than a capture — corner the King with a square left to him, not without one.' +
        (justOpened
          ? ' The Sorcerer will see you now: spend the gold, and lay it out in the Sorting Chest before your next walk.'
          : ''),
      cta: 'Back to the inn →',
    };
  }
  const lines: Record<Exclude<DrawReason, 'stalemate'>, string[]> = {
    agreement: [
      'You shake on it. Neither of you had anything left to prove over this particular board, and both of you knew it several moves ago.',
    ],
    'fifty-move': [
      'Fifty moves each and not one pawn pushed, not one piece taken. The board has stopped meaning anything and the law calls it a draw.',
    ],
    threefold: [
      'The same position, three times over. Whatever either of you was trying, you have both now tried it twice more.',
    ],
    material: [
      'There is not enough wood left on the board for anyone to be mated with. The law does not make men shuffle kings until dark.',
    ],
  };
  return {
    title: 'A Drawn Board',
    lines: [lines[reason][0] + opened],
    lesson:
      'A draw is not a win, and the road only counts wins. The walk ends here.' +
      (justOpened
        ? ' The Sorcerer will see you now: spend the gold, and lay it out in the Sorting Chest before your next walk.'
        : ''),
    cta: 'Back to the inn →',
  };
}

export function runOverCard(
  reached: number,
  purse: number,
  sorcerer: boolean,
  /** This is the defeat that opens the back room, so the card says so in the keeper's voice
   *  rather than leaving the player to notice a new row on the menu. */
  justOpened = false,
  /** Mana taken home for reaching new ground. A reward the player is not told about is not a
   *  reward, it is an accounting entry. */
  lesson = 0,
  /** Which attempt this was (beginRun counts it, so during a run it is already this walk's
   *  number) and the deepest seat ever reached before it. The card reads differently on a
   *  first fall than a ninth, and differently again when the walk died short of the player's
   *  own mark — a defeat screen that cannot tell those apart is not watching the player it is
   *  talking to. */
  attempts = 1,
  best = 0,
): StoryCard {
  const walk =
    reached === 0
      ? attempts <= 1
        ? 'You do not get out of the first chair. Somebody moves your cup for you, which is worse than laughing.'
        : 'The first chair, again. On a long enough road even the drunk gets an evening, and he has decided it is this one.'
      : reached < 3
        ? 'The walk back is short and nobody comments on it, which is its own kind of comment.'
        : reached < 5
          ? 'You get further than most and it does not matter, because the road does not pay for further. It pays for finished.'
          : 'You get close enough to see the shape of the end, and then you do not reach it. That is the worst distance there is.';

  // Fell short of ground already taken on an earlier walk. `lesson` is the opposite case —
  // new ground — and the two can never both be true.
  const shortOfBest =
    reached < best && lesson === 0
      ? attempts >= 6
        ? 'You have stood deeper on this road than you stood tonight, more than once. The road remembers that even on the evenings you make it hard to believe.'
        : 'You have been further than this. The road knows it too, and neither of you says anything about it.'
      : null;

  const restart =
    attempts <= 1
      ? 'Here is the shape of the thing, since nobody warned you: the road only counts an unbroken walk. It starts again at the taps — but gold stays spent into learning, and learning does not wash off.'
      : attempts >= 6
        ? 'It starts again at the taps. You know the speech by now — you could give it. The seats will be carrying something different when you come back; so, by now, will you.'
        : 'The road only counts an unbroken walk, so it starts again at the taps, and everyone on it will be carrying something different when you come back. They always are.';

  return {
    title: justOpened ? 'The Door Behind The Bar' : 'Back To The Inn',
    lines: [
      walk,
      ...(shortOfBest ? [shortOfBest] : []),
      restart,
      // Seats pay when they fall, not when the walk ends: `winSeat` banks the purse and
      // `loseRun` banks nothing. Say so, or a traveller watches the counter refuse to move
      // on this very screen and concludes the house is skimming.
      purse > 0
        ? `The ${purse} gold you were handed along the way is already in your pocket, seat by seat as you took them, and a defeat does not reach back for it.`
        : 'Nobody hands you anything, because you covered no ground. That is the honest rate.',
      ...(lesson > 0
        ? [
            'And you went further than you have ever gone. Nobody pays you for it and nobody says well done, but you sit down differently next time, and the difference is real: **+1 mana, permanently.** The road only teaches this way, by taking you somewhere new and then beating you there.',
          ]
        : []),
      justOpened
        ? 'The keeper is drying a glass when you come in, and he does not ask. He tips his head at the door behind the bar, the one you have walked past every night this week. "You have the coin now," he says. "Go and learn something. Walking it again the way you walked it will only get you here again."'
        : sorcerer
          ? 'The Sorcerer keeps his lamp on. He is not sympathetic, he is just open, and what he teaches does not wash off in a defeat.'
          : 'Beat the keeper once, and then come back here beaten, and the room behind the bar opens. There is a man in it who sells the only thing that survives a loss.',
    ],
    lesson: justOpened
      ? 'The Sorcerer will see you now. Spend the gold: what he teaches is permanent, and the Sorting Chest is where you lay it across your mana before your next walk.'
      : lesson > 0
        ? 'New ground is worth a point of mana, once each. Getting further is the only thing a defeat pays for — so a run that ends deeper than the last was not wasted.'
        : 'Enchantments you buy are permanent. Progress on the road is not. That is the whole trade.',
    cta: 'Back to the inn →',
  };
}

/** Beating Wittex ends the road as it currently exists, so it is the one moment the game can
 *  say "you finished it" — and then immediately admit that finishing it did not fix anything.
 *
 *  Shown after his card rather than folded into it, deliberately. The two beats are doing
 *  opposite jobs: one is the story refusing to resolve, the other is the game congratulating
 *  the player. Run together in a single card they cancel out, and the reader gets neither. */
export const FREED: StoryCard = {
  title: 'The Longest Road, Walked',
  lines: [
    'Eight seats, from a drunk who could not see the board to a man who was never really sitting at it. Nobody in the valley knows your name and the banner is still folded behind the well, and you did it anyway.',
    'There is a mark against your name in the keeper\u2019s book now. He will not say what it is for. He wrote it down without looking up, which from him is a standing ovation.',
    '"You will want somebody to play," he says. "Not a seat. Not a story. Somebody."',
    '"There are others on this road. Same book, same four points, no ladder and no gold and nothing to hide behind. That is the honest version of this game, and you are ready for it, which is more than most of them are."',
    'He nods at the far table, where two chairs have been set opposite each other for as long as you have been coming here, and where nobody has ever explained who they are for.',
  ],
  lesson:
    'The road is finished. Duel another captain at this table — every enchantment, ten points each, no gold and no ladder — and see what the game is when the opponent is not written down in advance.',
  cta: 'Take the far table \u2192',
};

/** Rolain's card after she falls, which is not the same card twice.
 *
 *  The first time, she hands over the Divine Call — it is the moment the player's King learns to
 *  speak, and the whole beat is the gift. Every time after that she has nothing left to give and
 *  the card said otherwise: it re-granted a power already held, re-explained the four words, and
 *  re-delivered two warnings about men the player has since beaten. A card that tells you
 *  something you demonstrably know is the game not watching.
 *
 *  So the grant happens once. After that she is simply a woman who keeps losing to you and keeps
 *  turning up, which is a better character note than the lecture was. */
/* What a seat says when it falls *again*.
 *
 * Kyrax and Rolain already told their stories in instalments, and the rest of the road said
 * the same thing on the twelfth beating as the first — which reads less like a character and
 * more like a recording. One or two short returns per seat, cycling and then holding on the
 * last: by then the relationship is the text, and inventing a new sentence for the fortieth
 * win would be the game performing novelty it does not have.
 *
 * No lesson lines on any of these. The teaching happened the first time. */
const AGAIN: Partial<Record<House, { title: string; tellings: string[][] }>> = {
  drunkard: {
    title: 'The Same Chair, Falling The Same Way',
    tellings: [
      [
        'He loses faster this time and takes it better, which is not the direction those two usually travel together.',
        '"You again. Good. Losing to a stranger is embarrassing, but losing to a regular is practically company."',
      ],
      [
        'He has your drink poured before the board is even cleared, and he does not bother counting his pieces back into the box.',
        '"One day I will be sober and you will be careless. I can wait. It is the one thing I am still good at."',
      ],
    ],
  },
  innkeeper: {
    title: 'The Bar, Wiped Again',
    tellings: [
      [
        'He resets the pieces before you have finished taking his King, which is as close as he comes to conversation.',
        '"Better," he says, and it is a while before you realise he was not talking about the game. He was talking about you.',
      ],
      [
        'This time he does not watch the board while you finish. He watches you, the way a man checks a knife he already knows is sharp.',
        '"The road is longer past my door. You know that by now. Go and be somebody else\u2019s problem."',
      ],
    ],
  },
  wit: {
    title: 'Talked Down, Again',
    tellings: [
      [
        'He tips his King with two fingers and starts talking before it lands, because silence is the one position he has never learned to hold.',
        '"Yes, yes. You have beaten a talkative old man on a walking trail. Put it on your banner. The ones ahead of you hit back harder and converse worse."',
      ],
      [
        'He is quieter this time, and the quiet is more unsettling than the talk ever was.',
        '"You play like the road now, not like a traveller on it," he says. "I would think about what that costs, if I were the sort of man who thought about costs."',
      ],
    ],
  },
  armored: {
    title: 'The Shields Come Off Faster Now',
    tellings: [
      [
        'The knight unstraps a gauntlet, which turns out to be how he applauds.',
        '"You strike the shield without flinching now. First time you paid the turn like it was a toll. Now you spend it like a man who has counted his change."',
      ],
      [
        'He waves off his own squire and resets the board himself, armour and all.',
        '"There is nothing left behind these shields you have not already broken. Go break something that is still proud of itself."',
      ],
    ],
  },
  ardax: {
    title: 'What Falls Stays Down, Again',
    tellings: [
      [
        'He looks at his graveyard a long moment, as if expecting it to disagree with the result the way it usually does.',
        '"You beat the board and the second board I keep under it. Twice the game, and you did not blink. My father will not find that funny at all."',
      ],
      [
        'He does not call anything back this time, even when he could, and you both notice him not doing it.',
        '"Raising the dead only frightens people who have not beaten them already," he says. "Go on. He is waiting, and he does not wait kindly."',
      ],
    ],
  },
  wittex: {
    title: 'The Curse, Beaten Back Again',
    tellings: [
      [
        'He goes down the way a candle goes out: no drama, just an absence where the pressure was.',
        'The air in the valley is easier for a while. You have stopped expecting it to stay that way, and so has the valley.',
      ],
      [
        'It is almost routine now, which is the most frightening thing about it. A curse you can schedule is still a curse.',
        'Somewhere behind the quiet, something takes another note about you. The story is not done using your name.',
      ],
    ],
  },
};

/** The card for a seat's fall: the full story beat on first blood, and the seat's own shorter
 *  returns after that. Kyrax and Rolain keep their instalment tellers, which predate this and
 *  do the same job with more to say. */
export function seatFallCard(seat: House, timesBeatenBefore: number): StoryCard {
  if (seat === 'kyrax') return kyraxCard(timesBeatenBefore);
  if (seat === 'rolain') return rolainCard(timesBeatenBefore);
  const base = STORY[seat].after;
  const again = AGAIN[seat];
  if (timesBeatenBefore === 0 || !again) return base;
  const tell = again.tellings[Math.min(timesBeatenBefore - 1, again.tellings.length - 1)];
  return { title: again.title, lines: tell, cta: base.cta };
}

export function rolainCard(timesBeatenBefore: number): StoryCard {
  const base = STORY.rolain.after;
  if (timesBeatenBefore === 0) return base;

  const again: string[][] = [
    [
      '"Again," she says, and swings down off the horse this time, which she did not do before.',
      '"You will notice I have stopped explaining things to you. That is not rudeness. There is nothing left that I know and you do not."',
      'She looks at the board a while longer than she needs to.',
      '"He is still my father. I would like you to remember that when you get there, and I know perfectly well that you cannot afford to."',
    ],
    [
      'She does not get off the horse this time, and she does not commiserate.',
      '"You are getting better and I am not. I have thought about why, and I do not care for the answer."',
      '"Go on. The road does not get shorter for being walked twice."',
    ],
    [
      'This time she is waiting for you before the board is even set, and she says the thing she has not said.',
      '"Beat him and something in this valley wakes up. Beat him and lose to whatever is behind him, and it goes back to sleep for another eleven years, and I do not think it survives that."',
      '"So do not just beat him. Keep going."',
    ],
  ];
  const tell = again[Math.min(timesBeatenBefore - 1, again.length - 1)];
  return {
    title: 'She Is Already Turning The Horse',
    lines: tell,
    // No lesson: the teaching happened the first time, and repeating it is the fault this fixes.
    cta: base.cta,
  };
}

/** The second sitting, and every one after it. He is unchanged. You are not. */
export const KYRAX_RETURN: StoryCard = {
  title: 'He Has Not Moved',
  lines: [
    'The hall is cold and very quiet, and the board is set exactly as you left it, which you decide is a kind of insult.',
    'The Dragonlord looks up. He looks at the dragon on your side of the table for slightly longer than he means to.',
    '"My daughter," he says, "was always generous with what was mine."',
    'Two dragons against one. The old law between you, and nothing else.',
  ],
  lesson:
    'His dragons are shielded, and so is yours. A shield only holds at home: bring his out of his half, or spend the turns to break it.',
};
