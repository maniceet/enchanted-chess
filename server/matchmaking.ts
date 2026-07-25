import type { Mode, Seek } from '../src/shared/protocol';
import type { TimeControlId } from '../src/engine/types';

/** Matchmaking, kept pure so it can be tested without a socket in sight.
 *  One queue per (mode, control) pair, first in first out, and nobody ever meets themselves. */

export interface Waiting {
  id: string;
  seek: Seek;
  since: number;
}

export interface Pairing {
  white: string;
  black: string;
  seek: Seek;
}

const key = (mode: Mode, control: TimeControlId): string => `${mode}:${control}`;

export class Matchmaker {
  private queues = new Map<string, Waiting[]>();

  /** Adds a seeker, or returns the pairing if someone was already waiting for that game.
   *  Colours are decided here so the caller never has to. */
  seek(id: string, seek: Seek, now: number, coin: () => number = Math.random): Pairing | null {
    this.unseek(id);
    const k = key(seek.mode, seek.control);
    const queue = this.queues.get(k) ?? [];

    const partner = queue.shift();
    if (partner) {
      this.queues.set(k, queue);
      // A coin decides who takes White, so nobody farms the first move.
      return coin() < 0.5
        ? { white: partner.id, black: id, seek }
        : { white: id, black: partner.id, seek };
    }

    queue.push({ id, seek, since: now });
    this.queues.set(k, queue);
    return null;
  }

  unseek(id: string): void {
    for (const [k, queue] of this.queues) {
      const left = queue.filter((w) => w.id !== id);
      if (left.length) this.queues.set(k, left);
      else this.queues.delete(k);
    }
  }

  /** How many are waiting for this exact game. */
  waiting(seek: Seek): number {
    return this.queues.get(key(seek.mode, seek.control))?.length ?? 0;
  }

  /** Everyone currently in a queue, for the health endpoint. */
  size(): number {
    let total = 0;
    for (const [, queue] of this.queues) total += queue.length;
    return total;
  }

  /** Drops seekers who have been waiting longer than `maxAgeMs`, and says who they were. */
  sweep(now: number, maxAgeMs: number): string[] {
    const dropped: string[] = [];
    for (const [k, queue] of this.queues) {
      const kept = queue.filter((w) => {
        if (now - w.since <= maxAgeMs) return true;
        dropped.push(w.id);
        return false;
      });
      if (kept.length) this.queues.set(k, kept);
      else this.queues.delete(k);
    }
    return dropped;
  }
}
