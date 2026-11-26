import {
  WALL_BOTTOM,
  WALL_LEFT,
  WALL_RIGHT,
  WALL_TOP,
  type Cell,
  type Piece,
  type Pos,
  type TilePiece,
} from './types';

/** Alles wat bordfuncties nodig hebben; zowel een GameState als een bord in opbouw voldoet. */
export interface BoardLike {
  readonly rows: number;
  readonly cols: number;
  readonly cells: readonly Cell[];
}

export function index(b: BoardLike, r: number, c: number): number {
  return r * b.cols + c;
}

export function inBounds(b: BoardLike, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < b.rows && c < b.cols;
}

/** Het vakje, of null buiten het bord of in een gat. */
export function cellAt(b: BoardLike, r: number, c: number): Cell | null {
  if (!inBounds(b, r, c)) {
    return null;
  }
  const cell = b.cells[index(b, r, c)];
  return cell.exists ? cell : null;
}

export function pieceAt(b: BoardLike, r: number, c: number): Piece | null {
  return cellAt(b, r, c)?.piece ?? null;
}

export function posOf(b: BoardLike, i: number): Pos {
  return { r: Math.floor(i / b.cols), c: i % b.cols };
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.r === b.r && a.c === b.c;
}

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/** De vier aangrenzende posities (boven, rechts, onder, links), ook buiten het bord. */
export function neighbors(p: Pos): Pos[] {
  return [
    { r: p.r - 1, c: p.c },
    { r: p.r, c: p.c + 1 },
    { r: p.r + 1, c: p.c },
    { r: p.r, c: p.c - 1 },
  ];
}

/** De acht omliggende posities (diagonaal telt mee). */
export function ring(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr !== 0 || dc !== 0) {
        out.push({ r: p.r + dr, c: p.c + dc });
      }
    }
  }
  return out;
}

/** Staat er een muur tussen twee aangrenzende vakjes? */
export function wallBetween(b: BoardLike, a: Pos, p: Pos): boolean {
  const ca = inBounds(b, a.r, a.c) ? b.cells[index(b, a.r, a.c)] : null;
  const cp = inBounds(b, p.r, p.c) ? b.cells[index(b, p.r, p.c)] : null;
  if (!ca || !cp) {
    return false;
  }
  if (p.r === a.r + 1) {
    return (ca.walls & WALL_BOTTOM) !== 0 || (cp.walls & WALL_TOP) !== 0;
  }
  if (p.r === a.r - 1) {
    return (ca.walls & WALL_TOP) !== 0 || (cp.walls & WALL_BOTTOM) !== 0;
  }
  if (p.c === a.c + 1) {
    return (ca.walls & WALL_RIGHT) !== 0 || (cp.walls & WALL_LEFT) !== 0;
  }
  if (p.c === a.c - 1) {
    return (ca.walls & WALL_LEFT) !== 0 || (cp.walls & WALL_RIGHT) !== 0;
  }
  return false;
}

export function isTile(piece: Piece | null): piece is TilePiece {
  return piece?.kind === 'tile';
}

/** Vaste dingen houden vallende stenen tegen: blokkades, grote blokken, stenen met ketting, reizigers. */
export function blocksFall(piece: Piece): boolean {
  if (piece.kind === 'block') {
    return true;
  }
  return piece.kind === 'tile' && piece.chain > 0;
}

/** Kan dit stuk in principe gewisseld worden (los van zijn toestand)? */
export function isSwappable(piece: Piece | null): piece is Piece {
  if (!piece || piece.kind === 'block') {
    return false;
  }
  return !(piece.kind === 'tile' && piece.chain > 0);
}

export function isStable(piece: Piece | null): boolean {
  return piece !== null && piece.m.state === 'stabiel';
}

/**
 * Het type waarmee een steen matcht, of -1. Een kleurenster matcht niet op kleur; die werkt alleen
 * door hem te wisselen.
 */
export function matchTypeOf(piece: Piece | null): number {
  if (!isTile(piece) || piece.special === 'ster') {
    return -1;
  }
  return piece.type;
}
