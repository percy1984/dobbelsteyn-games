import type { MechanicId } from '../types';
import { GOUD, ZILVER } from './floors';
import type { MechanicModule } from './module';

/**
 * Geïmplementeerde spelelementen. Een element uit het register zonder module komt (nog) niet in
 * levels voor, ook als het in de lobby aan staat.
 */
export const MODULES: Partial<Record<MechanicId, MechanicModule>> = {
  goud: GOUD,
  zilver: ZILVER,
};

export function moduleFor(id: MechanicId): MechanicModule | null {
  return MODULES[id] ?? null;
}

export function isImplemented(id: MechanicId): boolean {
  return MODULES[id] !== undefined;
}
