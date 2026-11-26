import { pick } from '../../rng/rng';
import { collectGoal } from '../hits';
import type { MechanicModule } from './module';

const SIZES = [
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 2],
] as const;

/**
 * Verborgen schat: een groepje vakjes van 1x1 tot 2x2 met goud of zilver, met een schat eronder die
 * als vage omtrek zichtbaar is. Zodra alle bodemlagen van de groep weg zijn, komt de schat
 * tevoorschijn en is hij verzameld.
 */
export const VERBORGEN_SCHAT: MechanicModule = {
  id: 'verborgenSchat',
  place(ctx) {
    const wanted = ctx.level >= 14 ? 2 : 1;
    let placed = 0;
    for (let attempt = 0; attempt < 40 && placed < wanted; attempt++) {
      const [h, w] = pick(ctx.rng, SIZES);
      const r0 = pick(ctx.rng, Array.from({ length: Math.max(1, ctx.rows - h - 1) }, (_, k) => k + 1));
      const c0 = pick(ctx.rng, Array.from({ length: ctx.cols - w + 1 }, (_, k) => k));
      const cells: number[] = [];
      for (let r = r0; r < r0 + h; r++) {
        for (let c = c0; c < c0 + w; c++) {
          cells.push(r * ctx.cols + c);
        }
      }
      if (cells.some((i) => !ctx.shape[i] || ctx.objects[i] || ctx.treasure[i] >= 0)) {
        continue;
      }
      for (const i of cells) {
        ctx.treasure[i] = placed;
        ctx.floors[i] = Math.max(1, ctx.floors[i]);
      }
      placed++;
    }
    if (placed > 0) {
      ctx.goals.push({ kind: 'schat', target: placed });
    }
  },
  afterTick(ctx) {
    const { s } = ctx;
    const open = new Map<number, boolean>();
    s.cells.forEach((cell) => {
      if (cell.exists && cell.treasure >= 0) {
        open.set(cell.treasure, (open.get(cell.treasure) ?? false) || cell.floor > 0);
      }
    });
    for (const [group, covered] of open) {
      if (covered) {
        continue;
      }
      let first = -1;
      s.cells.forEach((cell, i) => {
        if (cell.treasure === group) {
          cell.treasure = -1;
          if (first < 0) first = i;
        }
      });
      collectGoal(ctx, 'schat', 'verborgenSchat', { r: Math.floor(first / s.cols), c: first % s.cols }, 0);
    }
  },
};
