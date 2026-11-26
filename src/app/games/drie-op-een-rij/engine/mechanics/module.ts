import type { RngState } from '../../rng/rng';
import type { Ctx } from '../context';
import type { MatchGroup } from '../matcher';
import type { Belt, GameState, GoalKind, MechanicId, Piece, PlacedObject, Portal, Pos, TileMark } from '../types';

/** Waardoor een object geraakt wordt. */
export type HitCause =
  | { readonly kind: 'match'; readonly group: MatchGroup }
  /** `special`: bom, kruis of combinatie; anders een explosie van een object (altaar, stekelbol). */
  | { readonly kind: 'explosion'; readonly special: boolean }
  | { readonly kind: 'hammer'; readonly level: 1 | 2 | 3 };

/** Wat de levelgenerator aan een spelelement geeft om objecten te plaatsen. */
export interface PlaceContext {
  readonly rng: RngState;
  readonly rows: number;
  readonly cols: number;
  readonly level: number;
  readonly kinds: number;
  /** Factor uit de moeilijkheid: aantal en sterkte van objecten. */
  readonly strength: number;
  readonly shape: readonly boolean[];
  readonly floors: number[];
  readonly treasure: number[];
  readonly walls: number[];
  readonly objects: (PlacedObject | null)[];
  readonly chains: number[];
  readonly resin: boolean[];
  /** Tijdbommen en klimmers op stenen. */
  readonly marks: (TileMark | null)[];
  readonly portals: Portal[];
  readonly belts: Belt[];
  /** Paden van reizigers. */
  readonly paths: Pos[][];
  /** Vakjes die vrij moeten blijven van objecten, kettingen en hars (pad, band, portaal). */
  readonly reserved: boolean[];
  /** Doelen die dit element toevoegt. */
  readonly goals: { kind: GoalKind; target: number }[];
  /** Maximaal aantal vakjes met een blokkade in dit level (samen voor alle elementen). */
  readonly blockerBudget: { left: number };
}

/**
 * Eén spelelement. Alle hooks zijn optioneel; wat een element niet regelt, volgt de algemene
 * raakregels (een blokkade verliest één laag per treffer).
 */
export interface MechanicModule {
  readonly id: MechanicId;
  /** Plaatst de objecten van dit element bij het maken van een level. */
  place?(ctx: PlaceContext): void;
  /**
   * Een object van dit element wordt geraakt. Geeft true als het element de treffer zelf heeft
   * afgehandeld; false (of geen hook) laat de algemene raakregel werken.
   */
  onHit?(ctx: Ctx, at: Pos, piece: Piece, cause: HitCause, res: number): boolean;
  /** Na elke tick, bijvoorbeeld een amulet dat de onderste rij bereikt. */
  afterTick?(ctx: Ctx): void;
  /** Beurteinde van de zet `res`. `systemRes` maakt zo nodig een systeemreeks aan. */
  onTurnEnd?(ctx: Ctx, res: number, systemRes: () => number): void;
  /** Geeft een verliesreden terug als het level hierdoor verloren is. */
  loseCheck?(s: GameState): boolean;
}
