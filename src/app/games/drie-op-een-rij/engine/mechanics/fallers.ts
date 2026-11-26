import { cellAt } from '../board';
import { SCORE } from '../config';
import { addScore, collectGoal, markForClear } from '../hits';
import type { MechanicModule } from './module';
import { freeCells, pickMirrored, scaled } from './place';

/**
 * Amulet: valobject, niet matchbaar. Laat het naar de onderste rij van zijn kolom zakken, daar wordt
 * het verzameld. Explosies en de hamer doen het niets.
 */
export const AMULET: MechanicModule = {
  id: 'amulet',
  place(ctx) {
    const count = scaled(ctx, 1, 0.15, 1, 4);
    const top = Math.max(1, Math.floor(ctx.rows / 2) - 1);
    const cells = pickMirrored(ctx, freeCells(ctx, (r) => r < top), count);
    for (const i of cells) {
      ctx.objects[i] = { kind: 'fall', mech: 'amulet' };
    }
    if (cells.length > 0) {
      ctx.goals.push({ kind: 'amulet', target: cells.length });
    }
  },
  onHit() {
    return true;
  },
  afterTick(ctx) {
    const { s } = ctx;
    for (let i = 0; i < s.cells.length; i++) {
      const piece = s.cells[i].piece;
      if (piece?.kind !== 'fall' || piece.mech !== 'amulet' || piece.m.state !== 'stabiel') {
        continue;
      }
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      if (!cellAt(s, r + 1, c)) {
        markForClear(ctx, piece, piece.m.res);
        collectGoal(ctx, 'amulet', 'amulet', { r, c }, piece.m.res);
      }
    }
  },
};

/** Veer: valobject, niet matchbaar. Eén aangrenzende match, een explosie of de hamer haalt hem weg. */
export const VEER: MechanicModule = {
  id: 'veer',
  place(ctx) {
    const count = scaled(ctx, 2, 0.3, 1, 8);
    const cells = pickMirrored(ctx, freeCells(ctx, (r) => r < ctx.rows - 2), count);
    for (const i of cells) {
      ctx.objects[i] = { kind: 'fall', mech: 'veer' };
    }
  },
  onHit(ctx, at, piece, _cause, res) {
    if (piece.m.state === 'stabiel') {
      ctx.ev.push({ type: 'Hit', at, target: 'veer', left: 0 });
      markForClear(ctx, piece, res);
      addScore(ctx, SCORE.blockerHit, res);
    }
    return true;
  },
};
