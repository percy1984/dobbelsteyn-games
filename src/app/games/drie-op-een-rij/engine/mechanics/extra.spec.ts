import { generateLevel } from '../../level/level-generator';
import { applyAction } from '../apply-action';
import { createGame } from '../create';
import { findMatchGroups, findMoves } from '../matcher';
import { runUntilSettled } from '../step';
import { boardFromText, LOCKED } from '../test-helpers';
import {
  WALL_BOTTOM,
  WALL_TOP,
  type BlockPiece,
  type GameAction,
  type GameEvent,
  type GameState,
  type LevelParams,
  type MechanicId,
  type TilePiece,
} from '../types';
import { stableMotion } from '../context';

/** Zoals in mechanics.spec: zet A maakt 0 0 0 op de onderste rij (kolom 0-2). */
export const MOVE_A: GameAction = { type: 'swap', a: { r: 3, c: 2 }, b: { r: 4, c: 2 } };
export const rows = (row3: string) => ['123x41', '234x02', '342x13', row3, '001x32'];

export function play(state: GameState, action: GameAction = MOVE_A): { state: GameState; events: GameEvent[] } {
  const out = applyAction(state, action);
  expect(out.result.kind).toBe('accepted');
  const settled = runUntilSettled(out.state);
  return { state: settled.state, events: [...out.events, ...settled.events] };
}

/** Zet een vast object in een vakje. */
export function putBlock(
  s: GameState,
  r: number,
  c: number,
  mech: MechanicId,
  extra: Partial<Pick<BlockPiece, 'layers' | 'color' | 'counter' | 'dir' | 'tag'>> = {},
): void {
  s.cells[r * s.cols + c].piece = {
    id: s.nextId++,
    kind: 'block',
    mech,
    layers: 1,
    color: null,
    counter: 0,
    dir: 0,
    tag: 0,
    ...extra,
    m: stableMotion(),
  };
}

export function tileAt(s: GameState, r: number, c: number): TilePiece {
  const piece = s.cells[r * s.cols + c].piece;
  if (piece?.kind !== 'tile') throw new Error(`geen steen op ${r},${c}`);
  return piece;
}

export const pieceAt = (s: GameState, r: number, c: number) => s.cells[r * s.cols + c].piece;

const hits = (events: GameEvent[], target: string) => events.filter((e) => e.type === 'Hit' && e.target === target);

describe('blokkades en lagen (uitbreiding)', () => {
  it('kleurblok: een match ernaast in zijn kleur raakt hem', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'kleurblok'] });
    putBlock(s, 3, 0, 'kleurblok', { color: 0 });
    const { events } = play(s);
    expect(events).toContainEqual({ type: 'ObjectDestroyed', at: { r: 3, c: 0 }, mech: 'kleurblok' });
  });

  it('kleurblok: een match in een andere kleur of een explosie doet niets', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'kleurblok'] });
    putBlock(s, 3, 0, 'kleurblok', { color: 4 });
    const { state, events } = play(s);
    expect(hits(events, 'kleurblok')).toHaveLength(0);
    expect(pieceAt(state, 3, 0)?.kind).toBe('block');

    const t = boardFromText(rows('#10x23'), { mechanics: ['goud', 'kleurblok'] });
    putBlock(t, 3, 0, 'kleurblok', { color: 4 });
    tileAt(t, 4, 1).special = 'bom';
    const boom = play(t);
    expect(boom.events.some((e) => e.type === 'Explosion')).toBe(true);
    expect(pieceAt(boom.state, 3, 0)?.kind).toBe('block');
  });

  it('kleurblok: de hamer niveau 1 raakt hem wel', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'kleurblok'] });
    putBlock(s, 3, 0, 'kleurblok', { color: 4, layers: 2 });
    s.hammer = 60;
    const out = applyAction(s, { type: 'hammer', level: 1, at: { r: 3, c: 0 } });
    expect(out.result.kind).toBe('accepted');
    const block = pieceAt(out.state, 3, 0);
    expect(block?.kind === 'block' && block.layers).toBe(1);
  });

  it('hars: een match haalt alleen de harslaag weg, de steen blijft liggen', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'hars'] });
    const resinTile = tileAt(s, 4, 0);
    resinTile.resin = true;
    const { state, events } = play(s);
    expect(hits(events, 'hars')).toHaveLength(1);
    // De steen bleef liggen (zelfde id) en heeft geen hars meer.
    const after = state.cells.find((cell) => cell.piece?.id === resinTile.id)?.piece;
    expect(after?.kind === 'tile' && after.resin).toBe(false);
  });

  it('hars: een explosie heeft geen effect', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'hars'] });
    const target = tileAt(s, 2, 0);
    target.resin = true;
    tileAt(s, 4, 1).special = 'kruis';
    const { state } = play(s);
    const after = state.cells.find((cell) => cell.piece?.id === target.id)?.piece;
    expect(after?.kind === 'tile' && after.resin).toBe(true);
  });

  it('schild: een gewone match doet niets, een bom maakt er een rotsblok van', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'schild'] });
    putBlock(s, 3, 0, 'schild');
    const plain = play(s);
    expect(pieceAt(plain.state, 3, 0)?.kind === 'block' && (pieceAt(plain.state, 3, 0) as BlockPiece).mech).toBe('schild');

    const t = boardFromText(rows('#10x23'), { mechanics: ['goud', 'schild'] });
    putBlock(t, 3, 0, 'schild');
    tileAt(t, 4, 1).special = 'bom';
    const { events } = play(t);
    expect(hits(events, 'schild')).toHaveLength(1);
    expect(events).not.toContainEqual({ type: 'ObjectDestroyed', at: { r: 3, c: 0 }, mech: 'schild' });
  });

  it('schild: hamer niveau 2 maakt er een rotsblok met 1 laag van, niveau 1 niet', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'schild'] });
    putBlock(s, 3, 0, 'schild');
    s.hammer = 60;
    const weak = applyAction(s, { type: 'hammer', level: 1, at: { r: 3, c: 0 } });
    const w = pieceAt(weak.state, 3, 0);
    expect(w?.kind === 'block' && w.mech).toBe('schild');
    s.hammer = 120;
    const strong = applyAction(s, { type: 'hammer', level: 2, at: { r: 3, c: 0 } });
    const after = pieceAt(strong.state, 3, 0);
    expect(after?.kind === 'block' && after.mech).toBe('rotsblok');
    expect(after?.kind === 'block' && after.layers).toBe(1);
  });

  it('muur: niet overheen wisselen, en stenen vallen er niet doorheen', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'muur'] });
    // Muur tussen rij 3 en rij 4 in kolom 2: zet A kan niet meer.
    s.cells[3 * s.cols + 2].walls |= WALL_BOTTOM;
    s.cells[4 * s.cols + 2].walls |= WALL_TOP;
    const out = applyAction(s, MOVE_A);
    expect(out.result).toEqual({ kind: 'rejected', reason: 'blocked-by-wall' });
  });

  it('muur: een match over een muur heen telt wel; de steen boven de muur valt niet', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'muur'] });
    // Verticale muur maakt niet uit voor de match 0 0 0 op de onderste rij.
    s.cells[4 * s.cols + 0].walls |= 2;
    s.cells[4 * s.cols + 1].walls |= 8;
    // Horizontale muur onder (3,0): die steen blijft liggen.
    s.cells[3 * s.cols + 0].walls |= WALL_BOTTOM;
    s.cells[4 * s.cols + 0].walls |= WALL_TOP;
    const above = tileAt(s, 3, 0).id;
    const { state, events } = play(s, { type: 'swap', a: { r: 3, c: 2 }, b: { r: 4, c: 2 } });
    expect(events.some((e) => e.type === 'Matched')).toBe(true);
    expect(pieceAt(state, 3, 0)?.id).toBe(above);
  });
});

describe('levels met de nieuwe spelelementen', () => {
  const params = (mechanics: MechanicId[], level: number): LevelParams => ({
    seed: 'uitbreiding',
    level,
    mode: 'beurten',
    difficulty: 'normaal',
    rows: 8,
    cols: 8,
    kinds: 6,
    mechanics,
  });

  it.each<MechanicId>(['kleurblok', 'hars', 'schild', 'muur'])(
    '%s: komt voor, het startbord heeft geen matches en minstens drie zetten',
    (id) => {
      const layout = generateLevel(params(['goud', id], 2));
      expect(layout.mechanics).toContain(id);
      const s = createGame(layout, LOCKED);
      expect(findMatchGroups(s)).toHaveLength(0);
      expect(findMoves(s, 3).length).toBeGreaterThanOrEqual(3);
      const present =
        id === 'hars'
          ? s.cells.some((cell) => cell.piece?.kind === 'tile' && cell.piece.resin)
          : id === 'muur'
            ? s.cells.some((cell) => cell.walls !== 0)
            : s.cells.some((cell) => cell.piece?.kind === 'block' && cell.piece.mech === id);
      expect(present).toBe(true);
    },
  );
});

describe('verspreiders', () => {
  const oilCount = (s: GameState) =>
    s.cells.filter((cell) => cell.piece?.kind === 'block' && cell.piece.mech === 'olie').length;

  it('olie: een aangrenzende match haalt hem weg, en dan verspreidt hij niet', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'olie'] });
    putBlock(s, 3, 0, 'olie');
    const { state, events } = play(s);
    expect(events).toContainEqual({ type: 'ObjectDestroyed', at: { r: 3, c: 0 }, mech: 'olie' });
    expect(events.some((e) => e.type === 'Spread')).toBe(false);
    expect(oilCount(state)).toBe(0);
    expect(state.oilCleared).toEqual([]);
  });

  it('olie: een zet zonder opgeruimde olie laat hem één vakje overnemen', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'olie'] });
    putBlock(s, 0, 0, 'olie');
    const { state, events } = play(s);
    const spreads = events.filter((e) => e.type === 'Spread');
    expect(spreads).toHaveLength(1);
    expect(oilCount(state)).toBe(2);
    const at = spreads[0].type === 'Spread' ? spreads[0].at : null;
    expect(at && Math.abs(at.r - 0) + Math.abs(at.c - 0)).toBe(1);
  });

  it('olie: dezelfde zet geeft dezelfde verspreiding (deelreeks "verspreiding")', () => {
    const make = () => {
      const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'olie'], seed: 'olie' });
      putBlock(s, 1, 4, 'olie');
      return play(s).events.filter((e) => e.type === 'Spread');
    };
    expect(make()).toEqual(make());
  });

  it('oliebron: onverwoestbaar en verspreidt ook zonder olie op het bord', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'olie', 'oliebron'] });
    putBlock(s, 3, 0, 'oliebron');
    const { state, events } = play(s);
    expect(pieceAt(state, 3, 0)?.kind === 'block' && (pieceAt(state, 3, 0) as BlockPiece).mech).toBe('oliebron');
    expect(events.filter((e) => e.type === 'Spread')).toHaveLength(1);
  });

  it('goudzakje: een match van drie goudzakjes legt goud op die vakjes', () => {
    // Soort 5 is bij kinds = 5 het goudzakje.
    const s = boardFromText(['123x41', '234x02', '342x13', '412x23', '551x32'], { mechanics: ['goud', 'goudzakje'] });
    for (const c of [0, 1]) tileAt(s, 4, c).mech = 'goudzakje';
    const bag = tileAt(s, 3, 2);
    bag.type = 5;
    bag.mech = 'goudzakje';
    const { state, events } = play(s, MOVE_A);
    expect(events.filter((e) => e.type === 'Spread' && e.mech === 'goudzakje')).toHaveLength(3);
    for (const c of [0, 1, 2]) expect(state.cells[4 * state.cols + c].floor).toBe(1);
  });

  it('goudzakje: komt alleen uit spawnpunten als het element in het level zit', () => {
    const run = (mechanics: MechanicId[]) => {
      let s = boardFromText(rows('410x23'), { mechanics, seed: 'zakjes' });
      let bags = 0;
      for (let k = 0; k < 40; k++) {
        const out = applyAction(s, { type: 'hammer', level: 1, at: { r: 0, c: 0 } });
        s = runUntilSettled({ ...out.state, hammer: 60 }).state;
        s.hammer = 60;
        bags += s.cells.filter((cell) => cell.piece?.kind === 'tile' && cell.piece.mech === 'goudzakje').length;
      }
      return bags;
    };
    expect(run(['goud'])).toBe(0);
  });
});
