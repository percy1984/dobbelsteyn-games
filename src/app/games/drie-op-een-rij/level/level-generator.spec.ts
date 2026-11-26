import { cyrb128 } from '../rng/rng';
import { applyAction, createGame, findHint, step } from '../engine';
import { buildCells } from '../engine/create';
import { findMatchGroups, findMoves } from '../engine/matcher';
import { LOCKED, UNLOCKED } from '../engine/test-helpers';
import type { GameAction, GameState, LevelParams } from '../engine/types';
import { generateLevel } from './level-generator';

const BASE: LevelParams = {
  seed: 'papa',
  level: 1,
  mode: 'beurten',
  difficulty: 'normaal',
  rows: 8,
  cols: 8,
  kinds: 6,
  mechanics: ['goud', 'zilver'],
};

function fingerprint(params: LevelParams): string {
  const layout = generateLevel(params);
  return cyrb128(
    JSON.stringify([layout.shape, layout.floors, layout.tiles, layout.goals, layout.moves, layout.mechanics]),
  ).join('-');
}

/** Speelt `moves` zetten met de hint en legt ze vast als replay { tick, action }. */
function playWithHints(start: GameState, moves: number): { end: GameState; replay: { tick: number; action: GameAction }[] } {
  let s = start;
  const replay: { tick: number; action: GameAction }[] = [];
  for (let i = 0; i < 20000 && replay.length < moves && !s.result; i++) {
    if (s.settled) {
      const hint = findHint(s);
      if (hint) {
        const action: GameAction = { type: 'swap', a: hint.a, b: hint.b };
        const out = applyAction(s, action);
        if (out.result.kind === 'accepted') {
          replay.push({ tick: s.tick, action });
          s = out.state;
        }
      }
    }
    s = step(s).state;
  }
  return { end: s, replay };
}

/** Speelt een replay opnieuw af: acties op dezelfde tick. */
function replayFrom(start: GameState, replay: { tick: number; action: GameAction }[], until: number): GameState {
  let s = start;
  let k = 0;
  while (s.tick < until) {
    while (k < replay.length && replay[k].tick === s.tick) {
      s = applyAction(s, replay[k].action).state;
      k++;
    }
    s = step(s).state;
  }
  return s;
}

describe('levelgenerator', () => {
  it('geeft voor dezelfde invoer exact hetzelfde level', () => {
    expect(generateLevel(BASE)).toEqual(generateLevel(BASE));
    expect(generateLevel({ ...BASE, seed: 'mama' })).not.toEqual(generateLevel(BASE));
  });

  it('blijft gelijk aan versie 1 (snapshot per vaste seed)', () => {
    expect({
      papa1: fingerprint(BASE),
      papa4: fingerprint({ ...BASE, level: 4, mechanics: ['goud', 'zilver', 'ketting', 'rotsblok'] }),
      dag: fingerprint({ ...BASE, seed: '2026-11-26', rows: 6, cols: 10, kinds: 5, mode: 'tijd' }),
    }).toEqual(SNAPSHOTS);
  });

  it('maakt altijd een startbord zonder matches en met minstens drie zetten', () => {
    for (let k = 0; k < 150; k++) {
      const params: LevelParams = {
        ...BASE,
        seed: `seed-${k}`,
        level: 1 + (k % 12),
        rows: 6 + (k % 5),
        cols: 6 + ((k * 3) % 5),
        kinds: 5 + (k % 3),
        difficulty: (['makkelijk', 'normaal', 'uitdagend'] as const)[k % 3],
      };
      const layout = generateLevel(params);
      const board = { rows: layout.rows, cols: layout.cols, cells: buildCells(layout).cells };
      expect(findMatchGroups(board)).toEqual([]);
      expect(findMoves(board, 3).length).toBe(3);
    }
  });

  it('heeft altijd goud als doel, met het juiste aantal', () => {
    const layout = generateLevel(BASE);
    const floors = layout.floors.filter((f) => f > 0).length;
    expect(layout.goals[0]).toEqual({ kind: 'goud', target: floors });
    expect(floors).toBeGreaterThan(0);
  });

  it('geeft beurten alleen bij Aantal beurten en tijd alleen bij Op tijd', () => {
    expect(generateLevel(BASE).moves).toBeGreaterThan(0);
    expect(generateLevel(BASE).seconds).toBeNull();
    const timed = generateLevel({ ...BASE, mode: 'tijd' });
    expect(timed.moves).toBeNull();
    expect(timed.seconds).toBeGreaterThan(60);
    const relaxed = generateLevel({ ...BASE, mode: 'ontspannen' });
    expect(relaxed.moves).toBeNull();
    expect(relaxed.seconds).toBeNull();
  });

  it('gebruikt alleen spelelementen die aan staan, vanaf hun introductielevel', () => {
    expect(generateLevel({ ...BASE, level: 1 }).mechanics).toEqual([]);
    expect(generateLevel({ ...BASE, level: 2 }).newMechanic).toBe('zilver');
    expect(generateLevel({ ...BASE, level: 2 }).mechanics).toEqual(['zilver']);
    expect(generateLevel({ ...BASE, level: 5, mechanics: ['goud'] }).mechanics).toEqual([]);
    expect(generateLevel({ ...BASE, level: 5, mechanics: ['goud'] }).floors.some((f) => f === 2)).toBe(false);
  });

  it('maakt het bord niet afhankelijk van de invoerinstelling', () => {
    const layout = generateLevel(BASE);
    expect(createGame(layout, LOCKED).cells).toEqual(createGame(layout, UNLOCKED).cells);
  });

  it('beperkt de bordgrootte en het aantal soorten', () => {
    const layout = generateLevel({ ...BASE, rows: 20, cols: 2, kinds: 12 });
    expect(layout.rows).toBe(10);
    expect(layout.cols).toBe(6);
    expect(layout.kinds).toBe(7);
    expect(generateLevel({ ...BASE, kinds: 5, difficulty: 'makkelijk' }).kinds).toBe(4);
  });
});

describe('determinisme', () => {
  it('levert met dezelfde seed, instellingen en { tick, action } exact dezelfde eindstate', () => {
    const start = createGame(generateLevel(BASE), LOCKED);
    const { end, replay } = playWithHints(start, 6);
    expect(replay.length).toBeGreaterThan(0);
    const again = replayFrom(start, replay, end.tick);
    expect(again).toEqual(end);
  });

  it('bij Locked hangt het verloop alleen af van de volgorde van zetten, niet van het tempo', () => {
    const start = createGame(generateLevel(BASE), LOCKED);
    const { replay } = playWithHints(start, 4);
    // Dezelfde zetten, maar elke zet 37 ticks later dan het rustmoment.
    let fast = start;
    let slow = start;
    for (const { action } of replay) {
      while (!fast.settled) fast = step(fast).state;
      fast = applyAction(fast, action).state;
      while (!slow.settled) slow = step(slow).state;
      for (let i = 0; i < 37; i++) slow = step(slow).state;
      slow = applyAction(slow, action).state;
    }
    while (!fast.settled) fast = step(fast).state;
    while (!slow.settled) slow = step(slow).state;
    const view = (s: GameState) => ({ cells: s.cells.map((c) => (c.piece?.kind === 'tile' ? c.piece.type : -1)), score: s.score, floors: s.cells.map((c) => c.floor) });
    expect(view(slow)).toEqual(view(fast));
  });

  it('gebruikt nergens Math.random', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random in de engine');
    });
    try {
      const start = createGame(generateLevel({ ...BASE, level: 6 }), UNLOCKED);
      playWithHints(start, 5);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * Vastgelegd bij generatorversie 1. Faalt dit, dan is de uitvoer van v1 veranderd: verhoog
 * GENERATOR_VERSION. Uitzondering tot de eerste livegang: zolang spelelementen nog gebouwd worden,
 * mogen deze waarden mee veranderen (er zijn dan nog geen gedeelde bordnummers).
 */
const SNAPSHOTS = {
  dag: '1675154232-2932045178-2788458558-1586938719',
  papa1: '3298702803-3018904255-1953199889-773253905',
  papa4: '2188167654-1262337040-433626935-3352108074',
};
