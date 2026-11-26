import type { RngState } from '../rng/rng';
import { pick, randInt } from '../rng/rng';
import { BOARD } from '../engine/config';
import { buildCells, type CellPlan } from '../engine/create';
import { findMatchGroups, findMoves } from '../engine/matcher';

/**
 * Startbord: vult vakje voor vakje (rij voor rij) en kiest steeds een soort die geen drie op een rij
 * maakt. Daarna moet het bord minstens `BOARD.minStartMoves` geldige zetten hebben; lukt dat niet,
 * dan genereert het deterministisch opnieuw (de deelreeks loopt gewoon door).
 */
export function generateStartTiles(
  rng: RngState,
  plan: Omit<CellPlan, 'tiles'>,
  kinds: number,
): number[] {
  const { rows, cols } = plan;
  const hasTile = (i: number) => plan.shape[i] && plan.objects[i] === null;
  let last: number[] = [];
  for (let attempt = 0; attempt < BOARD.maxAttempts; attempt++) {
    const tiles: number[] = new Array(rows * cols).fill(-1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!hasTile(i)) {
          continue;
        }
        const allowed: number[] = [];
        for (let t = 0; t < kinds; t++) {
          const row = c >= 2 && tiles[i - 1] === t && tiles[i - 2] === t;
          const col = r >= 2 && tiles[i - cols] === t && tiles[i - 2 * cols] === t;
          if (!row && !col) {
            allowed.push(t);
          }
        }
        tiles[i] = allowed.length > 0 ? pick(rng, allowed) : randInt(rng, kinds);
      }
    }
    last = tiles;
    const board = { rows, cols, cells: buildCells({ ...plan, tiles }).cells };
    if (
      findMatchGroups(board).length === 0 &&
      findMoves(board, BOARD.minStartMoves).length >= BOARD.minStartMoves
    ) {
      return tiles;
    }
  }
  return last;
}
