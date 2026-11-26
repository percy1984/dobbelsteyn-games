import type { MechanicId } from '../types';
import { ALTAAR, KETTING, MUNTBLOK, ROTSBLOK } from './blockers';
import { AMULET, VEER } from './fallers';
import { GOUD, ZILVER } from './floors';
import type { MechanicModule } from './module';
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
  altaar: ALTAAR,
};

export function moduleFor(id: MechanicId): MechanicModule | null {
  return MODULES[id] ?? null;
}

export function isImplemented(id: MechanicId): boolean {
  return MODULES[id] !== undefined;
}
