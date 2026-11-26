/**
 * Hulpobjecten uit de uitbreiding: stekelbol, pers en waterklok. Alle drie zijn vast, onverwoestbaar
 * en hebben een kleur; alleen aangrenzende matches in hun kleur doen iets.
 */
import { randInt } from '../../rng/rng';
import { MECH } from '../config';
import type { Ctx } from '../context';
import { clearType, explode, lines } from '../hits';
import type { BlockPiece, MechanicId, Pos } from '../types';
import type { HitCause, MechanicModule, PlaceContext } from './module';
import { freeCells, pickMirrored, takeBudget } from './place';

function placeHelpers(ctx: PlaceContext, mech: MechanicId, count: number, dir: () => number): void {
  const inner = (r: number, c: number) => r >= 2 && r <= ctx.rows - 2 && c >= 1 && c <= ctx.cols - 2;
  const granted = takeBudget(ctx, count);
  const cells = pickMirrored(ctx, freeCells(ctx, inner), granted);
  ctx.blockerBudget.left += granted - cells.length;
  for (const i of cells) {
    ctx.objects[i] = { kind: 'block', mech, layers: 1, color: randInt(ctx.rng, ctx.kinds), dir: dir() };
  }
}

function eachOf(ctx: Ctx, mech: MechanicId, fn: (piece: BlockPiece, at: Pos) => void): void {
  const { s } = ctx;
  s.cells.forEach((cell, i) => {
    const piece = cell.piece;
    if (piece?.kind === 'block' && piece.mech === mech) {
      fn(piece, { r: Math.floor(i / s.cols), c: i % s.cols });
    }
  });
}

const matchInColor = (piece: BlockPiece, cause: HitCause) => cause.kind === 'match' && cause.group.type === piece.color;

/**
 * Stekelbol: een aangrenzende match in zijn kleur geeft direct een explosie op de hele rij (dir 0)
 * of kolom (dir 1). Bij elk beurteinde draait de richting om. Gaat hooguit één keer per zet af
 * (`tag` onthoudt de zet).
 */
export const STEKELBOL: MechanicModule = {
  id: 'stekelbol',
  place(ctx) {
    placeHelpers(ctx, 'stekelbol', ctx.level >= 20 ? 2 : 1, () => randInt(ctx.rng, 2));
  },
  onHit(ctx, at, piece, cause, res) {
    if (piece.kind !== 'block' || !matchInColor(piece, cause) || piece.tag === res) return true;
    piece.tag = res;
    ctx.ev.push({ type: 'Hit', at, target: 'stekelbol', left: 1 });
    explode(ctx, piece.dir === 0 ? lines(ctx, [at.r], []) : lines(ctx, [], [at.c]), res, {
      kind: 'explosion',
      special: false,
    });
    return true;
  },
  onTurnEnd(ctx) {
    eachOf(ctx, 'stekelbol', (piece) => {
      piece.dir = piece.dir === 0 ? 1 : 0;
    });
  },
};

/**
 * Pers: aangrenzende matches in zijn kleur vullen de meter met het aantal stenen. Vol: bij het
 * beurteinde verdwijnen alle stenen van die kleur en begint de meter opnieuw.
 */
export const PERS: MechanicModule = {
  id: 'pers',
  place(ctx) {
    placeHelpers(ctx, 'pers', 1, () => 0);
  },
  onHit(ctx, at, piece, cause) {
    if (piece.kind === 'block' && matchInColor(piece, cause) && cause.kind === 'match') {
      piece.counter = Math.min(MECH.persCapacity, piece.counter + cause.group.cells.length);
      ctx.ev.push({ type: 'Hit', at, target: 'pers', left: MECH.persCapacity - piece.counter });
    }
    return true;
  },
  onTurnEnd(ctx, _res, systemRes) {
    eachOf(ctx, 'pers', (piece) => {
      if (piece.counter >= MECH.persCapacity && piece.color !== null) {
        piece.counter = 0;
        clearType(ctx, piece.color, systemRes());
      }
    });
  },
};

const DIRS: readonly Pos[] = [
  { r: -1, c: 0 },
  { r: 0, c: 1 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
];

/**
 * Waterklok: aangrenzende matches in zijn kleur vullen de meter. Vol: bij het beurteinde krijgen de
 * eerste drie stenen in de uitloop-richting (`dir`: 0 boven, 1 rechts, 2 onder, 3 links) zijn kleur.
 * Matches die daardoor ontstaan, zijn cascades van een systeemreeks.
 */
export const WATERKLOK: MechanicModule = {
  id: 'waterklok',
  place(ctx) {
    placeHelpers(ctx, 'waterklok', 1, () => randInt(ctx.rng, 4));
  },
  onHit(ctx, at, piece, cause) {
    if (piece.kind === 'block' && matchInColor(piece, cause) && cause.kind === 'match') {
      piece.counter = Math.min(MECH.waterklokCapacity, piece.counter + cause.group.cells.length);
      ctx.ev.push({ type: 'Hit', at, target: 'waterklok', left: MECH.waterklokCapacity - piece.counter });
    }
    return true;
  },
  onTurnEnd(ctx, _res, systemRes) {
    const { s } = ctx;
    eachOf(ctx, 'waterklok', (piece, at) => {
      if (piece.counter < MECH.waterklokCapacity || piece.color === null) return;
      piece.counter = 0;
      const d = DIRS[piece.dir % 4];
      let done = 0;
      for (let k = 1; done < MECH.waterklokSpout; k++) {
        const r = at.r + d.r * k;
        const c = at.c + d.c * k;
        if (r < 0 || c < 0 || r >= s.rows || c >= s.cols) break;
        const cell = s.cells[r * s.cols + c];
        if (!cell.exists) break;
        const tile = cell.piece;
        if (tile?.kind !== 'tile' || tile.special === 'ster' || tile.mech === 'goudzakje') continue;
        tile.type = piece.color;
        tile.m.res = systemRes();
        tile.m.movedAt = s.tick;
        ctx.ev.push({ type: 'Spread', at: { r, c }, mech: 'waterklok' });
        done++;
      }
    });
  },
};
