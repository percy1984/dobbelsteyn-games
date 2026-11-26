/**
 * De hamer. Een hamerslag is een actie, geen zet: hij kost geen beurt en heeft geen beurteinde.
 * - Niveau 1: werkt als een explosie op één vakje.
 * - Niveau 2: haalt alles in één vakje weg: steen (ook met ketting of hars), bodemlaag en een
 *   blokkade volledig. Onverwoestbare objecten (zoals het altaar) blijven.
 * - Niveau 3: kies een steen; alle stenen van die soort verdwijnen, de bodemlagen eronder worden één
 *   keer geraakt.
 * Locked: alleen bij een rustmoment. Unlocked: niveau 1 en 2 ook tijdens een afhandeling, op een
 * stabiele steen of een blokkade; niveau 3 alleen bij een rustmoment.
 */
import { cellAt, isTile } from './board';
import { newResolution, type Ctx } from './context';
import { clearTile, clearType, explode, hitFloor, hitObject } from './hits';
import { hammerLevel } from './specials';
import { isStill } from './settle';
import type { GameState, Pos, RejectReason } from './types';

/** Waarom deze hamerslag niet kan, of null als hij mag. */
export function hammerProblem(s: GameState, level: 1 | 2 | 3, at: Pos): RejectReason | null {
  if (level < 1 || level > hammerLevel(s.hammer)) {
    return 'not-available';
  }
  const cell = cellAt(s, at.r, at.c);
  if (!cell) {
    return 'invalid-target';
  }
  if (level === 3 && !(s.settled && isStill(s))) {
    return 'input-locked';
  }
  const piece = cell.piece;
  if (!piece) {
    return 'tile-not-stable';
  }
  if (level === 3 && (!isTile(piece) || piece.special === 'ster')) {
    return 'invalid-target';
  }
  if (piece.m.state !== 'stabiel') {
    return 'tile-not-stable';
  }
  return null;
}

export function strikeHammer(ctx: Ctx, level: 1 | 2 | 3, at: Pos): number {
  const { s } = ctx;
  const res = newResolution(s, 'systeem').id;
  s.hammer = 0;
  ctx.ev.push({ type: 'HammerUsed', level, at, res });
  const cell = cellAt(s, at.r, at.c);
  const piece = cell?.piece ?? null;
  if (level === 1) {
    explode(ctx, [at], res, { kind: 'hammer', level: 1 });
  } else if (level === 2) {
    while (cell && cell.floor > 0) {
      hitFloor(ctx, at, res);
    }
    if (isTile(piece)) {
      piece.chain = 0;
      piece.resin = false;
      clearTile(ctx, at, piece, res);
    } else if (piece) {
      hitObject(ctx, at, { kind: 'hammer', level: 2 }, res);
    }
  } else if (isTile(piece)) {
    clearType(ctx, piece.type, res);
  }
  s.settled = false;
  if (s.options.input === 'locked') {
    s.locked = true;
  }
  return res;
}
