/**
 * Algemene raakregels:
 * - Een match raakt de bodemlaag van elk vakje in de match één keer.
 * - Een match raakt elk aangrenzend object hooguit één keer, ook als meerdere stenen ernaast liggen.
 * - Een explosie raakt elk vakje in haar bereik één keer: steen weg, bodemlaag één keer geraakt,
 *   ketting één schakel, blokkade één laag.
 * Uitzonderingen regelt een spelelement zelf in `onHit`.
 */
import { cellAt } from './board';
import { SCORE } from './config';
import { speed, unsettle, type Ctx } from './context';
import { moduleFor } from './mechanics';
import type { HitCause } from './mechanics/module';
import type { GoalKind, MechanicId, Piece, Pos, TilePiece } from './types';

export function addScore(ctx: Ctx, points: number, res: number): void {
  if (points <= 0) {
    return;
  }
  ctx.s.score += points;
  ctx.ev.push({ type: 'ScoreAdded', points, res });
}

/** Raakt de bodemlaag van een vakje één keer: zilver wordt goud, goud wordt leeg. */
export function hitFloor(ctx: Ctx, at: Pos, res: number): void {
  const cell = cellAt(ctx.s, at.r, at.c);
  if (!cell || cell.floor === 0) {
    return;
  }
  cell.floor--;
  ctx.ev.push({ type: 'Hit', at, target: 'bodem', left: cell.floor });
  addScore(ctx, SCORE.floorHit, res);
}

/** Laat een steen of valobject verdwijnen: eerst even gemarkeerd, daarna verdwijnend. */
export function markForClear(ctx: Ctx, piece: Piece, res: number): void {
  piece.m.state = 'gemarkeerd';
  piece.m.timer = speed(ctx.s).mark;
  piece.m.dur = piece.m.timer;
  piece.m.res = res;
  piece.m.bounce = false;
  unsettle(ctx.s);
}

/** Verwijdert een vast object direct uit zijn vakje. */
export function destroyObject(ctx: Ctx, at: Pos, res: number): void {
  const cell = cellAt(ctx.s, at.r, at.c);
  if (!cell?.piece || cell.piece.kind === 'tile') {
    return;
  }
  ctx.ev.push({ type: 'ObjectDestroyed', at, mech: cell.piece.mech });
  cell.piece = null;
  cell.res = res;
  unsettle(ctx.s);
}

/**
 * Raakt een object (blokkade, hulpobject, valobject) één keer. Het spelelement mag de treffer
 * overnemen; anders verliest een blokkade één laag en verdwijnt hij bij nul.
 */
export function hitObject(ctx: Ctx, at: Pos, cause: HitCause, res: number): void {
  const piece = cellAt(ctx.s, at.r, at.c)?.piece;
  if (!piece || piece.kind === 'tile') {
    return;
  }
  const module = moduleFor(piece.mech);
  if (module?.onHit?.(ctx, at, piece, cause, res)) {
    return;
  }
  if (piece.kind === 'block') {
    // Hamer niveau 2 haalt een blokkade in één keer weg.
    piece.layers = cause.kind === 'hammer' && cause.level >= 2 ? 0 : piece.layers - 1;
    ctx.ev.push({ type: 'Hit', at, target: piece.mech, left: Math.max(0, piece.layers) });
    addScore(ctx, SCORE.blockerHit, res);
    if (piece.layers <= 0) {
      destroyObject(ctx, at, res);
    }
  }
}

/** Oorzaak van een explosie: bom, kruis, combinatie of object (altaar), of de hamer. */
export type ExplosionCause = Extract<HitCause, { kind: 'explosion' } | { kind: 'hammer' }>;

/**
 * Laat een steen verdwijnen. Een speciale steen licht eerst even op (ontstekend) en gaat daarna af
 * (`detonate`): een bom raakt het 3x3-vlak eromheen, een kruis de hele rij en kolom. Een kleurenster die door een explosie geraakt wordt, ruimt alle
 * stenen van de meest voorkomende soort op (bij gelijkspel de laagste soort).
 */
export function clearTile(ctx: Ctx, at: Pos, piece: TilePiece, res: number): void {
  if (piece.special) {
    // Speciale steen: eerst even ontstekend, daarna gaat hij af (zie detonate in motion.ts).
    piece.m.state = 'ontstekend';
    piece.m.timer = speed(ctx.s).trigger;
    piece.m.dur = piece.m.timer;
    piece.m.res = res;
    piece.m.bounce = false;
    unsettle(ctx.s);
    return;
  }
  markForClear(ctx, piece, res);
  if (piece.mech === 'klimmer') {
    // Klimmer gevangen.
    collectGoal(ctx, 'klimmer', 'klimmer', at, res);
  }
}

/** Een ontstoken speciale steen gaat af: hij verdwijnt en zijn explosie volgt. */
export function detonate(ctx: Ctx, at: Pos, piece: TilePiece): void {
  const special = piece.special;
  const res = piece.m.res;
  markForClear(ctx, piece, res);
  if (!special) {
    return;
  }
  ctx.ev.push({ type: 'SpecialTriggered', at, special });
  if (special === 'bom') {
    explode(ctx, area(at, 1), res, { kind: 'explosion', special: true });
  } else if (special === 'kruis') {
    explode(ctx, lines(ctx, [at.r], [at.c]), res, { kind: 'explosion', special: true });
  } else {
    clearType(ctx, mostCommonType(ctx), res);
  }
}

/** Vierkant van (2*radius+1) vakjes rond een positie. */
export function area(at: Pos, radius: number): Pos[] {
  const out: Pos[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      out.push({ r: at.r + dr, c: at.c + dc });
    }
  }
  return out;
}

/** Hele rijen en kolommen. */
export function lines(ctx: Ctx, rows: readonly number[], cols: readonly number[]): Pos[] {
  const out: Pos[] = [];
  for (const r of rows) {
    for (let c = 0; c < ctx.s.cols; c++) out.push({ r, c });
  }
  for (const c of cols) {
    for (let r = 0; r < ctx.s.rows; r++) out.push({ r, c });
  }
  return out;
}

function mostCommonType(ctx: Ctx): number {
  const counts = new Array<number>(ctx.s.kinds).fill(0);
  for (const cell of ctx.s.cells) {
    const piece = cell.piece;
    if (piece?.kind === 'tile' && piece.special !== 'ster' && piece.m.state === 'stabiel' && piece.type < counts.length) {
      counts[piece.type]++;
    }
  }
  return counts.indexOf(Math.max(...counts));
}

/**
 * Alle stabiele stenen van één soort verdwijnen (kleurenster, hamer niveau 3). De bodemlagen eronder
 * worden één keer geraakt; blokkades niet. Stenen met een ketting verliezen een schakel.
 */
export function clearType(ctx: Ctx, type: number, res: number): void {
  const { s } = ctx;
  for (let i = 0; i < s.cells.length; i++) {
    const piece = s.cells[i].piece;
    if (piece?.kind !== 'tile' || piece.type !== type || piece.special === 'ster' || piece.m.state !== 'stabiel') {
      continue;
    }
    const at = { r: Math.floor(i / s.cols), c: i % s.cols };
    hitFloor(ctx, at, res);
    if (piece.chain > 0) {
      piece.chain--;
      ctx.ev.push({ type: 'Hit', at, target: 'ketting', left: piece.chain });
    } else {
      piece.resin = false;
      clearTile(ctx, at, piece, res);
    }
  }
}

/**
 * Een explosie op een reeks vakjes. Elk vakje wordt één keer geraakt, ook als het meerdere keren
 * in de lijst staat: steen weg, bodemlaag één keer, ketting één schakel, blokkade één laag. Hars
 * houdt een explosie tegen. Stenen die nog bewegen, worden niet geraakt.
 */
export function explode(ctx: Ctx, cells: readonly Pos[], res: number, cause: ExplosionCause): void {
  const seen = new Set<string>();
  const hit: Pos[] = [];
  for (const at of cells) {
    const key = `${at.r},${at.c}`;
    if (seen.has(key) || !cellAt(ctx.s, at.r, at.c)) {
      continue;
    }
    seen.add(key);
    hit.push(at);
  }
  if (hit.length === 0) {
    return;
  }
  ctx.ev.push({ type: 'Explosion', cells: hit, res });
  for (const at of hit) {
    const cell = cellAt(ctx.s, at.r, at.c);
    if (!cell) {
      continue;
    }
    hitFloor(ctx, at, res);
    const piece = cell.piece;
    if (!piece) {
      continue;
    }
    if (piece.kind === 'tile') {
      if (piece.m.state !== 'stabiel') {
        continue;
      }
      if (piece.chain > 0) {
        piece.chain--;
        ctx.ev.push({ type: 'Hit', at, target: 'ketting', left: piece.chain });
      } else if (!piece.resin) {
        clearTile(ctx, at, piece, res);
      }
    } else if (piece.kind === 'block' || piece.m.state === 'stabiel') {
      hitObject(ctx, at, cause, res);
    }
  }
}

/** Aantal vakjes met een bodemlaag (goud of zilver). */
export function floorsLeft(ctx: Ctx): number {
  return ctx.s.cells.filter((cell) => cell.exists && cell.floor > 0).length;
}

/** Werkt de doelen bij en meldt elke verandering. */
export function updateGoals(ctx: Ctx): void {
  for (const goal of ctx.s.goals) {
    const done = goalDone(ctx, goal.kind, goal.target, goal.done);
    if (done !== goal.done) {
      goal.done = done;
      ctx.ev.push({ type: 'GoalProgress', kind: goal.kind, done, target: goal.target });
    }
  }
}

function goalDone(ctx: Ctx, kind: GoalKind, target: number, current: number): number {
  if (kind === 'goud') {
    return Math.max(0, target - floorsLeft(ctx));
  }
  return Math.min(target, current);
}

/** Zijn alle doelen gehaald? Zonder doelen (alleen in tests) is een level nooit gewonnen. */
export function goalsComplete(ctx: Ctx): boolean {
  return ctx.s.goals.length > 0 && ctx.s.goals.every((goal) => goal.done >= goal.target);
}

/** Verhoogt een telbaar doel (amulet, schat, ...) en geeft punten. */
export function collectGoal(ctx: Ctx, kind: GoalKind, mech: MechanicId, at: Pos, res: number): void {
  ctx.ev.push({ type: 'Collected', at, mech });
  const goal = ctx.s.goals.find((g) => g.kind === kind);
  if (goal && goal.done < goal.target) {
    goal.done++;
    ctx.ev.push({ type: 'GoalProgress', kind, done: goal.done, target: goal.target });
  }
  addScore(ctx, SCORE.collected, res);
}
