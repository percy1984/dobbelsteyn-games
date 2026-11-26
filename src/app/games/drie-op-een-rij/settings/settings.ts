/**
 * Instellingen van Drie op een rij. DEFAULT_SETTINGS is de enige bron voor standaardwaarden en de
 * presets zijn ook constanten. (Opslaan, valideren en migreren volgen in fase 4.)
 */
import { BOARD, TIMING } from '../engine/config';
import { MECHANICS } from '../engine/mechanics/registry';
import type { AnimationSpeed, Difficulty, GameMode, InputMode, MechanicId } from '../engine/types';
import { DEFAULT_THEME, type ThemeId } from '../themes/themes';

export type PresetId = 'standaard' | 'klassiek' | 'uitdagend' | 'allesAan' | 'eigen';
export type BoardChoice = 'willekeurig' | 'vandaag' | 'nummer';

export interface GameSettings {
  readonly schemaVersion: 1;
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  /** Bord is vierkant: size x size. */
  readonly size: number;
  readonly kinds: number;
  readonly theme: ThemeId;
  /** Zetten terwijl stenen nog vallen. */
  readonly input: InputMode;
  readonly speed: AnimationSpeed;
  readonly pauseTimeDuringResolution: boolean;
  /** Hint na zoveel seconden zonder actie; 0 = uit. */
  readonly hintSeconds: number;
  readonly sound: boolean;
  /** 0..100 */
  readonly volume: number;
  readonly board: BoardChoice;
  readonly boardNumber: string;
  readonly preset: PresetId;
  readonly mechanics: Readonly<Record<MechanicId, boolean>>;
}

function mechanicsFrom(on: readonly MechanicId[]): Record<MechanicId, boolean> {
  return Object.fromEntries(MECHANICS.map((info) => [info.id, info.alwaysOn || on.includes(info.id)])) as Record<
    MechanicId,
    boolean
  >;
}

const STANDAARD: readonly MechanicId[] = MECHANICS.filter((info) => info.defaultOn).map((info) => info.id);

export const PRESETS: Readonly<Record<Exclude<PresetId, 'eigen'>, Readonly<Record<MechanicId, boolean>>>> = {
  standaard: mechanicsFrom(STANDAARD),
  klassiek: mechanicsFrom(['goud', 'zilver', 'amulet', 'ketting']),
  uitdagend: mechanicsFrom([
    ...STANDAARD,
    'kleurblok',
    'hars',
    'schild',
    'muur',
    'olie',
    'portaal',
    'lopendeBand',
    'stekelbol',
    'pers',
    'waterklok',
    'grootBlok',
    'reiziger',
  ]),
  allesAan: mechanicsFrom(MECHANICS.map((info) => info.id)),
};

export const DEFAULT_SETTINGS: GameSettings = {
  schemaVersion: 1,
  mode: 'beurten',
  difficulty: 'normaal',
  size: BOARD.defaultSize,
  kinds: BOARD.defaultKinds,
  theme: DEFAULT_THEME,
  input: 'locked',
  speed: 'rustig',
  pauseTimeDuringResolution: false,
  hintSeconds: TIMING.hintSeconds,
  sound: true,
  volume: 30,
  board: 'willekeurig',
  boardNumber: '',
  preset: 'standaard',
  mechanics: PRESETS.standaard,
};

/** De actieve spelelementen uit de instellingen. */
export function activeMechanics(settings: GameSettings): MechanicId[] {
  return MECHANICS.filter((info) => settings.mechanics[info.id]).map((info) => info.id);
}
