/* Where the review head sits, and what to call the position under it.
 *
 * Rewind is view-only: it never touches the game, only which stored position is drawn. That
 * makes it pure arithmetic over `history`, which is exactly the sort of thing that develops a
 * silent off-by-one, so it lives here with tests rather than inline in a component.
 *
 * The convention throughout: `history[0]` is the opening position and `history[n]` is the
 * position after ply n, so the index doubles as a ply count. `null` means "the live board" —
 * a distinct state from "the index of the last position", because the live board keeps moving
 * and a pinned index does not.
 */

/** Step the head by `delta` plies. Walking forward off the end returns to the live board
 *  rather than pinning the newest position, so a game that continues does not leave the
 *  viewer stranded one move behind it. */
export function stepHead(at: number | null, delta: number, length: number): number | null {
  const lastIndex = length - 1;
  if (lastIndex < 1) return null;
  const here = at ?? lastIndex;
  const next = here + delta;
  if (next >= lastIndex) return null;
  return Math.max(0, next);
}

/** Jump to the position produced by `ply`. The final ply is the live board. */
export function jumpHead(ply: number, length: number): number | null {
  const lastIndex = length - 1;
  if (lastIndex < 1) return null;
  return ply >= lastIndex ? null : Math.max(0, ply);
}

/** The index actually drawn, clamped in case the history shrank under a pinned head — undo
 *  is still a playtest tool and can pull positions out from beneath the viewer. */
export function headIndex(at: number | null, length: number): number {
  const lastIndex = Math.max(0, length - 1);
  return at === null ? lastIndex : Math.min(Math.max(0, at), lastIndex);
}

/** What the review strip says. Ply 1 is White's first move, so odd plies are White's. */
export function describeHead(index: number): string {
  if (index <= 0) return 'the opening position';
  return `move ${Math.ceil(index / 2)}, ${index % 2 ? 'White' : 'Black'}`;
}
