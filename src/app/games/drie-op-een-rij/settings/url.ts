/**
 * Instellingen in de URL: alles wat nodig is om een bord na te maken.
 * `?seed=...&level=...&mode=...&diff=...&size=...&kinds=...&input=...&mech=...`
 * waarbij `mech` het bitmasker van de actieve spelelementen is (base36).
 *
 * Wat in de URL staat geldt alleen voor dat ene spel; het overschrijft de opgeslagen instellingen
 * niet, tenzij de speler in het pauzemenu "Deze instellingen bewaren" kiest.
 */
import { MECHANICS, maskToMechanics, mechanicsToMask } from '../engine/mechanics/registry';
import type { GameSettings } from './settings';
import { DIFFICULTIES, INPUTS, MODES, fixMechanics, presetOf, validateSettings } from './validate';

export type GameQuery = Readonly<
  Record<'seed' | 'level' | 'mode' | 'diff' | 'size' | 'kinds' | 'input' | 'mech', string>
>;

export type QueryInput = Partial<Record<keyof GameQuery, string | undefined>>;

export function settingsToQuery(settings: GameSettings, seed: string, level: number): GameQuery {
  const on = MECHANICS.filter((info) => settings.mechanics[info.id]).map((info) => info.id);
  return {
    seed,
    level: String(level),
    mode: settings.mode,
    diff: settings.difficulty,
    size: String(settings.size),
    kinds: String(settings.kinds),
    input: settings.input,
    mech: mechanicsToMask(on),
  };
}

const asInt = (value: string | undefined): number | undefined =>
  value !== undefined && /^\d{1,3}$/.test(value) ? Number(value) : undefined;

const pick = <T extends string>(value: string | undefined, list: readonly T[]): T | undefined =>
  value !== undefined && (list as readonly string[]).includes(value) ? (value as T) : undefined;

/**
 * Instellingen voor één spel: de opgeslagen instellingen, aangevuld met wat geldig in de URL staat.
 * Ongeldige waarden in de URL worden genegeerd.
 */
export function settingsFromQuery(query: QueryInput, base: GameSettings): GameSettings {
  const list = query.mech !== undefined ? maskToMechanics(query.mech) : null;
  const mechanics = list
    ? fixMechanics(Object.fromEntries(MECHANICS.map((info) => [info.id, list.includes(info.id)])))
    : base.mechanics;
  return validateSettings({
    ...base,
    mode: pick(query.mode, MODES) ?? base.mode,
    difficulty: pick(query.diff, DIFFICULTIES) ?? base.difficulty,
    size: asInt(query.size) ?? base.size,
    kinds: asInt(query.kinds) ?? base.kinds,
    input: pick(query.input, INPUTS) ?? base.input,
    mechanics,
    preset: presetOf(mechanics),
  });
}

/** Velden die het bord of het spelverloop bepalen (en dus in de URL staan). */
export function sameGameSettings(a: GameSettings, b: GameSettings): boolean {
  return (
    a.mode === b.mode &&
    a.difficulty === b.difficulty &&
    a.size === b.size &&
    a.kinds === b.kinds &&
    a.input === b.input &&
    MECHANICS.every((info) => a.mechanics[info.id] === b.mechanics[info.id])
  );
}
