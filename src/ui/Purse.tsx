import { useEffect, useRef, useState } from 'react';

/* The gold counter, and the fact that it just changed.
 *
 * There are three of these — over the Sorcerer's head, on the inn's run strip, and on the road —
 * and all three were the same static markup, so coin arrived and left in silence. Buying a spell
 * moved the number from 60 to 52 between frames; taking A Purse from a fallen seat moved it from
 * 46 to 56 on a screen the player was already being carried away from. The number people are
 * deciding against is the one thing on these screens worth a beat.
 *
 * The beat is tied to the change rather than to a render: the key remounts the pill only when
 * the number actually differs, so it strikes when coin moves and stays still when the screen
 * merely redraws. It deliberately does not fire on arrival — a purse that flashes every time you
 * walk into a room is telling you nothing, and these are rooms the player comes back to. It
 * reacts to gold arriving as much as to gold leaving, which is right: a seat's purse landing is
 * worth as much of a look as a spell being paid for.
 */
/* The last figure any purse displayed, kept outside the component on purpose.
 *
 * Coin usually changes on a screen the player is being carried away from: a seat's purse lands
 * and the story card takes over, a spoil is taken and the road arrives already holding the new
 * total. A pill that only remembers its own mounts cannot announce any of that — the road's pill
 * is built fresh knowing 71 and nothing about the 46 it replaced, which is exactly what the
 * first version of this did and exactly why it stayed silent for the case it was written for.
 *
 * One number, module-scoped, so the pill compares against what the player last actually saw
 * rather than against its own lifetime. Undefined until the first pill renders, so the very
 * first sight of a purse is quiet. */
let lastSeen: number | undefined;

export function Purse({ gold, dark = false }: { gold: number; dark?: boolean }) {
  const previous = useRef(lastSeen);
  const [strikes, setStrikes] = useState(0);
  useEffect(() => {
    lastSeen = gold;
    if (previous.current === undefined || previous.current === gold) return;
    previous.current = gold;
    setStrikes((n) => n + 1);
  }, [gold]);
  return (
    <span
      className={`coin-pill ${dark ? 'coin-pill-dark' : ''} ${strikes > 0 ? 'is-struck' : ''}`}
      key={strikes}
    >
      <span className="coin-mark">◈</span>
      {gold}
    </span>
  );
}
