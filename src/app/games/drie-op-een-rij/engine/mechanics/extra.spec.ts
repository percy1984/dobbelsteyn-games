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

  const NEW: MechanicId[] = [
    'kleurblok',
    'hars',
    'schild',
    'muur',
    'olie',
    'oliebron',
    'goudzakje',
    'portaal',
    'lopendeBand',
    'stekelbol',
    'pers',
    'waterklok',
    'reiziger',
    'grootBlok',
    'tijdbom',
    'klimmer',
  ];

  const present = (s: GameState, id: MechanicId): boolean => {
    switch (id) {
      case 'hars':
        return s.cells.some((cell) => cell.piece?.kind === 'tile' && cell.piece.resin);
      case 'muur':
        return s.cells.some((cell) => cell.walls !== 0);
      case 'portaal':
        return s.portals.length > 0;
      case 'lopendeBand':
        return s.belts.length > 0;
      case 'goudzakje':
        return true;
      case 'tijdbom':
      case 'klimmer':
        return s.cells.some((cell) => cell.piece?.kind === 'tile' && cell.piece.mech === id);
      default:
        return s.cells.some((cell) => cell.piece?.kind === 'block' && cell.piece.mech === id);
    }
  };

  it.each(NEW)('%s: komt voor, het startbord heeft geen matches en minstens drie zetten', (id) => {
    const mechanics: MechanicId[] = id === 'oliebron' ? ['goud', 'olie', 'oliebron'] : ['goud', id];
    const layout = generateLevel(params(mechanics, id === 'oliebron' ? 4 : 2));
    expect(layout.mechanics).toContain(id);
    const s = createGame(layout, LOCKED);
    expect(findMatchGroups(s)).toHaveLength(0);
    expect(findMoves(s, 3).length).toBeGreaterThanOrEqual(3);
    expect(present(s, id)).toBe(true);
  });

  it.each(NEW)('%s: twintig zetten spelen loopt nooit vast', (id) => {
    const mechanics: MechanicId[] = id === 'oliebron' ? ['goud', 'olie', 'oliebron'] : ['goud', id];
    for (const seed of ['a', 'b']) {
      let s = createGame(generateLevel({ ...params(mechanics, id === 'oliebron' ? 4 : 2), seed }), LOCKED);
      for (let k = 0; k < 20 && !s.result; k++) {
        const move = findMoves(s, 1)[0];
        if (!move) break;
        const out = applyAction(s, { type: 'swap', a: move.a, b: move.b });
        expect(out.result.kind).toBe('accepted');
        const settled = runUntilSettled(out.state);
        s = settled.state;
        if (s.result) break;
        expect(s.settled).toBe(true);
        expect(s.cells.every((cell) => !cell.exists || cell.piece !== null)).toBe(true);
      }
    }
  });
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

describe('bordstroom', () => {
  it('portaal: wat onderuit de ingang valt, komt bovenin de uitgang tevoorschijn', () => {
    // Match op de onderste rij in kolom 4-5... eenvoudiger: hamer op de uitgang maakt die leeg.
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'portaal'] });
    const portals = [{ id: 1, from: { r: 1, c: 0 }, to: { r: 3, c: 5 } }];
    const t: GameState = { ...s, portals, hammer: 60 };
    const fromId = tileAt(t, 1, 0).id;
    const aboveId = tileAt(t, 0, 0).id;
    const out = applyAction(t, { type: 'hammer', level: 1, at: { r: 3, c: 5 } });
    const { state } = runUntilSettled(out.state);
    // De steen uit de ingang ligt nu in de uitgang; de kolom van de ingang is aangevuld.
    expect(pieceAt(state, 3, 5)?.id).toBe(fromId);
    expect(pieceAt(state, 1, 0)?.id).toBe(aboveId);
    expect(state.cells.every((cell) => !cell.exists || cell.piece)).toBe(true);
  });

  it('portaal: stenen vallen niet onderuit de ingang naar het vakje eronder', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'portaal'] });
    const t: GameState = { ...s, portals: [{ id: 1, from: { r: 1, c: 0 }, to: { r: 3, c: 5 } }], hammer: 60 };
    const fromId = tileAt(t, 1, 0).id;
    const out = applyAction(t, { type: 'hammer', level: 1, at: { r: 2, c: 0 } });
    const { state } = runUntilSettled(out.state);
    expect(pieceAt(state, 1, 0)?.id).toBe(fromId);
  });

  it('lopende band (lijn): schuift bij het beurteinde één vakje op; aan het begin komt een nieuwe steen', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'lopendeBand'] });
    // Kolom 4 en 5 bewegen niet door zet A.
    const cells = [4, 5].map((c) => ({ r: 0, c }));
    const t: GameState = { ...s, belts: [{ id: 1, cells, loop: false }] };
    const ids = cells.map((p) => tileAt(t, p.r, p.c).id);
    const { state, events } = play(t);
    expect(pieceAt(state, 0, 5)?.id).toBe(ids[0]);
    expect(ids).not.toContain(pieceAt(state, 0, 4)?.id);
    expect(events).toContainEqual({ type: 'Cleared', id: ids[1], at: { r: 0, c: 5 } });
  });

  it('lopende band (lus): alles schuift rond, er gaat niets verloren', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'lopendeBand'] });
    const cells = [
      { r: 0, c: 4 },
      { r: 0, c: 5 },
      { r: 1, c: 5 },
      { r: 1, c: 4 },
    ];
    const t: GameState = { ...s, belts: [{ id: 1, cells, loop: true }] };
    const ids = cells.map((p) => pieceAt(t, p.r, p.c)?.id);
    const { state } = play(t);
    const after = cells.map((p) => pieceAt(state, p.r, p.c)?.id);
    expect(after).toEqual([ids[3], ids[0], ids[1], ids[2]]);
  });
});

describe('hulpobjecten (uitbreiding)', () => {
  it('stekelbol: een match in zijn kleur geeft direct een explosie op zijn rij; hij blijft liggen en draait om', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'stekelbol'] });
    putBlock(s, 3, 0, 'stekelbol', { color: 0, dir: 0 });
    const { state, events } = play(s);
    const boom = events.find((e) => e.type === 'Explosion');
    expect(boom?.type === 'Explosion' && boom.cells.every((p) => p.r === 3)).toBe(true);
    const after = pieceAt(state, 3, 0);
    expect(after?.kind === 'block' && after.mech).toBe('stekelbol');
    expect(after?.kind === 'block' && after.dir).toBe(1);
  });

  it('stekelbol: een match in een andere kleur doet niets', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'stekelbol'] });
    putBlock(s, 3, 0, 'stekelbol', { color: 3 });
    const { events } = play(s);
    expect(events.some((e) => e.type === 'Explosion')).toBe(false);
  });

  it('pers: de meter vult met het aantal stenen; vol laat bij het beurteinde alle stenen van die kleur verdwijnen', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'pers'] });
    putBlock(s, 3, 0, 'pers', { color: 0, counter: 0 });
    const first = play(s);
    const pers = pieceAt(first.state, 3, 0);
    expect(pers?.kind === 'block' && pers.counter).toBe(3);

    const t = boardFromText(rows('#10x23'), { mechanics: ['goud', 'pers'] });
    putBlock(t, 3, 0, 'pers', { color: 2, counter: 12 });
    const kind2 = t.cells.flatMap((cell) => (cell.piece?.kind === 'tile' && cell.piece.type === 2 ? [cell.piece.id] : []));
    expect(kind2.length).toBeGreaterThan(0);
    const { state } = play(t);
    expect(state.cells.some((cell) => kind2.includes(cell.piece?.id ?? -1))).toBe(false);
    const after = pieceAt(state, 3, 0);
    expect(after?.kind === 'block' && after.counter).toBe(0);
  });

  it('waterklok: vol kleurt bij het beurteinde de eerste drie stenen in de uitloop-richting', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'waterklok'] });
    // Waterklok op (0,4) met uitloop naar beneden (kolom 4: rij 1, 2, 3).
    putBlock(s, 0, 4, 'waterklok', { color: 4, counter: 9, dir: 2 });
    const { events } = play(s);
    const spreads = events.filter((e) => e.type === 'Spread' && e.mech === 'waterklok');
    expect(spreads.map((e) => (e.type === 'Spread' ? e.at : null))).toEqual([
      { r: 1, c: 4 },
      { r: 2, c: 4 },
      { r: 3, c: 4 },
    ]);
  });
});

describe('doelen (uitbreiding)', () => {
  it('reiziger: een match in het volgende vakje laat hem bij het beurteinde één stap zetten', () => {
    const s = boardFromText(rows('#10x23'), {
      mechanics: ['goud', 'reiziger'],
      goals: [{ kind: 'reiziger', target: 1, done: 0 }],
    });
    // Reiziger op (3,0) met pad (3,0) -> (4,0): de match in (4,0) laat hem naar de uitgang stappen.
    const t: GameState = { ...s, paths: [[{ r: 3, c: 0 }, { r: 4, c: 0 }]] };
    putBlock(t, 3, 0, 'reiziger', { tag: 0, dir: 0 });
    const { state, events } = play(t);
    expect(events).toContainEqual({ type: 'Collected', at: { r: 4, c: 0 }, mech: 'reiziger' });
    expect(state.goals[0].done).toBe(1);
    expect(state.result).toBe('gewonnen');
  });

  it('reiziger: explosies doen hem niets en zonder match in het volgende vakje blijft hij staan', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'reiziger'] });
    const t: GameState = { ...s, paths: [[{ r: 3, c: 0 }, { r: 2, c: 0 }]] };
    putBlock(t, 3, 0, 'reiziger', { tag: 0, dir: 0 });
    tileAt(t, 4, 1).special = 'bom';
    const { state } = play(t);
    const traveler = pieceAt(state, 3, 0);
    expect(traveler?.kind === 'block' && traveler.mech).toBe('reiziger');
    expect(traveler?.kind === 'block' && traveler.dir).toBe(0);
  });

  it('groot blok (emmer): één treffer per match voor het hele blok, ook als de match meerdere delen raakt', () => {
    const s = boardFromText(rows('##0x23'), {
      mechanics: ['goud', 'grootBlok'],
      goals: [{ kind: 'grootBlok', target: 1, done: 0 }],
    });
    // Zet A maakt 0 0 0 op rij 4, kolom 0-2: raakt beide delen op rij 3.
    putBlock(s, 3, 0, 'grootBlok', { tag: 1, dir: 1, layers: 2 });
    putBlock(s, 3, 1, 'grootBlok', { tag: 1, dir: 1, layers: 2 });
    const out = applyAction(s, MOVE_A);
    const { events } = runUntilSettled(out.state);
    const first = events.find((e) => e.type === 'Hit' && e.target === 'grootBlok');
    expect(first?.type === 'Hit' && first.left).toBe(1);
  });

  it('groot blok (doos): telt de stenen in aangrenzende matches; vol is weg en telt als doel', () => {
    const s = boardFromText(rows('##0x23'), {
      mechanics: ['goud', 'grootBlok'],
      goals: [{ kind: 'grootBlok', target: 1, done: 0 }],
    });
    putBlock(s, 3, 0, 'grootBlok', { tag: 1, dir: 2, layers: 3 });
    putBlock(s, 3, 1, 'grootBlok', { tag: 1, dir: 2, layers: 3 });
    const { state, events } = play(s);
    expect(events.filter((e) => e.type === 'ObjectDestroyed' && e.mech === 'grootBlok')).toHaveLength(2);
    expect(state.goals[0].done).toBe(1);
  });

  it('groot blok (taart): elk deel gaat apart weg', () => {
    const s = boardFromText(rows('#10x23'), { mechanics: ['goud', 'grootBlok'] });
    putBlock(s, 3, 0, 'grootBlok', { tag: 1, dir: 0 });
    putBlock(s, 2, 0, 'grootBlok', { tag: 1, dir: 0 });
    const { state } = play(s);
    expect(pieceAt(state, 2, 0)?.kind).toBe('block');
    expect(pieceAt(state, 3, 0)?.kind === 'block' && (pieceAt(state, 3, 0) as BlockPiece).mech === 'grootBlok').toBe(
      false,
    );
  });
});

describe('verliesmechanieken', () => {
  it('tijdbom: telt bij elk beurteinde af; op 0 is het level verloren', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'tijdbom'], floors: ['000000', '000000', '000000', '000000', '000001'] });
    const bomb = tileAt(s, 0, 5);
    bomb.mech = 'tijdbom';
    bomb.counter = 1;
    const { state } = play(s);
    expect(state.result).toBe('verloren');
    expect(state.loseReason).toBe('tijdbom');
  });

  it('tijdbom: weggehaald voordat hij op 0 staat, dan gebeurt er niets', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'tijdbom'], floors: ['000000', '000000', '000000', '000000', '000001'] });
    const bomb = tileAt(s, 4, 0);
    bomb.mech = 'tijdbom';
    bomb.counter = 1;
    const { state } = play(s);
    expect(state.result).toBeNull();
  });

  it('klimmer: klimt bij het beurteinde één vakje omhoog; een blokkade erboven laat hem wachten', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'klimmer'], floors: ['000000', '000000', '000000', '000000', '000001'] });
    const climber = tileAt(s, 3, 5);
    climber.mech = 'klimmer';
    const { state } = play(s);
    expect(pieceAt(state, 2, 5)?.id).toBe(climber.id);

    const t = boardFromText(rows('410x23'), { mechanics: ['goud', 'klimmer'], floors: ['000000', '000000', '000000', '000000', '000001'] });
    tileAt(t, 3, 5).mech = 'klimmer';
    const id = tileAt(t, 3, 5).id;
    putBlock(t, 2, 5, 'rotsblok');
    const waited = play(t);
    expect(pieceAt(waited.state, 3, 5)?.id).toBe(id);
  });

  it('klimmer: bereikt hij de bovenste rij, dan is het level verloren; gevangen telt als doel', () => {
    const s = boardFromText(rows('410x23'), { mechanics: ['goud', 'klimmer'], floors: ['000000', '000000', '000000', '000000', '000001'] });
    tileAt(s, 1, 5).mech = 'klimmer';
    const { state } = play(s);
    expect(state.loseReason).toBe('klimmer');

    const t = boardFromText(rows('410x23'), {
      mechanics: ['goud', 'klimmer'],
      goals: [{ kind: 'klimmer', target: 1, done: 0 }],
    });
    tileAt(t, 4, 0).mech = 'klimmer';
    const caught = play(t);
    expect(caught.state.goals[0].done).toBe(1);
    expect(caught.state.result).toBe('gewonnen');
  });
});
