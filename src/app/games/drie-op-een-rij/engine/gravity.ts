/**
 * Zwaartekracht en aanvullen.
 *
 * Stenen en valobjecten vallen recht naar beneden. Een stuk staat logisch direct in zijn nieuwe
 * vakje (één eigenaar per vakje); de zichtbare verschuiving (`offR`) loopt in ticks naar 0.
 *
 * Vaste dingen (blokkades, stenen met ketting, horizontale muren, gaten en de bovenrand) houden
 * vallende stenen tegen. Het vakje direct onder zo'n barrière is een spawnpunt: daar komen nieuwe
 * stenen het bord op, uit een eigen deelreeks per spawnpunt.
 *
 * Conflictregel: een stuk dat wisselt, verdwijnt of verschuift, wordt niet door de zwaartekracht
 * verplaatst. De lege vakjes eronder wachten tot het klaar is ("een steen die wisselt maakt zijn
 * wissel af voordat de zwaartekracht hem kan verplaatsen").
 */
import { chance, randInt } from '../rng/rng';
import { MECH } from './config';
import { blocksFall, index, wallBetween } from './board';
import { rngStream, stableMotion, unsettle, type Ctx } from './context';
import type { GameState, Piece, Portal, TilePiece } from './types';

/** Valt een stuk in (r, c) niet naar (r + 1, c)? Bij een muur, een portaalingang of boven een portaaluitgang. */
function stopsBelow(s: GameState, r: number, c: number): boolean {
  return (
    wallBetween(s, { r, c }, { r: r + 1, c }) ||
    s.portals.some((p) => (p.from.r === r && p.from.c === c) || (p.to.r === r + 1 && p.to.c === c))
  );
}

/** Het portaal waarvan dit vakje de uitgang is. */
function portalInto(s: GameState, r: number, c: number): Portal | null {
  return s.portals.find((p) => p.to.r === r && p.to.c === c) ?? null;
}

type Slot = 'barrier' | 'wait' | 'movable' | 'empty';

function classify(piece: Piece | null): Slot {
  if (!piece) {
    return 'empty';
  }
  if (blocksFall(piece)) {
    return 'barrier';
  }
  return piece.m.state === 'stabiel' || piece.m.state === 'vallend' ? 'movable' : 'wait';
}

export function applyGravity(ctx: Ctx): void {
  const { s } = ctx;
  for (let c = 0; c < s.cols; c++) {
    /** Lege vakjes die op een stuk wachten, onderste eerst. */
    let empties: number[] = [];
    for (let r = s.rows - 1; r >= -1; r--) {
      if (r >= 0 && r < s.rows - 1 && stopsBelow(s, r, c)) {
        // Muur of portaal onder dit vakje: het stuk erboven valt er niet doorheen.
        spawnInto(ctx, c, empties);
        empties = [];
      }
      if (r === -1) {
        spawnInto(ctx, c, empties);
        break;
      }
      const cell = s.cells[index(s, r, c)];
      if (!cell.exists) {
        spawnInto(ctx, c, empties);
        empties = [];
        continue;
      }
      const slot = classify(cell.piece);
      if (slot === 'empty') {
        empties.push(r);
      } else if (slot === 'barrier') {
        spawnInto(ctx, c, empties);
        empties = [];
      } else if (slot === 'wait') {
        empties = [];
      } else if (empties.length > 0) {
        const target = empties.shift() as number;
        moveDown(ctx, c, r, target);
        empties.push(r);
      }
    }
  }
}

function moveDown(ctx: Ctx, c: number, from: number, to: number): void {
  const { s } = ctx;
  const source = s.cells[index(s, from, c)];
  const target = s.cells[index(s, to, c)];
  const piece = source.piece as Piece;
  source.piece = null;
  target.piece = piece;
  piece.m.offR -= (to - from) * 1000;
  piece.m.res = target.res || piece.m.res;
  source.res = piece.m.res;
  if (piece.m.state !== 'vallend') {
    piece.m.state = 'vallend';
    ctx.ev.push({ type: 'FallStarted', id: piece.id });
  }
  unsettle(s);
}

/**
 * Portaal: de stukken die in en boven de ingang liggen, vallen door naar de lege vakjes onder de
 * uitgang (onderste eerst). Is de ingang leeg of nog in beweging, dan wacht de uitgang (geeft true).
 * Ligt er iets vasts in de ingang, dan werkt de uitgang als gewoon spawnpunt (geeft false).
 */
function pullThroughPortal(ctx: Ctx, portal: Portal, c: number, empties: number[]): boolean {
  const { s } = ctx;
  const top = Math.min(...empties);
  const sources: number[] = [];
  for (let r = portal.from.r; r >= 0 && sources.length < empties.length; r--) {
    if (r < portal.from.r && stopsBelow(s, r, portal.from.c)) break;
    const cell = s.cells[index(s, r, portal.from.c)];
    if (!cell.exists || !cell.piece) break;
    if (blocksFall(cell.piece)) {
      if (sources.length === 0 && r === portal.from.r) return false;
      break;
    }
    if (cell.piece.m.state !== 'stabiel') break;
    sources.push(r);
  }
  if (sources.length === 0) {
    return true;
  }
  sources.forEach((fromRow, j) => {
    const source = s.cells[index(s, fromRow, portal.from.c)];
    const row = empties[j];
    const target = s.cells[index(s, row, c)];
    const piece = source.piece as Piece;
    source.piece = null;
    source.res = piece.m.res;
    target.piece = piece;
    // Komt bovenin de uitgang tevoorschijn, als een stapel die naar binnen schuift.
    piece.m.offR = (top - 1 - j) * 1000 - row * 1000;
    piece.m.offC = 0;
    piece.m.state = 'vallend';
    ctx.ev.push({ type: 'FallStarted', id: piece.id });
  });
  unsettle(s);
  return true;
}

/**
 * Vult de lege vakjes onder een spawnpunt met nieuwe stenen. Ze komen van boven het bord (of boven
 * de barrière) en vallen allemaal even ver, zodat ze netjes als een stapel naar binnen schuiven.
 */
function spawnInto(ctx: Ctx, c: number, empties: number[]): void {
  if (empties.length === 0) {
    return;
  }
  const { s } = ctx;
  const top = Math.min(...empties);
  const portal = portalInto(s, top, c);
  if (portal) {
    if (pullThroughPortal(ctx, portal, c, empties)) {
      return;
    }
  }
  const rng = rngStream(s, `spawn:${top}:${c}`);
  const goldbags = s.mechanics.includes('goudzakje');
  // Start boven het hoogste stuk dat in deze kolom nog onderweg is, zodat niets overlapt.
  let highest = top * 1000;
  for (let r = top; r < s.rows; r++) {
    const cell = s.cells[index(s, r, c)];
    if (!cell.exists || (cell.piece && blocksFall(cell.piece))) {
      break;
    }
    if (cell.piece) {
      highest = Math.min(highest, r * 1000 + cell.piece.m.offR);
    }
  }
  empties.forEach((row, j) => {
    const cell = s.cells[index(s, row, c)];
    const startRow = highest - 1000 * (j + 1);
    let type = randInt(rng, s.kinds);
    const goldbag = goldbags && chance(rng, MECH.goldbagChance);
    if (goldbag) {
      type = s.kinds;
    }
    const tile: TilePiece = {
      id: s.nextId++,
      kind: 'tile',
      type,
      special: null,
      chain: 0,
      resin: false,
      mech: goldbag ? 'goudzakje' : null,
      counter: 0,
      m: { ...stableMotion(cell.res, s.tick), state: 'vallend', offR: startRow - row * 1000 },
    };
    cell.piece = tile;
    ctx.ev.push({ type: 'Spawned', id: tile.id, at: { r: row, c } });
  });
  unsettle(s);
}
