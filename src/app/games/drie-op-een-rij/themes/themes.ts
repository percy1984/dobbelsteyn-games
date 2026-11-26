/**
 * Thema's van Drie op een rij: alleen data, geen logica. Het thema bepaalt hoe abstracte
 * steentypes 0..n-1 en spelelementen eruitzien, en heeft geen invloed op het bord.
 * Ontbreekt een afbeelding in een thema, dan valt het spel terug op het basisthema.
 */
import type { MechanicId, Special } from '../engine/types';
import type { GameTextKey } from '../i18n/nl';

export type ThemeId = 'facet' | 'goudrand' | 'halloween' | 'xmas' | 'easter' | 'dice';

export interface ThemeCredit {
  readonly asset: string;
  readonly author: string;
  readonly license: string;
  readonly url: string;
}

export interface ThemeManifest {
  readonly id: ThemeId | 'base';
  readonly nameKey: GameTextKey;
  /** Lokale SVG-paden, index = steentype. Lengte = maximaal aantal soorten in dit thema. */
  readonly tiles: readonly string[];
  /** Voor de schermlezer, bijvoorbeeld "rode cirkel". */
  readonly tileLabels: readonly GameTextKey[];
  /** Speciale stenen (ontbreekt: basisthema). Bom en kruis liggen als laag over de steen. */
  readonly specials?: Readonly<Record<Special, string>>;
  readonly hammer?: string;
  /** Afbeeldingen van spelelementen; meerdere voor varianten (bijv. ketting 1 en 2, altaar uit en aan). */
  readonly mechanics?: Partial<Record<MechanicId, string | readonly string[]>>;
  /** Bordkleur, goud, zilver, accent, tekst (CSS-variabelen op het bord). */
  readonly cssVars: Readonly<Record<string, string>>;
  readonly credits: readonly ThemeCredit[];
  /** Nog niet af: niet te kiezen in de lobby. */
  readonly todo?: boolean;
}

const DIR = 'games/drie-op-een-rij/themes';
const OWN_WORK: ThemeCredit = {
  asset: "Stenen en objecten (SVG)",
  author: 'Dobbelsteyn Games',
  license: 'Eigen werk',
  url: '',
};

const LABELS: readonly GameTextKey[] = [
  'steen.0',
  'steen.1',
  'steen.2',
  'steen.3',
  'steen.4',
  'steen.5',
  'steen.6',
];

const range = (n: number, path: (k: number) => string) => Array.from({ length: n }, (_, k) => path(k));

/** Neutraal basisthema met een afbeelding voor elk gebouwd spelelement. */
export const BASE_THEME: ThemeManifest = {
  id: 'base',
  nameKey: 'thema.base',
  tiles: range(7, (k) => `${DIR}/base/steen-${k}.svg`),
  tileLabels: LABELS,
  specials: {
    bom: `${DIR}/base/bom.svg`,
    kruis: `${DIR}/base/kruis.svg`,
    ster: `${DIR}/base/ster.svg`,
  },
  hammer: `${DIR}/base/hamer.svg`,
  mechanics: {
    rotsblok: `${DIR}/base/rotsblok.svg`,
    muntblok: `${DIR}/base/muntblok.svg`,
    ketting: [`${DIR}/base/ketting.svg`, `${DIR}/base/ketting2.svg`],
    veer: `${DIR}/base/veer.svg`,
    amulet: `${DIR}/base/amulet.svg`,
    altaar: [`${DIR}/base/altaar.svg`, `${DIR}/base/altaarAan.svg`],
    verborgenSchat: [`${DIR}/base/schat.svg`, `${DIR}/base/schatOpen.svg`],
  },
  cssVars: {
    '--dor-board': '#1f2638',
    '--dor-cell': '#2b3550',
    '--dor-gold': '#e0b43a',
    '--dor-gold-edge': '#8a6400',
    '--dor-silver': '#c3c9d4',
    '--dor-silver-edge': '#5d6472',
    '--dor-accent': '#ffd54a',
  },
  credits: [OWN_WORK],
};

export const FACET: ThemeManifest = {
  id: 'facet',
  nameKey: 'thema.facet',
  tiles: range(7, (k) => `${DIR}/facet/steen-${k}.svg`),
  tileLabels: LABELS,
  cssVars: BASE_THEME.cssVars,
  credits: [OWN_WORK],
};

/** Thema's in de lobby. Thema's met `todo` zijn nog niet af. */
export const THEMES: readonly ThemeManifest[] = [FACET];

export const DEFAULT_THEME: ThemeId = 'facet';

export function themeById(id: string): ThemeManifest {
  return THEMES.find((theme) => theme.id === id && !theme.todo) ?? FACET;
}

/** Afbeelding van een spelelement in dit thema, met terugval op het basisthema. */
export function mechanicImage(theme: ThemeManifest, id: MechanicId, variant = 0): string | null {
  const value = theme.mechanics?.[id] ?? BASE_THEME.mechanics?.[id];
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return value[Math.min(variant, value.length - 1)] ?? null;
}

export function tileImage(theme: ThemeManifest, type: number): string {
  return theme.tiles[type] ?? BASE_THEME.tiles[type] ?? BASE_THEME.tiles[0];
}

export function tileLabel(theme: ThemeManifest, type: number): GameTextKey {
  return theme.tileLabels[type] ?? BASE_THEME.tileLabels[type] ?? 'steen.0';
}

export function specialImage(theme: ThemeManifest, special: Special): string {
  return theme.specials?.[special] ?? BASE_THEME.specials?.[special] ?? BASE_THEME.tiles[0];
}

export function hammerImage(theme: ThemeManifest): string {
  return theme.hammer ?? BASE_THEME.hammer ?? BASE_THEME.tiles[0];
}
