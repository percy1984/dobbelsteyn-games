/**
 * Blokkades en lagen uit de uitbreiding: kleurblok, hars, schild en muur.
 */
import { randInt } from '../../rng/rng';
import { WALL_BOTTOM, WALL_LEFT, WALL_RIGHT, WALL_TOP, type BlockPiece } from '../types';
import type { MechanicModule, PlaceContext } from './module';
import { freeCells, pickMirrored, scaled, takeBudget } from './place';

const belowTop = (r: number) => r >= 2;

function placeBlocks(
  ctx: PlaceContext,
  wanted: number,
  make: () => { layers: number; color: number | null },
  mech: BlockPiece['mech'],
): number[] {
  const granted = takeBudget(ctx, wanted);
  const cells = pickMirrored(ctx, freeCells(ctx, belowTop), granted);
  ctx.blockerBudget.left += granted - cells.length;
  for (const i of cells) {
    ctx.objects[i] = { kind: 'block', mech, ...make() };
  }
  return cells;
}

/**
 * Kleurblok: blokkade met een kleur en 1 of 2 lagen. Alleen aangrenzende matches in die kleur en de
 * hamer raken hem; explosies niet.
 */
export const KLEURBLOK: MechanicModule = {
  id: 'kleurblok',
  place(ctx) {
    const color = randInt(ctx.rng, ctx.kinds);
    const layers = ctx.level >= 14 && ctx.strength >= 1 ? 2 : 1;
    placeBlocks(ctx, scaled(ctx, 3, 0.2, 2, 8), () => ({ layers, color }), 'kleurblok');
  },
  onHit(_ctx, _at, piece, cause) {
    if (piece.kind !== 'block') return true;
    if (cause.kind === 'explosion') return true;
    if (cause.kind === 'match' && cause.group.type !== piece.color) return true;
    return false;
  },
};

/**
 * Hars: laag op een steen. De steen kan wisselen en vallen. Een match haalt alleen de harslaag weg
 * (de steen blijft liggen); explosies hebben geen effect; hamer niveau 2 haalt hars en steen weg.
 * De engine regelt dit in `resolve.ts`, `hits.ts` en `hammer.ts`; dit element plaatst alleen.
 */
export const HARS: MechanicModule = {
  id: 'hars',
  place(ctx) {
    const cells = pickMirrored(ctx, freeCells(ctx), scaled(ctx, 4, 0.3, 2, 12));
    for (const i of cells) {
      ctx.resin[i] = true;
    }
  },
};

/**
 * Schild: blokkade die alleen door een bom, kruis, combinatie of hamer niveau 2 of hoger geraakt
 * wordt. Na die treffer wordt het een rotsblok met 1 laag.
 */
export const SCHILD: MechanicModule = {
  id: 'schild',
  place(ctx) {
    placeBlocks(ctx, scaled(ctx, 2, 0.15, 1, 6), () => ({ layers: 1, color: null }), 'schild');
  },
  onHit(ctx, at, piece, cause) {
    if (piece.kind !== 'block') return true;
    const strong = (cause.kind === 'explosion' && cause.special) || (cause.kind === 'hammer' && cause.level >= 2);
    if (!strong) return true;
    const cell = ctx.s.cells[at.r * ctx.s.cols + at.c];
    cell.piece = { ...piece, mech: 'rotsblok', layers: 1 };
    ctx.ev.push({ type: 'Hit', at, target: 'schild', left: 0 });
    return true;
  },
};

/**
 * Muur: rand tussen twee vakjes. Niet overheen wisselen; stenen vallen niet door een horizontale
 * muur. Matches over een muur heen tellen wel. Onverwoestbaar. Plaatst een paar korte stukken,
 * gespiegeld, nooit in de bovenste twee of onderste rij.
 */
export const MUUR: MechanicModule = {
  id: 'muur',
  place(ctx) {
    const { rows, cols } = ctx;
    const exists = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && ctx.shape[r * cols + c];
    const segments = Math.max(1, Math.min(3, Math.round(ctx.strength * (1 + (ctx.level - 1) / 12))));
    const half = Math.floor(cols / 2);
    for (let k = 0; k < segments; k++) {
      const horizontal = k % 2 === 0;
      const r = 2 + randInt(ctx.rng, Math.max(1, rows - 4));
      const c = randInt(ctx.rng, Math.max(1, half - 1));
      const mirrorC = cols - 1 - c;
      for (const cc of horizontal ? [c, mirrorC] : [c]) {
        if (horizontal) {
          // Muur onder (r, cc).
          if (exists(r, cc) && exists(r + 1, cc)) {
            ctx.walls[r * cols + cc] |= WALL_BOTTOM;
            ctx.walls[(r + 1) * cols + cc] |= WALL_TOP;
          }
        } else if (exists(r, cc) && exists(r, cc + 1)) {
          // Muur rechts van (r, cc), en gespiegeld links van de spiegelkolom.
          ctx.walls[r * cols + cc] |= WALL_RIGHT;
          ctx.walls[r * cols + cc + 1] |= WALL_LEFT;
          const m = cols - 2 - cc;
          if (m !== cc && exists(r, m) && exists(r, m + 1)) {
            ctx.walls[r * cols + m] |= WALL_RIGHT;
            ctx.walls[r * cols + m + 1] |= WALL_LEFT;
          }
        }
      }
    }
  },
};
