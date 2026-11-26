/**
 * Stilstand en rustmoment.
 * - Stilstand: geen stuk in beweging, geen leeg vakje en geen match in afwachting.
 * - Bij stilstand eerst de openstaande beurteindes (één per stilstand, in volgorde van de zetten).
 * - Rustmoment: stilstand zonder openstaande beurteindes. Dan pas: uitslag bepalen, controleren of
 *   er nog een zet is (anders schudden) en de invoervergrendeling opheffen.
 */
import { pick, shuffled } from '../rng/rng';
import { BOARD, SCORE, SHUFFLE_ATTEMPTS } from './config';
import { cellAt, isTile, neighbors, posOf } from './board';
import { rngStream, speed, type Ctx } from './context';
import { goalsComplete } from './hits';
import { findMatchGroups, findMoves } from './matcher';
import { moduleFor } from './mechanics';
import { runTurnEnd } from './turn-end';
import type { BoardLike } from './board';
import type { Cell, GameState, Piece, TilePiece } from './types';

export function isStill(s: GameState): boolean {
  return s.cells.every((cell) => !cell.exists || (cell.piece !== null && cell.piece.m.state === 'stabiel'));
}

/** Wordt aan het eind van een tick aangeroepen als het bord stilstaat. */
export function onStill(ctx: Ctx): void {
  const { s } = ctx;
  if (s.result) {
    return;
  }
  if (s.pendingTurnEnds.length > 0) {
    runTurnEnd(ctx, s.pendingTurnEnds.shift() as number);
    return;
  }
  if (!s.settled) {
    s.resolutions = [];
    if (decideResult(ctx)) {
      return;
    }
    if (findMoves(s, 1).length === 0) {
      ctx.ev.push({ type: 'Shuffled' });
      shuffle(ctx);
      return;
    }
    s.settled = true;
    s.locked = false;
    ctx.ev.push({ type: 'Settled' });
  } else if (s.timeUp) {
    decideResult(ctx);
  }
}

/** Bepaalt de uitslag bij een rustmoment. Geeft true als het level voorbij is. */
export function decideResult(ctx: Ctx): boolean {
  const { s } = ctx;
  if (goalsComplete(ctx)) {
    if (s.mode === 'beurten' && s.movesLeft) {
      s.score += s.movesLeft * SCORE.moveLeft;
      ctx.ev.push({ type: 'ScoreAdded', points: s.movesLeft * SCORE.moveLeft, res: 0 });
    }
    finish(ctx, 'gewonnen');
    ctx.ev.push({ type: 'LevelWon' });
    return true;
  }
  const lostTo = s.mechanics.find((id) => moduleFor(id)?.loseCheck?.(s));
  if (lostTo) {
    s.loseReason = lostTo;
  } else if (s.mode === 'beurten' && s.movesLeft === 0) {
    s.loseReason = 'beurten';
  } else if (s.timeUp) {
    s.loseReason = 'tijd';
  } else {
    return false;
  }
  finish(ctx, 'verloren');
  ctx.ev.push({ type: 'LevelLost', reason: s.loseReason });
  return true;
}

function finish(ctx: Ctx, result: 'gewonnen' | 'verloren'): void {
  ctx.s.result = result;
  ctx.s.settled = true;
  ctx.s.locked = true;
}

/** Vrije stenen: stabiel, zonder ketting. Stenen met hars gaan mee met hun laag. */
function freeTiles(s: GameState): { i: number; piece: TilePiece }[] {
  const out: { i: number; piece: TilePiece }[] = [];
  s.cells.forEach((cell, i) => {
    if (cell.exists && isTile(cell.piece) && cell.piece.chain === 0 && cell.piece.m.state === 'stabiel') {
      out.push({ i, piece: cell.piece });
    }
  });
  return out;
}

function withPieces(s: GameState, assign: Map<number, Piece>): BoardLike {
  const cells: Cell[] = s.cells.map((cell, i) => (assign.has(i) ? { ...cell, piece: assign.get(i) ?? null } : cell));
  return { rows: s.rows, cols: s.cols, cells };
}

/**
 * Schudt het bord: alleen vrije stenen verplaatsen; kettingen, blokkades, valobjecten en vaste
 * objecten blijven staan. Levert gegarandeerd minstens één zet en geen directe matches op. Lukt dat
 * niet, dan verwijdert de engine één blokkade (die met de meeste vrije buren) en probeert het daarna
 * opnieuw; zonder blokkades krijgen de stenen nieuwe soorten.
 */
export function shuffle(ctx: Ctx): void {
  const { s } = ctx;
  const rng = rngStream(s, 'schudden');
  const free = freeTiles(s);
  const slots = free.map((f) => f.i);
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    const order = shuffled(rng, free.map((f) => f.piece));
    const assign = new Map<number, Piece>(slots.map((i, k) => [i, order[k]]));
    const board = withPieces(s, assign);
    if (findMatchGroups(board).length === 0 && findMoves(board, 1).length > 0) {
      const from = new Map(free.map((f) => [f.piece.id, f.i]));
      for (const [i, piece] of assign) {
        const old = from.get(piece.id) as number;
        s.cells[i].piece = piece;
        if (old !== i) {
          const a = posOf(s, old);
          const b = posOf(s, i);
          startShift(ctx, piece, (a.r - b.r) * 1000, (a.c - b.c) * 1000);
        }
      }
      return;
    }
  }
  if (removeOneBlocker(ctx)) {
    return;
  }
  recolor(ctx, free.map((f) => f.piece));
}

export function startShift(ctx: Ctx, piece: Piece, baseR: number, baseC: number): void {
  const m = piece.m;
  m.state = 'verschuivend';
  m.timer = speed(ctx.s).shift;
  m.dur = m.timer;
  m.baseR = baseR;
  m.baseC = baseC;
  m.offR = baseR;
  m.offC = baseC;
  ctx.s.settled = false;
}

function removeOneBlocker(ctx: Ctx): boolean {
  const { s } = ctx;
  let best = -1;
  let bestScore = -1;
  s.cells.forEach((cell, i) => {
    if (!cell.exists || cell.piece?.kind !== 'block') {
      return;
    }
    const score = neighbors(posOf(s, i)).filter((p) => {
      const piece = cellAt(s, p.r, p.c)?.piece ?? null;
      return isTile(piece) && piece.chain === 0;
    }).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  if (best < 0) {
    return false;
  }
  const at = posOf(s, best);
  const piece = s.cells[best].piece;
  if (piece && piece.kind === 'block') {
    ctx.ev.push({ type: 'ObjectDestroyed', at, mech: piece.mech });
  }
  s.cells[best].piece = null;
  s.settled = false;
  return true;
}

/** Laatste redmiddel: geef de vrije stenen nieuwe soorten zonder matches en met een zet. */
function recolor(ctx: Ctx, pieces: TilePiece[]): void {
  const { s } = ctx;
  const rng = rngStream(s, 'schudden');
  const kinds = Array.from({ length: s.kinds }, (_, k) => k);
  for (let attempt = 0; attempt < BOARD.maxAttempts; attempt++) {
    for (const piece of pieces) {
      piece.type = pick(rng, kinds);
    }
    if (findMatchGroups(s).length === 0 && findMoves(s, 1).length > 0) {
      break;
    }
  }
  for (const piece of pieces) {
    piece.m.state = 'verschijnend';
    piece.m.timer = speed(s).shift;
    piece.m.dur = piece.m.timer;
    piece.m.baseR = 0;
    piece.m.baseC = 0;
  }
  s.settled = false;
}
