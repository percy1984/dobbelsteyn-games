import type { MechanicId } from '../types';
import { ALTAAR, KETTING, MUNTBLOK, ROTSBLOK } from './blockers';
import { AMULET, VEER } from './fallers';
import { GOUD, ZILVER } from './floors';
import { HARS, KLEURBLOK, MUUR, SCHILD } from './layers';
import { LOPENDE_BAND, PORTAAL } from './flow';
import { PERS, STEKELBOL, WATERKLOK } from './helpers';
import type { MechanicModule } from './module';
import { GOUDZAKJE, OLIE, OLIEBRON } from './spreaders';
import { VERBORGEN_SCHAT } from './treasure';

/**
 * Geïmplementeerde spelelementen. Een element uit het register zonder module komt (nog) niet in
 * levels voor, ook als het in de lobby aan staat.
 */
export const MODULES: Partial<Record<MechanicId, MechanicModule>> = {
  goud: GOUD,
  zilver: ZILVER,
  amulet: AMULET,
  verborgenSchat: VERBORGEN_SCHAT,
  ketting: KETTING,
  rotsblok: ROTSBLOK,
  muntblok: MUNTBLOK,
  veer: VEER,
  kleurblok: KLEURBLOK,
  hars: HARS,
  schild: SCHILD,
  muur: MUUR,
  olie: OLIE,
  oliebron: OLIEBRON,
  goudzakje: GOUDZAKJE,
  portaal: PORTAAL,
  lopendeBand: LOPENDE_BAND,
  stekelbol: STEKELBOL,
  pers: PERS,
  waterklok: WATERKLOK,
  altaar: ALTAAR,
};

export function moduleFor(id: MechanicId): MechanicModule | null {
  return MODULES[id] ?? null;
}

export function isImplemented(id: MechanicId): boolean {
  return MODULES[id] !== undefined;
}
