import type { ClockState, Color, TimeControl, TimeControlId } from './types';

/** The three controls played at this table, plus untimed for scenario work. */
export const TIME_CONTROLS: Record<Exclude<TimeControlId, 'untimed'>, TimeControl> = {
  '3+2': { id: '3+2', label: '3 | 2', initialMs: 180_000, incrementMs: 2_000 },
  '5+5': { id: '5+5', label: '5 | 5', initialMs: 300_000, incrementMs: 5_000 },
  '10+0': { id: '10+0', label: '10 | 0', initialMs: 600_000, incrementMs: 0 },
};

/** Time Manipulation's payout depends on the control: where there is an increment it buys a
 *  permanent extra second on every future move; where there is none it buys a flat 30 seconds. */
export const TIME_POWER_INCREMENT_MS = 1_000;
export const TIME_POWER_LUMP_MS = 30_000;

export function newClock(control: TimeControl): ClockState {
  const side = { ms: control.initialMs, bonusIncrementMs: 0 };
  return { control, w: { ...side }, b: { ...side } };
}

/** What a Time Manipulation activation is worth right now, for UI copy and the engine. */
export function timePowerEffect(clock: ClockState | null): string {
  if (!clock) return 'no clock in this game';
  return clock.control.incrementMs > 0
    ? `+${TIME_POWER_INCREMENT_MS / 1000}s increment on every remaining move`
    : `+${TIME_POWER_LUMP_MS / 1000}s on your clock`;
}

export function incrementFor(clock: ClockState, color: Color): number {
  return clock.control.incrementMs + clock[color].bonusIncrementMs;
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const total = Math.ceil(safe / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (safe < 20_000) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${Math.floor((safe % 1000) / 100)}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
