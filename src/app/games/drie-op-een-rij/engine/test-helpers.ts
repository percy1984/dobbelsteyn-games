/**
 * Hulpjes voor tests: een bord uit tekst bouwen. Elk teken is één vakje:
 * - `0`..`6`: steen van dat type
 * - `#`: rotsblok (1 laag)
 * - `.`: leeg vakje
 * - ` ` (spatie) of `x`: gat in de bordvorm
 * Hoofdletters `A`..`G` zijn stenen 0..6 met een ketting.
 * `*` amulet, `~` veer, `m` muntblok, `a`..`g` altaar in kleur 0..6.
 */
import { buildCells } from './create';
import type { EngineOptions, GameMode, GameState, MechanicId, PlacedObject } from './types';

export const LOCKED: EngineOptions = { input: 'locked', speed: 'snel', pauseTimeDuringResolution: false };
export const UNLOCKED: EngineOptions = { input: 'unlocked', speed: 'snel', pauseTimeDuringResolution: false };

export interface BoardOptions {
  readonly options?: EngineOptions;
  readonly mode?: GameMode;
  readonly kinds?: number;
  readonly floors?: readonly string[];
  readonly movesLeft?: number | null;
  readonly seed?: string;
  readonly mechanics?: readonly MechanicId[];
  readonly goals?: GameState['goals'];
}

function objectFor(ch: string): PlacedObject | null {
  if (ch === '#') return { kind: 'block', mech: 'rotsblok', layers: 1, color: null };
  if (ch === 'm') return { kind: 'block', mech: 'muntblok', layers: 1, color: null };
  if (ch === '*') return { kind: 'fall', mech: 'amulet' };
  if (ch === '~') return { kind: 'fall', mech: 'veer' };
  if (/[a-g]/.test(ch)) return { kind: 'block', mech: 'altaar', layers: 1, color: ch.charCodeAt(0) - 97 };
  return null;
}

export function boardFromText(rowsText: readonly string[], opts: BoardOptions = {}): GameState {
  const rows = rowsText.length;
  const cols = rowsText[0].length;
  const size = rows * cols;
  const shape: boolean[] = [];
  const tiles: number[] = [];
  const chains: number[] = [];
  const objects: (PlacedObject | null)[] = [];
  const floors: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = rowsText[r][c];
      shape.push(ch !== ' ' && ch !== 'x');
      objects.push(objectFor(ch));
      if (/[0-6]/.test(ch)) {
        tiles.push(Number(ch));
        chains.push(0);
      } else if (/[A-G]/.test(ch)) {
        tiles.push(ch.charCodeAt(0) - 65);
        chains.push(1);
      } else {
        tiles.push(-1);
        chains.push(0);
      }
      floors.push(Number(opts.floors?.[r]?.[c] ?? '0') || 0);
    }
  }
  const { cells, nextId } = buildCells({
    rows,
    cols,
    shape,
    floors,
    treasure: new Array<number>(size).fill(-1),
    walls: new Array<number>(size).fill(0),
    objects,
    chains,
    resin: new Array<boolean>(size).fill(false),
    tiles,
  });
  const mode = opts.mode ?? 'beurten';
  const floorCount = floors.filter((f) => f > 0).length;
  return {
    rows,
    cols,
    kinds: opts.kinds ?? 5,
    mode,
    options: opts.options ?? LOCKED,
    seed: opts.seed ?? 'test',
    mechanics: opts.mechanics ?? ['goud'],
    tick: 0,
    nextId,
    cells,
    rng: {},
    resolutions: [],
    nextRes: 1,
    pendingTurnEnds: [],
    locked: false,
    settled: true,
    score: 0,
    movesLeft: mode === 'beurten' ? (opts.movesLeft === undefined ? 20 : opts.movesLeft) : null,
    ticksLeft: null,
    timeUp: false,
    goals: opts.goals ?? (floorCount > 0 ? [{ kind: 'goud', target: floorCount, done: 0 }] : []),
    result: null,
    loseReason: null,
    moves: 0,
  };
}

/** Het bord als tekst (types, `#` voor blokkades, `.` leeg), handig voor verwachtingen. */
export function boardToText(s: GameState): string[] {
  const out: string[] = [];
  for (let r = 0; r < s.rows; r++) {
    let line = '';
    for (let c = 0; c < s.cols; c++) {
      const cell = s.cells[r * s.cols + c];
      const piece = cell.piece;
      if (!cell.exists) line += ' ';
      else if (!piece) line += '.';
      else if (piece.kind === 'block') line += '#';
      else if (piece.kind === 'fall') line += '*';
      else line += piece.chain > 0 ? String.fromCharCode(65 + piece.type) : String(piece.type);
    }
    out.push(line);
  }
  return out;
}
