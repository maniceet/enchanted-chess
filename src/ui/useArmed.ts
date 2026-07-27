import { useEffect, useState } from 'react';

/* A button that asks twice, for the few that cannot ask again afterwards.
 *
 * Armed rather than modal, deliberately. The second press lands in the same place as the first,
 * so nothing jumps under a thumb that is already moving, and a player who meant it gets there in
 * two taps without a dialog to read. It disarms itself so an armed button is never left lying in
 * wait for a stray tap several minutes later.
 *
 * The bar for using this is high: it is for actions that destroy something the player cannot get
 * back. Resigning ends a game and, on the road, the whole walk. "Begin a new adventure" forgets
 * the gold and the spellbook, which the Sorcerer's own screen calls the only thing that carries
 * between runs. Ordinary destructive-sounding buttons — going back to the inn, asking to hear the
 * lessons again — cost nothing and must not be made to feel like they do.
 */
export function useArmed(ms = 4000): { armed: boolean; arm: () => void; disarm: () => void } {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ms);
    return () => clearTimeout(timer);
  }, [armed, ms]);
  return { armed, arm: () => setArmed(true), disarm: () => setArmed(false) };
}
