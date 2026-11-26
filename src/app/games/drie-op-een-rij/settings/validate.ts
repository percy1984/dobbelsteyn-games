/**
 * Instellingen laden, valideren en migreren. Een ontbrekend of ongeldig veld krijgt zijn
 * standaardwaarde, onbekende spelelementen worden genegeerd en nieuwe spelelementen krijgen hun
 * standaardwaarde. Er wordt nooit een fout gegooid.
 */
import { BOARD } from '../engine/config';
import { MECHANICS, normalizeMechanics } from '../engine/mechanics/registry';
import type { MechanicId } from '../engine/types';
import { SELECTABLE_THEMES, type ThemeId } from '../themes/themes';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  SETTINGS_SCHEMA_VERSION,
  type BoardChoice,
  type GameSettings,
  type PresetId,
} from './settings';

export const MODES = ['beurten', 'tijd', 'ontspannen'] as const;
export const DIFFICULTIES = ['makkelijk', 'normaal', 'uitdagend'] as const;
export const INPUTS = ['locked', 'unlocked'] as const;
export const SPEEDS_LIST = ['rustig', 'normaal', 'snel'] as const;
export const BOARD_CHOICES: readonly BoardChoice[] = ['willekeurig', 'vandaag', 'nummer'];
export const PRESET_IDS = ['standaard', 'klassiek', 'uitdagend', 'allesAan', 'eigen'] as const;
export const HINT_CHOICES = [0, 5, 10, 20, 30] as const;
export const MAX_HINT_SECONDS = 60;
export const MAX_BOARD_NUMBER_LENGTH = 40;

type Raw = Record<string, unknown>;

/**
 * Migraties per schemaVersion: `MIGRATIONS[n]` zet data van versie n om naar versie n + 1.
 * Versie 0 is data zonder schemaVersion.
 */
const MIGRATIONS: Readonly<Record<number, (raw: Raw) => Raw>> = {
  0: (raw) => ({ ...raw, schemaVersion: 1 }),
};

export function migrate(raw: Raw): Raw {
  let data = raw;
  let version = typeof data['schemaVersion'] === 'number' ? data['schemaVersion'] : 0;
  while (version < SETTINGS_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      break;
    }
    data = step(data);
    version++;
  }
  return data;
}

function oneOf<T extends string>(value: unknown, list: readonly T[], fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Maakt een set spelelementen geldig: goud altijd aan, afhankelijkheden afgedwongen. */
export function fixMechanics(
  mechanics: Partial<Record<string, unknown>>,
  fallback: Readonly<Record<MechanicId, boolean>> = DEFAULT_SETTINGS.mechanics,
): Record<MechanicId, boolean> {
  const on = MECHANICS.filter((info) => {
    const value = mechanics[info.id];
    return typeof value === 'boolean' ? value : fallback[info.id];
  }).map((info) => info.id);
  const fixed = new Set(normalizeMechanics(on));
  return Object.fromEntries(MECHANICS.map((info) => [info.id, fixed.has(info.id)])) as Record<
    MechanicId,
    boolean
  >;
}

/** Welke preset past bij deze set spelelementen ('eigen' als geen enkele precies past). */
export function presetOf(mechanics: Readonly<Record<MechanicId, boolean>>): PresetId {
  for (const id of ['standaard', 'klassiek', 'uitdagend', 'allesAan'] as const) {
    if (MECHANICS.every((info) => PRESETS[id][info.id] === mechanics[info.id])) {
      return id;
    }
  }
  return 'eigen';
}

/** Leest opgeslagen of gedeelde instellingen. Alles wat niet klopt wordt de standaardwaarde. */
export function validateSettings(input: unknown): GameSettings {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return DEFAULT_SETTINGS;
  }
  const raw = migrate(input as Raw);
  const d = DEFAULT_SETTINGS;
  const rawMechanics = raw['mechanics'];
  const mechanics = fixMechanics(
    typeof rawMechanics === 'object' && rawMechanics !== null ? (rawMechanics as Raw) : {},
  );
  const boardNumber =
    typeof raw['boardNumber'] === 'string'
      ? raw['boardNumber'].slice(0, MAX_BOARD_NUMBER_LENGTH)
      : d.boardNumber;
  const themeIds = SELECTABLE_THEMES.map((theme) => theme.id as ThemeId);
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    mode: oneOf(raw['mode'], MODES, d.mode),
    difficulty: oneOf(raw['difficulty'], DIFFICULTIES, d.difficulty),
    size: intIn(raw['size'], BOARD.minSize, BOARD.maxSize, d.size),
    kinds: intIn(raw['kinds'], BOARD.minKinds, BOARD.maxKinds, d.kinds),
    theme: oneOf(raw['theme'], themeIds, d.theme),
    input: oneOf(raw['input'], INPUTS, d.input),
    speed: oneOf(raw['speed'], SPEEDS_LIST, d.speed),
    pauseTimeDuringResolution: bool(raw['pauseTimeDuringResolution'], d.pauseTimeDuringResolution),
    hintSeconds: intIn(raw['hintSeconds'], 0, MAX_HINT_SECONDS, d.hintSeconds),
    sound: bool(raw['sound'], d.sound),
    volume: intIn(raw['volume'], 0, 100, d.volume),
    board: oneOf(raw['board'], BOARD_CHOICES, d.board),
    boardNumber,
    preset: presetOf(mechanics),
    mechanics,
  };
}

/** Kiest een preset: de spelelementen worden die van de preset. */
export function withPreset(settings: GameSettings, preset: PresetId): GameSettings {
  if (preset === 'eigen') {
    return { ...settings, preset };
  }
  return { ...settings, preset, mechanics: PRESETS[preset] };
}

/**
 * Zet één spelelement aan of uit. De preset volgt vanzelf (meestal wordt het 'eigen'). Een element
 * waarvan een vereist element uit staat, blijft uit (de schakelaar is dan grijs).
 */
export function withMechanic(settings: GameSettings, id: MechanicId, on: boolean): GameSettings {
  const mechanics = fixMechanics({ ...settings.mechanics, [id]: on });
  return { ...settings, mechanics, preset: presetOf(mechanics) };
}
