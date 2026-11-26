/**
 * Bordstroom: portaal en lopende band.
 */
import { chance, randInt } from '../../rng/rng';
import { rngStream, stableMotion, type Ctx } from '../context';
import { startShift } from '../settle';
import type { Belt, Piece, Pos } from '../types';
import type { MechanicModule, PlaceContext } from './module';

const isFree = (ctx: PlaceContext, i: number) =>
  ctx.shape[i] && !ctx.objects[i] && ctx.chains[i] === 0 && !ctx.resin[i] && !ctx.reserved[i] && !ctx.marks[i];

/**
 * Portaal: een paar van ingang en uitgang, met hetzelfde cijfer. Wat onderuit de ingang valt, komt
 * bovenin de uitgang weer tevoorschijn (zie `gravity.ts`). Onverwoestbaar; geen object in een vakje.
 * Plaatsing: ingang in de linkerhelft, uitgang lager in de gespiegelde kolom.
 */
export const PORTAAL: MechanicModule = {
  id: 'portaal',
  place(ctx) {
    const { rows, cols } = ctx;
    const pairs = ctx.level >= 20 && ctx.strength >= 1 ? 2 : 1;
    for (let k = 0; k < pairs; k++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const fromR = 1 + randInt(ctx.rng, Math.max(1, Math.floor(rows / 2) - 1));
        const fromC = randInt(ctx.rng, Math.max(1, Math.floor(cols / 2)));
        const toR = fromR + 1 + randInt(ctx.rng, Math.max(1, rows - fromR - 3));
        const toC = cols - 1 - fromC;
        const a = fromR * cols + fromC;
        const b = toR * cols + toC;
        const below = (fromR + 1) * cols + fromC;
        if (toC === fromC || toR >= rows - 1 || !isFree(ctx, a) || !isFree(ctx, b) || !ctx.shape[below]) continue;
        if (!ctx.shape[(toR - 1) * cols + toC]) continue;
        ctx.reserved[a] = true;
        ctx.reserved[b] = true;
        ctx.portals.push({ id: ctx.portals.length + 1, from: { r: fromR, c: fromC }, to: { r: toR, c: toC } });
        break;
      }
    }
  },
};

/**
 * Lopende band: vakjes met pijlen, als lijn (rivier) of als lus. Bij elk beurteinde schuift alles
 * één vakje op. Bij een lijn verdwijnt wat aan het eind af gaat en komt aan het begin een nieuwe
 * steen uit de deelreeks van die band. Op een band liggen nooit stenen met ketting of blokkades.
 */
export const LOPENDE_BAND: MechanicModule = {
  id: 'lopendeBand',
  place(ctx) {
    const { rows, cols } = ctx;
    const loop = ctx.level >= 20 && chance(ctx.rng, 0.5);
    const startRow = 2 + randInt(ctx.rng, Math.max(1, rows - 4));
    for (let k = 0; k < rows - 3; k++) {
      const r = 2 + ((startRow - 2 + k) % Math.max(1, rows - 3));
      let cells: Pos[];
      if (loop) {
        // Lus van 2 rijen hoog en 4 breed, in het midden, met de klok mee.
        if (r + 1 >= rows - 1) continue;
        const c0 = Math.floor(cols / 2) - 2;
        cells = [
          { r, c: c0 },
          { r, c: c0 + 1 },
          { r, c: c0 + 2 },
          { r, c: c0 + 3 },
          { r: r + 1, c: c0 + 3 },
          { r: r + 1, c: c0 + 2 },
          { r: r + 1, c: c0 + 1 },
          { r: r + 1, c: c0 },
        ];
      } else {
        cells = Array.from({ length: cols }, (_, c) => ({ r, c }));
      }
      if (cells.every((p) => isFree(ctx, p.r * cols + p.c))) {
        for (const p of cells) ctx.reserved[p.r * cols + p.c] = true;
        ctx.belts.push({ id: ctx.belts.length + 1, cells, loop });
        return;
      }
    }
  },
  onTurnEnd(ctx, _res, systemRes) {
    for (const belt of ctx.s.belts) {
      moveBelt(ctx, belt, systemRes());
    }
  },
};

function moveBelt(ctx: Ctx, belt: Belt, res: number): void {
  const { s } = ctx;
  const cellOf = (p: Pos) => s.cells[p.r * s.cols + p.c];
  const pieces: (Piece | null)[] = belt.cells.map((p) => cellOf(p).piece);
  // Een vast object (zou niet mogen) houdt de band stil.
  if (pieces.some((piece) => piece?.kind === 'block' || (piece?.kind === 'tile' && piece.chain > 0))) {
    return;
  }
  const n = belt.cells.length;
  const next: (Piece | null)[] = new Array(n).fill(null);
  for (let k = 0; k < n - 1; k++) next[k + 1] = pieces[k];
  if (belt.loop) {
    next[0] = pieces[n - 1];
  } else {
    const last = pieces[n - 1];
    if (last) {
      ctx.ev.push({ type: 'Cleared', id: last.id, at: belt.cells[n - 1] });
    }
    const rng = rngStream(s, `band:${belt.id}`);
    next[0] = {
      id: s.nextId++,
      kind: 'tile',
      type: randInt(rng, s.kinds),
      special: null,
      chain: 0,
      resin: false,
      mech: null,
      counter: 0,
      m: stableMotion(res, s.tick),
    };
  }
  next.forEach((piece, k) => {
    const to = belt.cells[k];
    cellOf(to).piece = piece;
    if (!piece) return;
    const from = belt.loop || k > 0 ? belt.cells[(k - 1 + n) % n] : { r: to.r, c: to.c - 1 };
    piece.m.res = res;
    startShift(ctx, piece, (from.r - to.r) * 1000, (from.c - to.c) * 1000);
  });
}
