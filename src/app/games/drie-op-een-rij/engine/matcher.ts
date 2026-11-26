import {
  cellAt,
  index,
  isAdjacent,
  isStable,
  isSwappable,
  isTile,
  matchTypeOf,
  wallBetween,
  type BoardLike,
} from './board';
import type { Pos } from './types';

/** Eén match: aaneengesloten rijen of kolommen van drie of meer gelijke stenen die een steen delen. */
export interface MatchGroup {
  /** Vakjes in de match, op rij en daarna op kolom gesorteerd. */
  readonly cells: Pos[];
  readonly type: number;
  /** Langste rij of kolom in de match. */
  readonly longest: number;
  /** Bevat zowel een rij als een kolom (L- of T-vorm). */
  readonly crossed: boolean;
}

type TypeAt = (r: number, c: number) => number;

/** Type van een stabiele, matchbare steen, of -1. Matches worden alleen onder stabiele stenen gezocht. */
export function stableTypeAt(b: BoardLike): TypeAt {
  return (r, c) => {
    const piece = cellAt(b, r, c)?.piece ?? null;
    return isStable(piece) ? matchTypeOf(piece) : -1;
  };
}

/** Alle matches op het bord, alleen onder stabiele stenen. Muren tellen niet: een match over een muur heen telt wel. */
export function findMatchGroups(b: BoardLike, typeAt: TypeAt = stableTypeAt(b)): MatchGroup[] {
  const parent = new Map<number, number>();
  const find = (i: number): number => {
    let root = i;
    while (parent.get(root) !== root) {
      root = parent.get(root) as number;
    }
    parent.set(i, root);
    return root;
  };
  const union = (a: number, c: number) => {
    const ra = find(a);
    const rc = find(c);
    if (ra !== rc) {
      parent.set(Math.max(ra, rc), Math.min(ra, rc));
    }
  };
  const runLength = new Map<number, number>();
  const horizontal = new Set<number>();
  const vertical = new Set<number>();

  const addRun = (cells: number[], dir: Set<number>) => {
    for (const i of cells) {
      if (!parent.has(i)) {
        parent.set(i, i);
      }
      runLength.set(i, Math.max(runLength.get(i) ?? 0, cells.length));
      dir.add(i);
    }
    for (let k = 1; k < cells.length; k++) {
      union(cells[0], cells[k]);
    }
  };

  for (let r = 0; r < b.rows; r++) {
    scanLine(b.cols, (k) => typeAt(r, k), (from, to) => {
      addRun(range(from, to).map((k) => index(b, r, k)), horizontal);
    });
  }
  for (let c = 0; c < b.cols; c++) {
    scanLine(b.rows, (k) => typeAt(k, c), (from, to) => {
      addRun(range(from, to).map((k) => index(b, k, c)), vertical);
    });
  }

  const groups = new Map<number, number[]>();
  for (const i of [...parent.keys()].sort((a, c) => a - c)) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }
  return [...groups.values()]
    .map((cells) => {
      const positions = cells.map((i) => ({ r: Math.floor(i / b.cols), c: i % b.cols }));
      return {
        cells: positions,
        type: typeAt(positions[0].r, positions[0].c),
        longest: Math.max(...cells.map((i) => runLength.get(i) ?? 0)),
        crossed: cells.some((i) => horizontal.has(i)) && cells.some((i) => vertical.has(i)),
      };
    })
    .sort((a, c) => a.cells[0].r - c.cells[0].r || a.cells[0].c - c.cells[0].c);
}

function scanLine(length: number, typeAt: (k: number) => number, onRun: (from: number, to: number) => void) {
  let start = 0;
  for (let k = 1; k <= length; k++) {
    const current = typeAt(start);
    if (k < length && current >= 0 && typeAt(k) === current) {
      continue;
    }
    if (current >= 0 && k - start >= 3) {
      onRun(start, k - 1);
    }
    start = k;
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let k = from; k <= to; k++) {
    out.push(k);
  }
  return out;
}

/** Lengte van de rij en kolom door (r, c) met hetzelfde type. */
function linesThrough(typeAt: TypeAt, rows: number, cols: number, r: number, c: number): number {
  const type = typeAt(r, c);
  if (type < 0) {
    return 0;
  }
  let h = 1;
  for (let k = c - 1; k >= 0 && typeAt(r, k) === type; k--) h++;
  for (let k = c + 1; k < cols && typeAt(r, k) === type; k++) h++;
  let v = 1;
  for (let k = r - 1; k >= 0 && typeAt(k, c) === type; k--) v++;
  for (let k = r + 1; k < rows && typeAt(k, c) === type; k++) v++;
  return Math.max(h, v);
}

/** Matcht er iets op (r, c) of (r2, c2) als de stenen op a en b gewisseld zouden zijn? Alleen stabiele stenen tellen. */
export function swapMakesMatch(b: BoardLike, a: Pos, p: Pos): boolean {
  const base = stableTypeAt(b);
  const typeAt: TypeAt = (r, c) => {
    if (r === a.r && c === a.c) return base(p.r, p.c);
    if (r === p.r && c === p.c) return base(a.r, a.c);
    return base(r, c);
  };
  return (
    linesThrough(typeAt, b.rows, b.cols, a.r, a.c) >= 3 ||
    linesThrough(typeAt, b.rows, b.cols, p.r, p.c) >= 3
  );
}

/**
 * Is deze wissel een geldige zet? Kijkt alleen naar stenen die nu stabiel zijn: een match die pas
 * later zou ontstaan doordat er stenen naast landen, telt niet.
 * Geldig is: er ontstaat direct een match, of een kleurenster wordt met een steen gewisseld, of twee
 * speciale stenen worden met elkaar gewisseld (combinatie).
 */
export function isValidSwap(b: BoardLike, a: Pos, p: Pos): boolean {
  const ca = cellAt(b, a.r, a.c);
  const cp = cellAt(b, p.r, p.c);
  if (!ca || !cp || !isAdjacent(a, p) || wallBetween(b, a, p)) {
    return false;
  }
  const pa = ca.piece;
  const pp = cp.piece;
  if (!isSwappable(pa) || !isSwappable(pp) || !isStable(pa) || !isStable(pp)) {
    return false;
  }
  if (isTile(pa) && isTile(pp)) {
    if (pa.special === 'ster' || pp.special === 'ster') {
      return true;
    }
    if (pa.special && pp.special) {
      return true;
    }
  }
  return swapMakesMatch(b, a, p);
}

export interface Move {
  readonly a: Pos;
  readonly b: Pos;
}

/**
 * Alle geldige zetten in vaste volgorde (rij, kolom; eerst rechts, dan onder). Gebruikt geen random
 * generator, zodat de hint altijd dezelfde is.
 */
export function findMoves(b: BoardLike, limit = Number.POSITIVE_INFINITY): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < b.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      for (const p of [
        { r, c: c + 1 },
        { r: r + 1, c },
      ]) {
        if (isValidSwap(b, { r, c }, p)) {
          moves.push({ a: { r, c }, b: p });
          if (moves.length >= limit) {
            return moves;
          }
        }
      }
    }
  }
  return moves;
}

/** De hint: de eerste geldige zet, of null. */
export function findHint(b: BoardLike): Move | null {
  return findMoves(b, 1)[0] ?? null;
}
