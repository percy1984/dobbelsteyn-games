import { generateLevel } from '../../level/level-generator';
import { applyAction } from '../apply-action';
import { createGame } from '../create';
import { findHint, findMatchGroups, findMoves } from '../matcher';
import { runUntilSettled } from '../step';
import { boardFromText, LOCKED } from '../test-helpers';
import type { GameAction, GameEvent, GameState, LevelParams, MechanicId } from '../types';
import { SCORE } from '../config';
import { MECHANICS } from './registry';

/** Zoals in engine.spec: zet A maakt 0 0 0 op de onderste rij (kolom 0-2). */
const MOVE_A: GameAction = { type: 'swap', a: { r: 3, c: 2 }, b: { r: 4, c: 2 } };
const rows = (row3: string) => ['123x41', '234x02', '342x13', row3, '001x32'];

function play(state: GameState, action: GameAction = MOVE_A): { state: GameState; events: GameEvent[] } {
  const out = applyAction(state, action);
  expect(out.result.kind).toBe('accepted');
  const settled = runUntilSettled(out.state);
  return { state: settled.state, events: [...out.events, ...settled.events] };
}

const STANDAARD: MechanicId[] = ['goud', 'zilver', 'amulet', 'verborgenSchat', 'ketting', 'rotsblok', 'muntblok', 'veer', 'altaar'];

describe('spelelementen uit de preset Standaard', () => {
  it('amulet: zakt naar de onderste rij en wordt daar verzameld', () => {
    const s = boardFromText(rows('*10x23'), {
      mechanics: ['goud', 'amulet'],
      goals: [{ kind: 'amulet', target: 1, done: 0 }],
    });
    const { state, events } = play(s);
    expect(events).toContainEqual({ type: 'Collected', at: { r: 4, c: 0 }, mech: 'amulet' });
    expect(state.goals[0].done).toBe(1);
    expect(state.result).toBe('gewonnen');
    expect(state.cells.some((cell) => cell.piece?.kind === 'fall')).toBe(false);
  });

  it('amulet: een match ernaast doet hem niets', () => {
    const s = boardFromText(['123x41', '234x02', '342x13', '410x23', '0*1x32'], { mechanics: ['goud', 'amulet'] });
    // De amulet ligt al onderaan: hij wordt in de eerste tick verzameld, zonder treffer.
    const { events } = play(s, { type: 'swap', a: { r: 4, c: 4 }, b: { r: 4, c: 5 } });
    expect(events.some((e) => e.type === 'Hit' && e.target === 'amulet')).toBe(false);
    expect(events).toContainEqual({ type: 'Collected', at: { r: 4, c: 1 }, mech: 'amulet' });
  });

  it('veer: één aangrenzende match haalt hem weg', () => {
    const s = boardFromText(rows('~10x23'), { mechanics: ['goud', 'veer'] });
    const featherId = s.cells[18].piece?.id;
    const { state, events } = play(s);
    expect(events).toContainEqual({ type: 'Hit', at: { r: 3, c: 0 }, target: 'veer', left: 0 });
    expect(state.cells.some((cell) => cell.piece?.id === featherId)).toBe(false);
  });

  it('muntblok: breekt bij één treffer en geeft bonuspunten', () => {
    const s = boardFromText(rows('m10x23'), { mechanics: ['goud', 'muntblok'] });
    const { state, events } = play(s);
    expect(events).toContainEqual({ type: 'ObjectDestroyed', at: { r: 3, c: 0 }, mech: 'muntblok' });
    expect(events.filter((e) => e.type === 'ScoreAdded' && e.points === SCORE.coinBlock).length).toBe(1);
    expect(state.cells[18].piece?.kind).toBe('tile');
  });

  it('altaar: een match ernaast in zijn kleur ontsteekt het; bij het beurteinde ontploft de ring eromheen', () => {
    const s = boardFromText(rows('a10x23'), { mechanics: ['goud', 'altaar'] });
    const { state, events } = play(s);
    const types = events.map((e) => e.type);
    const lit = events.findIndex((e) => e.type === 'Hit' && e.target === 'altaar' && e.left === 1);
    const turnEnd = types.indexOf('TurnEndStarted');
    const explosion = types.indexOf('Explosion');
    expect(lit).toBeGreaterThanOrEqual(0);
    expect(turnEnd).toBeGreaterThan(lit);
    expect(explosion).toBeGreaterThan(turnEnd);
    const boom = events[explosion];
    expect(boom.type === 'Explosion' && boom.res).not.toBe(1);
    const altar = state.cells[18].piece;
    expect(altar?.kind === 'block' && altar.mech === 'altaar' && altar.counter).toBe(0);
  });

  it('altaar: een match in een andere kleur doet niets', () => {
    const s = boardFromText(rows('b10x23'), { mechanics: ['goud', 'altaar'] });
    const { events } = play(s);
    expect(events.some((e) => e.type === 'Explosion')).toBe(false);
  });

  it('verborgen schat: komt tevoorschijn zodra alle bodemlagen van de groep weg zijn', () => {
    const s = boardFromText(rows('410x23'), {
      mechanics: ['goud', 'verborgenSchat'],
      floors: ['000000', '000000', '000000', '000000', '110000'],
      goals: [{ kind: 'schat', target: 1, done: 0 }],
    });
    s.cells[24].treasure = 0;
    s.cells[25].treasure = 0;
    const { state, events } = play(s);
    expect(events).toContainEqual({ type: 'Collected', at: { r: 4, c: 0 }, mech: 'verborgenSchat' });
    expect(state.goals[0].done).toBe(1);
    expect(state.cells.every((cell) => cell.treasure === -1)).toBe(true);
  });
});

describe('levels met de preset Standaard', () => {
  const params = (k: number): LevelParams => ({
    seed: `std-${k}`,
    level: 1 + (k % 20),
    mode: (['beurten', 'tijd', 'ontspannen'] as const)[k % 3],
    difficulty: (['makkelijk', 'normaal', 'uitdagend'] as const)[k % 3],
    rows: 6 + (k % 5),
    cols: 6 + ((k * 3) % 5),
    kinds: 5 + (k % 3),
    mechanics: STANDAARD,
  });

  it('heeft een geldig startbord, hooguit 25% blokkades en klopt met de doelen', () => {
    for (let k = 0; k < 120; k++) {
      const layout = generateLevel(params(k));
      const game = createGame(layout, LOCKED);
      expect(findMatchGroups(game)).toEqual([]);
      expect(findMoves(game, 3).length).toBe(3);
      const blocks = layout.objects.filter((o) => o?.kind === 'block').length;
      expect(blocks).toBeLessThanOrEqual(Math.floor(layout.shape.filter(Boolean).length * 0.25));
      const amulets = layout.objects.filter((o) => o?.kind === 'fall' && o.mech === 'amulet').length;
      const amuletGoal = layout.goals.find((g) => g.kind === 'amulet');
      expect(amuletGoal?.target ?? 0).toBe(amulets);
      expect(layout.mechanics.filter((id) => id !== 'zilver').length).toBeLessThanOrEqual(3);
    }
  });

  it('introduceert elk element op zijn eigen level', () => {
    const seen = new Map<number, MechanicId>();
    for (let level = 1; level <= 20; level++) {
      const layout = generateLevel({ ...params(0), level });
      if (layout.newMechanic) {
        expect(layout.mechanics).toContain(layout.newMechanic);
        seen.set(level, layout.newMechanic);
      }
    }
    expect([...seen.values()]).toEqual(
      MECHANICS.filter((m) => STANDAARD.includes(m.id) && m.id !== 'goud')
        .sort((a, b) => a.introductieLevel - b.introductieLevel)
        .map((m) => m.id),
    );
  });

  it('blijft een geldig bord houden tijdens een heel spel met hints', () => {
    for (let k = 0; k < 12; k++) {
      let s = createGame(generateLevel({ ...params(k), level: 6 + k, mode: 'ontspannen' }), LOCKED);
      for (let move = 0; move < 25 && !s.result; move++) {
        const hint = findHint(s);
        expect(hint).not.toBeNull();
        if (!hint) break;
        s = runUntilSettled(applyAction(s, { type: 'swap', a: hint.a, b: hint.b }).state).state;
        expect(s.settled).toBe(true);
        expect(s.cells.every((cell) => !cell.exists || cell.piece !== null)).toBe(true);
        const ids = s.cells.flatMap((cell) => (cell.piece ? [cell.piece.id] : []));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});
