import { shuffled } from '../../rng/rng';
import { LEVEL } from '../config';
import type { MechanicModule, PlaceContext } from './module';

/** Paren van gespiegelde vakjes (links/rechts), zodat patronen rustig en symmetrisch ogen. */
function mirroredPairs(ctx: PlaceContext, usable: (i: number) => boolean): number[][] {
  const pairs: number[][] = [];
  const half = Math.ceil(ctx.cols / 2);
  for (let r = 0; r < ctx.rows; r++) {
    for (let c = 0; c < half; c++) {
      const i = r * ctx.cols + c;
      const j = r * ctx.cols + (ctx.cols - 1 - c);
      if (usable(i) && usable(j)) {
        pairs.push(i === j ? [i] : [i, j]);
      }
    }
  }
  return pairs;
}

/**
 * Goud: bodemlaag. Een match bovenop het vakje of een explosie raakt het. Doel: alle goud weg.
 * Het aandeel goud groeit met het level.
 */
export const GOUD: MechanicModule = {
  id: 'goud',
  place(ctx) {
    const existing = ctx.shape.filter(Boolean).length;
    const share = Math.min(
      LEVEL.goldShareMax,
      LEVEL.goldShareStart + LEVEL.goldShareStep * (ctx.level - 1),
    );
    const target = Math.max(4, Math.round(existing * share));
    let placed = 0;
    for (const pair of shuffled(ctx.rng, mirroredPairs(ctx, (i) => ctx.shape[i]))) {
      if (placed >= target) {
        break;
      }
      for (const i of pair) {
        ctx.floors[i] = 1;
      }
      placed += pair.length;
    }
  },
};

/** Zilver: bodemlaag die twee keer geraakt moet worden; zilver wordt goud, goud wordt leeg. */
export const ZILVER: MechanicModule = {
  id: 'zilver',
  place(ctx) {
    const pairs = shuffled(
      ctx.rng,
      mirroredPairs(ctx, (i) => ctx.floors[i] === 1),
    );
    const count = Math.round(pairs.length * Math.min(0.6, 0.3 * ctx.strength));
    for (const pair of pairs.slice(0, count)) {
      for (const i of pair) {
        ctx.floors[i] = 2;
      }
    }
  },
};
