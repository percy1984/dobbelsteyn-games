/**
 * Verspreiders: olie, oliebron en goudzakje.
 */
import { randInt } from '../../rng/rng';
import { neighbors, posOf, wallBetween } from '../board';
import { rngStream, stableMotion, type Ctx } from '../context';
import type { BlockPiece } from '../types';
import type { MechanicModule } from './module';
import { freeCells, pickMirrored, scaled, takeBudget } from './place';

const isSource = (piece: unknown): piece is BlockPiece =>
  !!piece &&
  (piece as BlockPiece).kind === 'block' &&
  ((piece as BlockPiece).mech === 'olie' || (piece as BlockPiece).mech === 'oliebron');

/**
 * Verspreidingsregel bij het beurteinde: heeft deze zet geen olie opgeruimd, dan neemt de olie
 * (of een oliebron) één aangrenzend vakje met een vrije steen over. Die steen verdwijnt. Welk vakje
 * dat wordt, kiest de deelreeks "verspreiding".
 */
function spread(ctx: Ctx, res: number): void {
  const { s } = ctx;
  const cleared = s.oilCleared.indexOf(res);
  if (cleared >= 0) {
    s.oilCleared.splice(cleared, 1);
    return;
  }
  const candidates = new Set<number>();
  s.cells.forEach((cell, i) => {
    if (!isSource(cell.piece)) return;
    const at = posOf(s, i);
    for (const p of neighbors(at)) {
      if (p.r < 0 || p.c < 0 || p.r >= s.rows || p.c >= s.cols || wallBetween(s, at, p)) continue;
      const j = p.r * s.cols + p.c;
      const target = s.cells[j];
      const tile = target.piece;
      if (
        target.exists &&
        tile?.kind === 'tile' &&
        tile.m.state === 'stabiel' &&
        tile.chain === 0 &&
        !tile.resin &&
        !tile.special &&
        !tile.mech
      ) {
        candidates.add(j);
      }
    }
  });
  if (candidates.size === 0) return;
  const list = [...candidates].sort((a, b) => a - b);
  const j = list[randInt(rngStream(s, 'verspreiding'), list.length)];
  s.cells[j].piece = {
    id: s.nextId++,
    kind: 'block',
    mech: 'olie',
    layers: 1,
    color: null,
    counter: 0,
    dir: 0,
    tag: 0,
    m: stableMotion(res, s.tick),
  };
  ctx.ev.push({ type: 'Spread', at: posOf(s, j), mech: 'olie' });
}

/** Olie: blokkade met 1 laag. Eén aangrenzende match of explosie haalt hem weg. */
export const OLIE: MechanicModule = {
  id: 'olie',
  place(ctx) {
    const wanted = takeBudget(ctx, scaled(ctx, 3, 0.2, 2, 8));
    const cells = pickMirrored(ctx, freeCells(ctx, (r) => r >= 3), wanted);
    ctx.blockerBudget.left += wanted - cells.length;
    for (const i of cells) {
      ctx.objects[i] = { kind: 'block', mech: 'olie', layers: 1, color: null };
    }
  },
  onHit(ctx, _at, _piece, _cause, res) {
    if (!ctx.s.oilCleared.includes(res)) {
      ctx.s.oilCleared.push(res);
    }
    return false;
  },
  onTurnEnd(ctx, res) {
    spread(ctx, res);
  },
};

/**
 * Oliebron: vast, onverwoestbaar. Telt mee voor de verspreidingsregel, dus ook op een olievrij bord
 * ontstaat nieuwe olie na een zet zonder opgeruimde olie.
 */
export const OLIEBRON: MechanicModule = {
  id: 'oliebron',
  place(ctx) {
    const inner = (r: number, c: number) => r >= 3 && r <= ctx.rows - 2 && c >= 1 && c <= ctx.cols - 2;
    const wanted = takeBudget(ctx, 1);
    const cells = pickMirrored(ctx, freeCells(ctx, inner), wanted);
    ctx.blockerBudget.left += wanted - cells.length;
    for (const i of cells) {
      ctx.objects[i] = { kind: 'block', mech: 'oliebron', layers: 1, color: null };
    }
  },
  onHit() {
    return true;
  },
  onTurnEnd(ctx, res) {
    // Zonder olie in dit level regelt de bron de verspreiding zelf (anders doet de olie het).
    if (!ctx.s.mechanics.includes('olie')) {
      spread(ctx, res);
    }
  },
};

/**
 * Goudzakje: een extra matchbare soort steen (type = aantal soorten) die af en toe uit een
 * spawnpunt komt. Een match van goudzakjes legt goud op de vakjes van die match. Het spawnen staat
 * in `gravity.ts`, het goud leggen in `resolve.ts`.
 */
export const GOUDZAKJE: MechanicModule = {
  id: 'goudzakje',
};
