import type { Enchantment, PowerName } from '../engine/types';
import type { Loadout } from '../engine/loadout';

/** Balance instrumentation (spec §7): every finished game is tallied from day one so pick
 *  rate and win rate per enchantment and per power are visible at the bar. */

const KEY = 'enchanted-chess:tallies';

export interface GameRecord {
  at: number;
  mode: 'classic' | '960';
  outcome: 'w' | 'b' | 'draw';
  reason: string;
  sides: Record<
    'w' | 'b',
    {
      enchantments: Enchantment[];
      /** The first word, kept so records written before Kings carried three still read. */
      power: PowerName;
      /** Every word this King carried. Absent on older records. */
      powers?: PowerName[];
      reserve: number;
    }
  >;
}

export function loadRecords(): GameRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as GameRecord[];
  } catch {
    return [];
  }
}

export function recordGame(record: GameRecord): void {
  const all = [...loadRecords(), record].slice(-500);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearRecords(): void {
  localStorage.removeItem(KEY);
}

export const sideOf = (loadout: Loadout, reserve: number) => ({
  enchantments: Object.values(loadout.enchantments),
  // `power` alone tallied the first of three, so the bar's pick rates described a game nobody
  // was playing: two of every King's words went uncounted.
  power: loadout.power,
  powers: loadout.powers ? [...loadout.powers] : [loadout.power],
  reserve,
});

export interface Tally {
  key: string;
  picks: number;
  wins: number;
  draws: number;
  losses: number;
}

function tally(
  records: GameRecord[],
  keysFor: (side: GameRecord['sides']['w']) => string[],
): Tally[] {
  const map = new Map<string, Tally>();
  for (const record of records) {
    for (const color of ['w', 'b'] as const) {
      const side = record.sides[color];
      for (const key of new Set(keysFor(side))) {
        const row = map.get(key) ?? { key, picks: 0, wins: 0, draws: 0, losses: 0 };
        row.picks++;
        if (record.outcome === 'draw') row.draws++;
        else if (record.outcome === color) row.wins++;
        else row.losses++;
        map.set(key, row);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.picks - a.picks);
}

export const enchantmentTallies = (records: GameRecord[]): Tally[] =>
  tally(records, (side) => side.enchantments);

export const powerTallies = (records: GameRecord[]): Tally[] =>
  // Every word a King carried counts as a pick. Older records only know their first.
  tally(records, (side) => side.powers ?? [side.power]);

/** Flagged specifically in the spec: the whole budget sunk into a single Taunt (the Taunt
 *  queen build costs exactly 4). Counted as sides, not games. */
export function tauntQueenSides(records: GameRecord[]): Tally {
  const row: Tally = { key: 'taunt-only build', picks: 0, wins: 0, draws: 0, losses: 0 };
  for (const record of records) {
    for (const color of ['w', 'b'] as const) {
      const side = record.sides[color];
      if (side.enchantments.length !== 1 || side.enchantments[0] !== 'taunt') continue;
      row.picks++;
      if (record.outcome === 'draw') row.draws++;
      else if (record.outcome === color) row.wins++;
      else row.losses++;
    }
  }
  return row;
}

export function colorSplit(records: GameRecord[]): { white: number; black: number; draws: number } {
  return {
    white: records.filter((r) => r.outcome === 'w').length,
    black: records.filter((r) => r.outcome === 'b').length,
    draws: records.filter((r) => r.outcome === 'draw').length,
  };
}

export const winRate = (row: Tally): string =>
  row.picks ? `${Math.round((row.wins / row.picks) * 100)}%` : '—';
