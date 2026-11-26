import { dailySeed, seedFromNumber } from '../rng/rng';

/** Willekeurig bordnummer (alleen in de UI; de engine gebruikt nooit toeval van buiten). */
export function randomSeed(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return seedFromNumber(values[0]);
}

/** Bord van de dag: de lokale datum als JJJJ-MM-DD. */
export function todaySeed(now = new Date()): string {
  return dailySeed(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
