/**
 * Verliesmechanieken: tijdbom en klimmer. Standaard uit en automatisch uit in de modus Ontspannen.
 * Beide zijn gewone, matchbare stenen met een spelelement erop (`TilePiece.mech`).
 */
import { MECH } from '../config';
import { wallBetween } from '../board';
import { startShift } from '../settle';
import type { GameState, Pos, TilePiece } from '../types';
import type { MechanicModule } from './module';
import { freeCells, pickMirrored } from './place';

function tilesWith(s: GameState, mech: 'tijdbom' | 'klimmer'): { piece: TilePiece; at: Pos }[] {
  const out: { piece: TilePiece; at: Pos }[] = [];
  s.cells.forEach((cell, i) => {
    const piece = cell.piece;
    if (cell.exists && piece?.kind === 'tile' && piece.mech === mech) {
      out.push({ piece, at: { r: Math.floor(i / s.cols), c: i % s.cols } });
    }
  });
  return out;
}

/**
 * Tijdbom: een steen met een teller. Bij elk beurteinde gaat de teller 1 omlaag. Haal hem weg met een
 * match of explosie voordat hij op 0 staat, anders is het level verloren.
 */
export const TIJDBOM: MechanicModule = {
  id: 'tijdbom',
  place(ctx) {
    const count = ctx.level >= 30 && ctx.strength >= 1 ? 2 : 1;
    const counter = Math.max(6, Math.round(MECH.tijdbomStart / ctx.strength));
    for (const i of pickMirrored(ctx, freeCells(ctx, (r) => r >= 1), count)) {
      ctx.marks[i] = { mech: 'tijdbom', counter };
    }
  },
  onTurnEnd(ctx) {
    for (const { piece, at } of tilesWith(ctx.s, 'tijdbom')) {
      piece.counter = Math.max(0, piece.counter - 1);
      ctx.ev.push({ type: 'Hit', at, target: 'tijdbom', left: piece.counter });
    }
  },
  loseCheck(s) {
    return tilesWith(s, 'tijdbom').some(({ piece }) => piece.counter <= 0);
  },
};

/** Bovenste bestaande vakje van de kolom bereikt? */
function atTop(s: GameState, at: Pos): boolean {
  for (let r = at.r - 1; r >= 0; r--) {
    if (s.cells[r * s.cols + at.c].exists) return false;
  }
  return true;
}

/**
 * Klimmer: een matchbare steen die bij elk beurteinde één vakje omhoog klimt door te ruilen met de
 * steen erboven. Ligt er iets vasts boven (blokkade, ketting, muur), dan wacht hij. Vang hem door
 * hem te matchen of op te blazen. Bereikt hij de bovenste rij, dan is het level verloren.
 * Doel: alle klimmers vangen.
 */
export const KLIMMER: MechanicModule = {
  id: 'klimmer',
  place(ctx) {
    const count = ctx.level >= 30 && ctx.strength >= 1 ? 2 : 1;
    const cells = pickMirrored(ctx, freeCells(ctx, (r) => r === ctx.rows - 1), count);
    for (const i of cells) {
      ctx.marks[i] = { mech: 'klimmer', counter: 0 };
    }
    if (cells.length > 0) {
      ctx.goals.push({ kind: 'klimmer', target: cells.length });
    }
  },
  onTurnEnd(ctx, _res, systemRes) {
    const { s } = ctx;
    // Van boven naar beneden, zodat twee klimmers onder elkaar niet in één beurt dubbel klimmen.
    for (const { piece, at } of tilesWith(s, 'klimmer')) {
      if (atTop(s, at)) continue;
      const up = { r: at.r - 1, c: at.c };
      const above = s.cells[up.r * s.cols + up.c];
      const other = above.piece;
      if (!above.exists || !other || other.kind === 'block' || wallBetween(s, at, up)) continue;
      if (other.kind === 'tile' && (other.chain > 0 || other.mech === 'klimmer')) continue;
      s.cells[at.r * s.cols + at.c].piece = other;
      above.piece = piece;
      const res = systemRes();
      piece.m.res = res;
      other.m.res = res;
      startShift(ctx, piece, 1000, 0);
      startShift(ctx, other, -1000, 0);
      ctx.ev.push({ type: 'Hit', at: up, target: 'klimmer', left: up.r });
    }
  },
  loseCheck(s) {
    return tilesWith(s, 'klimmer').some(({ at }) => atTop(s, at));
  },
};
