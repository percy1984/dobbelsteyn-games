/**
 * Levelgenerator. Dezelfde seed plus level, modus, moeilijkheid, bordgrootte, aantal soorten en set
 * actieve spelelementen levert exact hetzelfde level op. Thema en invoerinstelling doen niet mee.
 *
 * Deelreeksen: `layout` (vorm, spelelementen, plaatsing) en `bord` (startbord). De deelreeksen voor
 * spawnpunten, banden, verspreiding en schudden maakt de engine zelf uit dezelfde levelseed.
 */
import { chance, levelSeed, pick, shuffled, stream, type RngState } from '../rng/rng';
import { BOARD, DIFFICULTY, LEVEL } from '../engine/config';
import { isImplemented, moduleFor } from '../engine/mechanics';
import type { PlaceContext } from '../engine/mechanics/module';
import { introductionLevels, normalizeMechanics } from '../engine/mechanics/registry';
import type { GoalKind, LevelLayout, LevelParams, MechanicId, PlacedObject } from '../engine/types';
import { generateStartTiles } from './board-generator';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Kiest de spelelementen voor dit level: zilver mag altijd mee, daarnaast hooguit drie, met het nieuwe voorop. */
export function chooseLevelMechanics(
  rng: RngState,
  params: LevelParams,
): { mechanics: MechanicId[]; newMechanic: MechanicId | null } {
  const active = normalizeMechanics(params.mechanics, params.mode !== 'ontspannen');
  const intro = introductionLevels(active);
  const available = active.filter(
    (id) => id !== 'goud' && isImplemented(id) && (intro.get(id) ?? Infinity) <= params.level,
  );
  const newMechanic = available.find((id) => intro.get(id) === params.level) ?? null;
  const mechanics: MechanicId[] = [];
  if (available.includes('zilver')) {
    mechanics.push('zilver');
  }
  const others = available.filter((id) => id !== 'zilver');
  const picked: MechanicId[] = [];
  if (newMechanic && newMechanic !== 'zilver') {
    picked.push(newMechanic);
  }
  for (const id of shuffled(rng, others)) {
    if (picked.length >= LEVEL.maxMechanicsPerLevel) {
      break;
    }
    if (!picked.includes(id)) {
      picked.push(id);
    }
  }
  mechanics.push(...picked);
  // Vaste volgorde (die van het register), zodat plaatsing niet van de keuzevolgorde afhangt.
  return { mechanics: active.filter((id) => mechanics.includes(id)), newMechanic };
}

/** Bordvorm: vanaf een bepaald level soms gaten, altijd symmetrisch. */
function generateShape(rng: RngState, rows: number, cols: number, level: number): boolean[] {
  const shape = new Array<boolean>(rows * cols).fill(true);
  if (level < LEVEL.holesFromLevel || !chance(rng, 0.5)) {
    return shape;
  }
  const off = (r: number, c: number) => {
    shape[r * cols + c] = false;
    shape[r * cols + (cols - 1 - c)] = false;
  };
  const pattern = pick(rng, ['hoeken', 'midden', 'inkeping'] as const);
  if (pattern === 'hoeken') {
    off(0, 0);
    off(rows - 1, 0);
  } else if (pattern === 'midden') {
    const r = Math.floor(rows / 2) - 1;
    const c = Math.floor(cols / 2) - 1;
    off(r, c);
    off(r + 1, c);
    if (cols % 2 === 1) {
      shape[r * cols + c + 1] = false;
      shape[(r + 1) * cols + c + 1] = false;
    }
  } else {
    const c = Math.floor(cols / 2) - 1;
    off(0, c);
    if (cols % 2 === 1) {
      shape[c + 1] = false;
    }
  }
  return shape;
}

/**
 * Startbord met minstens drie zetten. Lukt dat niet omdat er te veel obstakels liggen, dan haalt de
 * generator ze deterministisch in stappen weg: eerst kettingen, dan blokkades en veren (geen
 * altaren en amuletten, die horen bij de opzet of een doel).
 */
function startTiles(rng: RngState, ctx: PlaceContext, kinds: number): number[] {
  const plan = () => ({ ...ctx, rows: ctx.rows, cols: ctx.cols });
  const strip: (() => void)[] = [
    () => ctx.chains.fill(0),
    () =>
      ctx.objects.forEach((object, i) => {
        if (object && object.mech !== 'altaar' && object.mech !== 'amulet') {
          ctx.objects[i] = null;
        }
      }),
  ];
  for (let round = 0; ; round++) {
    const tiles = generateStartTiles(rng, plan(), kinds);
    if (tiles) {
      return tiles;
    }
    if (round >= strip.length) {
      // Laatste redmiddel: geen obstakels meer behalve amuletten.
      ctx.objects.forEach((object, i) => {
        if (object && object.mech !== 'amulet') ctx.objects[i] = null;
      });
      return generateStartTiles(rng, plan(), kinds) ?? new Array<number>(ctx.rows * ctx.cols).fill(-1);
    }
    strip[round]();
  }
}

export function generateLevel(params: LevelParams): LevelLayout {
  const seed = levelSeed(params.seed, params.level);
  const layoutRng = stream(seed, 'layout');
  const difficulty = DIFFICULTY[params.difficulty];
  const rows = clamp(params.rows, BOARD.minSize, BOARD.maxSize);
  const cols = clamp(params.cols, BOARD.minSize, BOARD.maxSize);
  const kinds = clamp(params.kinds + difficulty.kindsDelta, BOARD.minKinds - 1, BOARD.maxKinds);
  const size = rows * cols;

  const { mechanics, newMechanic } = chooseLevelMechanics(layoutRng, params);
  const shape = generateShape(layoutRng, rows, cols, params.level);
  const goals: { kind: GoalKind; target: number }[] = [];
  const ctx: PlaceContext = {
    rng: layoutRng,
    rows,
    cols,
    level: params.level,
    kinds,
    strength: difficulty.strength,
    shape,
    floors: new Array<number>(size).fill(0),
    treasure: new Array<number>(size).fill(-1),
    walls: new Array<number>(size).fill(0),
    objects: new Array<PlacedObject | null>(size).fill(null),
    chains: new Array<number>(size).fill(0),
    resin: new Array<boolean>(size).fill(false),
    goals,
    blockerBudget: { left: Math.floor(shape.filter(Boolean).length * BOARD.maxBlockerShare) },
  };
  for (const id of ['goud' as MechanicId, ...mechanics]) {
    moduleFor(id)?.place?.(ctx);
  }

  const floorCount = ctx.floors.filter((f, i) => shape[i] && f > 0).length;
  const allGoals = [{ kind: 'goud' as GoalKind, target: floorCount }, ...goals];
  const otherUnits = goals.reduce((sum, goal) => sum + goal.target, 0);

  const tiles = startTiles(stream(seed, 'bord'), ctx, kinds);

  const moves =
    params.mode === 'beurten'
      ? Math.round(
          (LEVEL.movesBase + floorCount * LEVEL.movesPerGold + otherUnits * LEVEL.movesPerGoalUnit) *
            difficulty.budget,
        )
      : null;
  const extraFloors = ctx.floors.filter((f) => f === 2).length;
  const seconds =
    params.mode === 'tijd'
      ? Math.round(
          (LEVEL.secondsBase + (floorCount + extraFloors + otherUnits) * LEVEL.secondsPerGoalUnit) *
            difficulty.budget,
        )
      : null;

  return {
    params,
    rows,
    cols,
    kinds,
    shape,
    floors: ctx.floors,
    treasure: ctx.treasure,
    walls: ctx.walls,
    objects: ctx.objects,
    chains: ctx.chains,
    resin: ctx.resin,
    tiles,
    goals: allGoals,
    moves,
    seconds,
    mechanics,
    newMechanic,
  };
}
