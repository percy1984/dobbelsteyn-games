/**
 * Doelen uit de uitbreiding: reiziger en groot blok.
 */
import { chance, randInt } from '../../rng/rng';
import { MECH } from '../config';
import type { Ctx } from '../context';
import { collectGoal, destroyObject } from '../hits';
import { startShift } from '../settle';
import type { BlockPiece, Pos } from '../types';
import type { HitCause, MechanicModule, PlaceContext } from './module';
import { takeBudget } from './place';

const isFree = (ctx: PlaceContext, i: number) =>
  ctx.shape[i] && !ctx.objects[i] && ctx.chains[i] === 0 && !ctx.resin[i] && !ctx.reserved[i] && !ctx.marks[i];

/**
 * Reiziger: een vast figuurtje met een zichtbaar pad naar een uitgang (het laatste vakje van het
 * pad, op de onderste rij). Een match in het volgende vakje van zijn pad laat hem bij het beurteinde
 * één stap opschuiven: hij ruilt van plek met wat daar ligt. Bereikt hij de uitgang, dan is hij
 * gered. Houdt vallende stenen tegen; explosies en de hamer doen hem niets.
 * `tag` = welk pad, `dir` = positie op het pad, `counter` = 1 als hij mag stappen.
 */
export const REIZIGER: MechanicModule = {
  id: 'reiziger',
  place(ctx) {
    const { rows, cols } = ctx;
    for (let attempt = 0; attempt < 10; attempt++) {
      const startR = Math.max(1, rows - 5 - randInt(ctx.rng, 2));
      const startC = randInt(ctx.rng, cols);
      const towards = startC < cols / 2 ? 1 : -1;
      const turnC = Math.max(0, Math.min(cols - 1, startC + towards * (1 + randInt(ctx.rng, 2))));
      const path: Pos[] = [];
      for (let c = startC; c !== turnC; c += towards) path.push({ r: startR, c });
      for (let r = startR; r < rows; r++) path.push({ r, c: turnC });
      if (!path.every((p) => isFree(ctx, p.r * cols + p.c))) continue;
      for (const p of path) ctx.reserved[p.r * cols + p.c] = true;
      const tag = ctx.paths.length;
      ctx.paths.push(path);
      ctx.objects[path[0].r * cols + path[0].c] = { kind: 'block', mech: 'reiziger', layers: 1, color: null, tag, dir: 0 };
      ctx.goals.push({ kind: 'reiziger', target: 1 });
      return;
    }
  },
  onHit(ctx, _at, piece, cause) {
    if (piece.kind !== 'block' || cause.kind !== 'match') return true;
    const next = ctx.s.paths[piece.tag]?.[piece.dir + 1];
    if (next && cause.group.cells.some((p) => p.r === next.r && p.c === next.c)) {
      piece.counter = 1;
    }
    return true;
  },
  onTurnEnd(ctx, _res, systemRes) {
    const { s } = ctx;
    const travelers: { piece: BlockPiece; at: Pos }[] = [];
    s.cells.forEach((cell, i) => {
      const piece = cell.piece;
      if (piece?.kind === 'block' && piece.mech === 'reiziger' && piece.counter === 1) {
        travelers.push({ piece, at: { r: Math.floor(i / s.cols), c: i % s.cols } });
      }
    });
    for (const { piece, at } of travelers) {
      piece.counter = 0;
      const path = s.paths[piece.tag];
      const next = path?.[piece.dir + 1];
      if (!next) continue;
      const here = s.cells[at.r * s.cols + at.c];
      const there = s.cells[next.r * s.cols + next.c];
      const other = there.piece;
      if (other?.kind === 'block') continue;
      here.piece = other;
      there.piece = piece;
      piece.dir++;
      if (other) {
        other.m.res = systemRes();
        startShift(ctx, other, (next.r - at.r) * 1000, (next.c - at.c) * 1000);
      }
      ctx.ev.push({ type: 'Hit', at: next, target: 'reiziger', left: path.length - 1 - piece.dir });
      if (piece.dir >= path.length - 1) {
        destroyObject(ctx, next, systemRes());
        collectGoal(ctx, 'reiziger', 'reiziger', next, systemRes());
      } else {
        startShift(ctx, piece, (at.r - next.r) * 1000, (at.c - next.c) * 1000);
      }
    }
  },
};

/** Een treffer telt per groot blok hooguit één keer per match of explosie. */
const counted = new WeakMap<object, Set<number>>();

function firstTime(cause: HitCause, tag: number): boolean {
  const key = cause.kind === 'match' ? cause.group : cause;
  const seen = counted.get(key) ?? new Set<number>();
  counted.set(key, seen);
  if (seen.has(tag)) return false;
  seen.add(tag);
  return true;
}

function partsOf(ctx: Ctx, tag: number): Pos[] {
  const out: Pos[] = [];
  ctx.s.cells.forEach((cell, i) => {
    const piece = cell.piece;
    if (piece?.kind === 'block' && piece.mech === 'grootBlok' && piece.tag === tag) {
      out.push({ r: Math.floor(i / ctx.s.cols), c: i % ctx.s.cols });
    }
  });
  return out;
}

function removeAll(ctx: Ctx, tag: number, res: number): void {
  const parts = partsOf(ctx, tag);
  for (const p of parts) destroyObject(ctx, p, res);
  if (parts.length > 0) collectGoal(ctx, 'grootBlok', 'grootBlok', parts[0], res);
}

/** Varianten van een groot blok (`dir`). */
export const TAART = 0;
export const EMMER = 1;
export const DOOS = 2;

/**
 * Groot blok: een vast object van 1x2 of 2x2. Elk deel is een eigen object met dezelfde `tag`.
 * - taart: elke aangrenzende match of explosie haalt dat deel weg; alle delen weg, dan is hij weg.
 * - emmer: elke aangrenzende match of explosie is één treffer voor het hele blok.
 * - doos: telt de stenen in aangrenzende matches; vol, dan verdwijnt hij.
 * Hamer niveau 2 haalt het hele blok weg. Doel: alle grote blokken weg.
 */
export const GROOT_BLOK: MechanicModule = {
  id: 'grootBlok',
  place(ctx) {
    const { rows, cols } = ctx;
    const variant = randInt(ctx.rng, 3);
    const square = chance(ctx.rng, 0.5);
    const h = square ? 2 : 1;
    for (let attempt = 0; attempt < 16; attempt++) {
      const r = 2 + randInt(ctx.rng, Math.max(1, rows - 3 - h));
      const c = randInt(ctx.rng, cols - 1);
      const cells: number[] = [];
      for (let dr = 0; dr < h; dr++) for (let dc = 0; dc < 2; dc++) cells.push((r + dr) * cols + c + dc);
      if (!cells.every((i) => isFree(ctx, i))) continue;
      if (takeBudget(ctx, cells.length) < cells.length) return;
      const layers = variant === EMMER ? MECH.emmerHits : variant === DOOS ? MECH.doosStones : 1;
      for (const i of cells) {
        ctx.objects[i] = { kind: 'block', mech: 'grootBlok', layers, color: null, tag: 1, dir: variant };
      }
      ctx.goals.push({ kind: 'grootBlok', target: 1 });
      return;
    }
  },
  onHit(ctx, at, piece, cause, res) {
    if (piece.kind !== 'block') return true;
    if (cause.kind === 'hammer' && cause.level >= 2) {
      removeAll(ctx, piece.tag, res);
      return true;
    }
    if (piece.dir === TAART) {
      if (cause.kind === 'match' || cause.kind === 'explosion' || cause.kind === 'hammer') {
        destroyObject(ctx, at, res);
        ctx.ev.push({ type: 'Hit', at, target: 'grootBlok', left: partsOf(ctx, piece.tag).length });
        if (partsOf(ctx, piece.tag).length === 0) collectGoal(ctx, 'grootBlok', 'grootBlok', at, res);
      }
      return true;
    }
    if (!firstTime(cause, piece.tag)) return true;
    let amount = 0;
    if (piece.dir === EMMER) amount = 1;
    else if (cause.kind === 'match') amount = cause.group.cells.length;
    if (amount === 0) return true;
    const left = Math.max(0, piece.layers - amount);
    for (const p of partsOf(ctx, piece.tag)) {
      const part = ctx.s.cells[p.r * ctx.s.cols + p.c].piece as BlockPiece;
      part.layers = left;
    }
    ctx.ev.push({ type: 'Hit', at, target: 'grootBlok', left });
    if (left === 0) removeAll(ctx, piece.tag, res);
    return true;
  },
};
