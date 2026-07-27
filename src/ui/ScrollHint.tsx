import { useEffect, useState } from 'react';

/* "There is more of this below," said once, quietly, and only when it is true.
 *
 * Measured at phone size, every screen in the campaign runs off the bottom: the inn is 1319px
 * tall in an 852px window, the road 2414px, a story card 1102px, the builder's enchantment list
 * 1819px. Scrolling is the right answer for all of them — they are lists and they are prose —
 * but nothing on screen said the page moved.
 *
 * On most of those it costs a player a moment. On a story card it costs them the game: the card
 * carries exactly one button, "Onward →", it is the only way out of the screen, and it sat 250px
 * below the fold behind text that breaks off mid-sentence. A reader who does not think to swipe
 * is simply stuck, and nothing about a page of finished-looking prose suggests it is unfinished.
 *
 * So: a chevron at the foot of the window whenever the page can scroll and the bottom is not yet
 * in reach, bobbing slowly enough to read as an invitation rather than an alarm. It is also a
 * button — tapping it moves a screenful, which is what the reader wanted — and it takes itself
 * off the moment it would be a lie.
 */
export function ScrollHint(): JSX.Element | null {
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* "Near enough the bottom" rather than "at it": a hint that survives until the last pixel
     * would still be pointing at nothing for the whole final screenful. */
    const SLACK = 96;
    const look = () => {
      const doc = document.documentElement;
      const room = doc.scrollHeight - doc.clientHeight;
      setShow(room > SLACK && window.scrollY < room - SLACK);
    };
    look();
    window.addEventListener('scroll', look, { passive: true });
    window.addEventListener('resize', look);
    /* The page grows and shrinks under its own feet — a card is swapped for a board, a list is
     * filtered, an outcome panel appears — and none of that fires scroll or resize. Watching the
     * document itself is what keeps the hint honest across a phase change. */
    const observer = new ResizeObserver(look);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('scroll', look);
      window.removeEventListener('resize', look);
      observer.disconnect();
    };
  }, []);

  if (!show) return null;
  return (
    /* A scrim under the chevron, not just a chevron.
     *
     * On its own the disc floats in the middle of whatever it is over, and on a story card that
     * is a paragraph: judged magnified, it sat on the words "She brings" and read as a smudge
     * rather than a control. The page fading out beneath it says "this continues" by itself, and
     * gives the chevron somewhere to stand. The scrim ignores the pointer so it never eats a tap
     * meant for the page; only the chevron is a button. */
    <div className="scroll-hint" aria-hidden="false">
      <button
        type="button"
        className="scroll-hint-btn"
        aria-label="Scroll down for more"
        onClick={() => {
          const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
          window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: still ? 'auto' : 'smooth' });
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 9l7 7 7-7" />
        </svg>
      </button>
    </div>
  );
}
