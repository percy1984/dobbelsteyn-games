import type { MechanicId } from '../types';

export type MechanicCategory =
  | 'doelen'
  | 'blokkades'
  | 'verspreiders'
  | 'bordstroom'
  | 'hulpobjecten'
  | 'verlies';

export interface MechanicInfo {
  readonly id: MechanicId;
  /** Positie in het bitmasker van de URL. Verandert nooit. */
  readonly bitIndex: number;
  readonly category: MechanicCategory;
  readonly defaultOn: boolean;
  /** Altijd aan en niet uit te zetten (goud). */
  readonly alwaysOn: boolean;
  /**
   * Volgorde waarin spelelementen in levels verschijnen. Het werkelijke level hangt af van welke
   * elementen aan staan (zie `introductionLevels`), zodat er nooit lange gaten vallen.
   */
  readonly introductieLevel: number;
  /** Spelelementen die aan moeten staan voordat dit element kan. */
  readonly vereist: readonly MechanicId[];
  readonly isVerliesmechaniek: boolean;
}

/**
 * Register van alle spelelementen. De volgorde is vast: nieuwe elementen komen alleen achteraan
 * erbij en een bitIndex verandert nooit, anders kloppen gedeelde bordnummers niet meer.
 * Naam en uitleg staan in de vertalingen: `mech.<id>.naam` en `mech.<id>.uitleg`.
 */
export const MECHANICS: readonly MechanicInfo[] = [
  m('goud', 0, 'doelen', true, 1, [], { alwaysOn: true }),
  m('zilver', 1, 'doelen', true, 2),
  m('amulet', 2, 'doelen', true, 5),
  m('verborgenSchat', 3, 'doelen', true, 9),
  m('reiziger', 4, 'doelen', false, 22),
  m('grootBlok', 5, 'doelen', false, 23),
  m('ketting', 6, 'blokkades', true, 3),
  m('rotsblok', 7, 'blokkades', true, 4),
  m('muntblok', 8, 'blokkades', true, 7),
  m('kleurblok', 9, 'blokkades', false, 10),
  m('hars', 10, 'blokkades', false, 11),
  m('veer', 11, 'blokkades', true, 6),
  m('schild', 12, 'blokkades', false, 12),
  m('muur', 13, 'blokkades', false, 13),
  m('olie', 14, 'verspreiders', false, 14),
  m('oliebron', 15, 'verspreiders', false, 15, ['olie']),
  m('goudzakje', 16, 'verspreiders', false, 16),
  m('portaal', 17, 'bordstroom', false, 17),
  m('lopendeBand', 18, 'bordstroom', false, 18),
  m('altaar', 19, 'hulpobjecten', true, 8),
  m('stekelbol', 20, 'hulpobjecten', false, 19),
  m('pers', 21, 'hulpobjecten', false, 20),
  m('waterklok', 22, 'hulpobjecten', false, 21),
  m('tijdbom', 23, 'verlies', false, 24, [], { lose: true }),
  m('klimmer', 24, 'verlies', false, 25, [], { lose: true }),
];

function m(
  id: MechanicId,
  bitIndex: number,
  category: MechanicCategory,
  defaultOn: boolean,
  introductieLevel: number,
  vereist: readonly MechanicId[] = [],
  flags: { alwaysOn?: boolean; lose?: boolean } = {},
): MechanicInfo {
  return {
    id,
    bitIndex,
    category,
    defaultOn,
    alwaysOn: flags.alwaysOn ?? false,
    introductieLevel,
    vereist,
    isVerliesmechaniek: flags.lose ?? false,
  };
}

export const CATEGORIES: readonly MechanicCategory[] = [
  'doelen',
  'blokkades',
  'verspreiders',
  'bordstroom',
  'hulpobjecten',
  'verlies',
];

const BY_ID = new Map(MECHANICS.map((info) => [info.id, info]));

export function mechanicInfo(id: MechanicId): MechanicInfo {
  const info = BY_ID.get(id);
  if (!info) {
    throw new Error(`Onbekend spelelement: ${id}`);
  }
  return info;
}

export function isMechanicId(value: string): value is MechanicId {
  return BY_ID.has(value as MechanicId);
}

/**
 * Maakt een set geldig: goud staat altijd aan, afhankelijkheden worden afgedwongen (staat olie uit,
 * dan ook de oliebron) en zonder verliesmechanieken als `allowLose` false is (modus Ontspannen).
 * Geeft de elementen terug in de volgorde van het register.
 */
export function normalizeMechanics(ids: Iterable<MechanicId>, allowLose = true): MechanicId[] {
  const on = new Set(ids);
  for (const info of MECHANICS) {
    if (info.alwaysOn) {
      on.add(info.id);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const info of MECHANICS) {
      if (on.has(info.id) && info.vereist.some((dep) => !on.has(dep))) {
        on.delete(info.id);
        changed = true;
      }
    }
  }
  return MECHANICS.filter(
    (info) => on.has(info.id) && (allowLose || !info.isVerliesmechaniek),
  ).map((info) => info.id);
}

/** Bitmasker van een set spelelementen in base36, voor de URL. */
export function mechanicsToMask(ids: Iterable<MechanicId>): string {
  let mask = 0;
  for (const id of ids) {
    mask += 2 ** mechanicInfo(id).bitIndex;
  }
  return mask.toString(36);
}

/** Leest een bitmasker uit de URL. Onbekende bits worden genegeerd; ongeldige invoer geeft null. */
export function maskToMechanics(mask: string): MechanicId[] | null {
  if (!/^[0-9a-z]{1,10}$/.test(mask)) {
    return null;
  }
  const value = parseInt(mask, 36);
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return MECHANICS.filter((info) => Math.floor(value / 2 ** info.bitIndex) % 2 === 1).map(
    (info) => info.id,
  );
}

/**
 * Het level waarin elk actief element voor het eerst voorkomt. Goud vanaf level 1; de rest om de
 * twee levels in de volgorde van `introductieLevel`, zodat er hooguit één nieuw element per level
 * bijkomt, ook als de speler maar een paar elementen aan heeft staan.
 */
export function introductionLevels(active: readonly MechanicId[]): Map<MechanicId, number> {
  const levels = new Map<MechanicId, number>();
  const ordered = MECHANICS.filter((info) => active.includes(info.id)).sort(
    (a, b) => a.introductieLevel - b.introductieLevel,
  );
  let rank = 0;
  for (const info of ordered) {
    if (info.alwaysOn) {
      levels.set(info.id, 1);
    } else {
      levels.set(info.id, 2 + rank * 2);
      rank++;
    }
  }
  return levels;
}
