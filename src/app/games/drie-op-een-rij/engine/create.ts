import { levelSeed } from '../rng/rng';
import { TICKS_PER_SECOND } from './config';
import { stableMotion } from './context';
import type {
  Cell,
  EngineOptions,
  GameState,
  LevelLayout,
  Piece,
  PlacedObject,
  TileMark,
} from './types';

/** Wat nodig is om de vakjes van een bord op te bouwen. */
export interface CellPlan {
  readonly rows: number;
  readonly cols: number;
  readonly shape: readonly boolean[];
  readonly floors: readonly number[];
  readonly treasure: readonly number[];
  readonly walls: readonly number[];
  readonly objects: readonly (PlacedObject | null)[];
  readonly chains: readonly number[];
  readonly resin: readonly boolean[];
  readonly tiles: readonly number[];
  /** Tijdbommen en klimmers op stenen (optioneel). */
  readonly marks?: readonly (TileMark | null)[];
}

/** Bouwt de vakjes met stukken. Id's worden rij voor rij uitgedeeld vanaf `firstId`. */
export function buildCells(plan: CellPlan, firstId = 1): { cells: Cell[]; nextId: number } {
  let nextId = firstId;
  const cells: Cell[] = plan.shape.map((exists, i) => {
    let piece: Piece | null = null;
    const object = plan.objects[i];
    if (exists && object) {
      piece =
        object.kind === 'block'
          ? {
              id: nextId++,
              kind: 'block',
              mech: object.mech,
              layers: object.layers,
              color: object.color,
              counter: object.counter ?? 0,
              dir: object.dir ?? 0,
              tag: object.tag ?? 0,
              m: stableMotion(),
            }
          : { id: nextId++, kind: 'fall', mech: object.mech, m: stableMotion() };
    } else if (exists && plan.tiles[i] >= 0) {
      piece = {
        id: nextId++,
        kind: 'tile',
        type: plan.tiles[i],
        special: null,
        chain: plan.chains[i],
        resin: plan.resin[i],
        mech: plan.marks?.[i]?.mech ?? null,
        counter: plan.marks?.[i]?.counter ?? 0,
        m: stableMotion(),
      };
    }
    return {
      exists,
      floor: exists ? plan.floors[i] : 0,
      treasure: exists ? plan.treasure[i] : -1,
      piece,
      walls: plan.walls[i],
      res: 0,
    };
  });
  return { cells, nextId };
}

/**
 * Start een spel uit een level. Het startbord heeft geen matches en minstens drie zetten, dus het
 * spel begint direct in een rustmoment.
 */
export function createGame(layout: LevelLayout, options: EngineOptions): GameState {
  const { cells, nextId } = buildCells(layout);
  const mode = layout.params.mode;
  return {
    rows: layout.rows,
    cols: layout.cols,
    kinds: layout.kinds,
    mode,
    options,
    seed: levelSeed(layout.params.seed, layout.params.level),
    mechanics: ['goud', ...layout.mechanics.filter((id) => id !== 'goud')],
    tick: 0,
    nextId,
    cells,
    rng: {},
    resolutions: [],
    nextRes: 1,
    pendingTurnEnds: [],
    locked: false,
    settled: true,
    score: 0,
    movesLeft: mode === 'beurten' ? layout.moves : null,
    ticksLeft: mode === 'tijd' && layout.seconds !== null ? layout.seconds * TICKS_PER_SECOND : null,
    timeUp: false,
    goals: layout.goals.map((goal) => ({ ...goal, done: 0 })),
    result: null,
    loseReason: null,
    moves: 0,
    hammer: 0,
    combos: [],
    portals: layout.portals ?? [],
    belts: layout.belts ?? [],
    paths: layout.paths ?? [],
    oilCleared: [],
  };
}
