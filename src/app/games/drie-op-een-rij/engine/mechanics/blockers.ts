import { chance, randInt } from '../../rng/rng';
import { ring } from '../board';
import { SCORE } from '../config';
import { addScore, destroyObject, explode } from '../hits';
import type { BlockPiece } from '../types';
import type { MechanicModule, PlaceContext } from './module';
import { freeCells, pickMirrored, scaled, takeBudget } from './place';

function placeBlocks(
  ctx: PlaceContext,
  wanted: number,
  candidates: number[],
  make: (i: number) => { layers: number; color: number | null },
  mech: BlockPiece['mech'],
): number[] {
  const granted = takeBudget(ctx, wanted);
  const cells = pickMirrored(ctx, candidates, granted);
  ctx.blockerBudget.left += granted - cells.length;
  for (const i of cells) {
    const { layers, color } = make(i);
    ctx.objects[i] = { kind: 'block', mech, layers, color };
  }
  return cells;
}

/** Niet in de bovenste twee rijen, zodat er altijd ruimte is om stenen te laten binnenkomen. */
const belowTop = (r: number) => r >= 2;

/** Ketting: laag op een steen met 1 of 2 schakels. De engine regelt matches en explosies zelf. */
export const KETTING: MechanicModule = {
  id: 'ketting',
  place(ctx) {
    const count = scaled(ctx, 3, 0.6, 2, 16);
    const cells = pickMirrored(ctx, freeCells(ctx), count);
    const double = ctx.level >= 4 && chance(ctx.rng, Math.min(0.6, 0.3 * ctx.strength));
    cells.forEach((i, k) => {
      ctx.chains[i] = double && k % 3 === 0 ? 2 : 1;
    });
  },
};

/** Rotsblok: blokkade met 1 tot 3 lagen. Elke aangrenzende match en elke explosie raakt hem één keer. */
export const ROTSBLOK: MechanicModule = {
  id: 'rotsblok',
  place(ctx) {
    const maxLayers = Math.max(1, Math.min(3, 1 + Math.floor(((ctx.level - 1) / 6) * ctx.strength)));
    placeBlocks(
      ctx,
      scaled(ctx, 4, 0.4, 2, 14),
      freeCells(ctx, belowTop),
      (i) => ({ layers: 1 + (Math.floor(i / ctx.cols) % maxLayers), color: null }),
      'rotsblok',
    );
  },
};

/**
 * Muntblok: blokkade met 1 laag. Bij breken: bonuspunten. (Het stuk hamermeter komt erbij zodra de
 * hamer er is.)
 */
export const MUNTBLOK: MechanicModule = {
  id: 'muntblok',
  place(ctx) {
    placeBlocks(ctx, scaled(ctx, 2, 0.15, 1, 4), freeCells(ctx, belowTop), () => ({ layers: 1, color: null }), 'muntblok');
  },
  onHit(ctx, at, piece, _cause, res) {
    if (piece.kind !== 'block') {
      return true;
    }
    piece.layers--;
    ctx.ev.push({ type: 'Hit', at, target: 'muntblok', left: Math.max(0, piece.layers) });
    addScore(ctx, SCORE.blockerHit, res);
    if (piece.layers <= 0) {
      destroyObject(ctx, at, res);
      addScore(ctx, SCORE.coinBlock, res);
    }
    return true;
  },
};

/**
 * Altaar: vast object met een kleur. Een aangrenzende match in die kleur ontsteekt het. Bij het
 * beurteinde geeft een brandend altaar een explosie op de 8 omliggende vakjes (diagonaal telt hier
 * wel mee) en dooft daarna. Kan opnieuw ontstoken worden. Explosies en matches in een andere kleur
 * doen het niets. `counter` = 1 betekent brandend.
 */
export const ALTAAR: MechanicModule = {
  id: 'altaar',
  place(ctx) {
    const inner = (r: number, c: number) => r >= 2 && r <= ctx.rows - 2 && c >= 1 && c <= ctx.cols - 2;
    placeBlocks(
      ctx,
      ctx.level >= 12 ? 2 : 1,
      freeCells(ctx, inner),
      () => ({ layers: 1, color: randInt(ctx.rng, ctx.kinds) }),
      'altaar',
    );
  },
  onHit(ctx, at, piece, cause) {
    if (piece.kind === 'block' && cause.kind === 'match' && cause.group.type === piece.color && piece.counter === 0) {
      piece.counter = 1;
      ctx.ev.push({ type: 'Hit', at, target: 'altaar', left: 1 });
    }
    return true;
  },
  onTurnEnd(ctx, _res, systemRes) {
    const { s } = ctx;
    for (let i = 0; i < s.cells.length; i++) {
      const piece = s.cells[i].piece;
      if (piece?.kind === 'block' && piece.mech === 'altaar' && piece.counter === 1) {
        piece.counter = 0;
        const at = { r: Math.floor(i / s.cols), c: i % s.cols };
        ctx.ev.push({ type: 'Hit', at, target: 'altaar', left: 0 });
        explode(ctx, ring(at), systemRes(), false);
      }
    }
  },
};
