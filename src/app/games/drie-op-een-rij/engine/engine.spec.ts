import { applyAction } from './apply-action';
import { findMatchGroups, findMoves } from './matcher';
import { runUntilSettled, step } from './step';
import { isStill } from './settle';
import { boardFromText, boardToText, LOCKED } from './test-helpers';
import type { GameAction, GameEvent, GameState } from './types';

/**
 * Bord met een gat in kolom 3, zodat zet A (links) en zet B (rechts) elkaar niet kunnen raken:
 * - A: wissel (3,2)<->(4,2) maakt 0 0 0 op de onderste rij.
 * - B: wissel (4,4)<->(4,5) maakt 3 3 3 in kolom 5.
 */
const SPLIT = [
  '123x41',
  '234x02',
  '342x13',
  '410x23',
  '001x32',
];
const MOVE_A: GameAction = { type: 'swap', a: { r: 3, c: 2 }, b: { r: 4, c: 2 } };
const MOVE_B: GameAction = { type: 'swap', a: { r: 4, c: 4 }, b: { r: 4, c: 5 } };

function ticks(state: GameState, n: number): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    const next = step(current);
    current = next.state;
    events.push(...next.events);
  }
  return { state: current, events };
}

function accepted(state: GameState, action: GameAction): GameState {
  const out = applyAction(state, action);
  expect(out.result.kind).toBe('accepted');
  return out.state;
}

function pieceIds(s: GameState): number[] {
  return s.cells.flatMap((cell) => (cell.piece ? [cell.piece.id] : []));
}

describe('engine: Locked', () => {
  it('begint in een rustmoment zonder matches', () => {
    const s = boardFromText(SPLIT);
    expect(s.settled).toBe(true);
    expect(findMatchGroups(s)).toEqual([]);
    expect(isStill(s)).toBe(true);
  });

  it('accepteert een geldige wissel, schrijft de beurt direct af en zet de vergrendeling aan', () => {
    const s = boardFromText(SPLIT, { movesLeft: 10 });
    const out = applyAction(s, MOVE_A);
    expect(out.result).toEqual({ kind: 'accepted', res: 1 });
    expect(out.state.movesLeft).toBe(9);
    expect(out.state.locked).toBe(true);
    expect(out.state.settled).toBe(false);
    expect(out.events).toContainEqual({ type: 'SwapStarted', a: { r: 3, c: 2 }, b: { r: 4, c: 2 }, res: 1 });
  });

  it('weigert een wissel tijdens de afhandeling met input-locked en verandert niets', () => {
    const s = accepted(boardFromText(SPLIT), MOVE_A);
    const during = ticks(s, 5).state;
    const out = applyAction(during, MOVE_B);
    expect(out.result).toEqual({ kind: 'rejected', reason: 'input-locked' });
    expect(out.state).toBe(during);
    expect(out.events).toEqual([]);
  });

  it('weigert ook tijdens het beurteinde, en accepteert dezelfde wissel na het rustmoment', () => {
    let s = accepted(boardFromText(SPLIT), MOVE_A);
    // Loop tot vlak voor het rustmoment: zodra het beurteinde start, is de vergrendeling nog aan.
    let sawTurnEnd = false;
    for (let i = 0; i < 2000 && !s.settled; i++) {
      const next = step(s);
      if (next.events.some((e) => e.type === 'TurnEndStarted')) {
        sawTurnEnd = true;
        expect(applyAction(next.state, MOVE_B).result).toEqual({ kind: 'rejected', reason: 'input-locked' });
      }
      s = next.state;
    }
    expect(sawTurnEnd).toBe(true);
    expect(s.settled).toBe(true);
    expect(s.locked).toBe(false);
    expect(applyAction(s, MOVE_B).result.kind).toBe('accepted');
  });

  it('laat stenen vallen en vult het bord aan tot een rustmoment', () => {
    const { state, events } = runUntilSettled(accepted(boardFromText(SPLIT), MOVE_A));
    expect(state.settled).toBe(true);
    expect(isStill(state)).toBe(true);
    expect(state.cells.every((cell) => !cell.exists || cell.piece !== null)).toBe(true);
    expect(findMatchGroups(state)).toEqual([]);
    expect(events.filter((e) => e.type === 'Spawned').length).toBeGreaterThanOrEqual(3);
    expect(new Set(pieceIds(state)).size).toBe(pieceIds(state).length);
    // De rechterkant (achter het gat) is niet veranderd.
    const text = boardToText(state);
    expect(text.map((line) => line.slice(3))).toEqual(SPLIT.map((line) => ' ' + line.slice(4)));
  });

  it('geeft de match van de zet zelf cascadediepte 0', () => {
    const { events } = runUntilSettled(accepted(boardFromText(SPLIT), MOVE_A));
    const matched = events.filter((e) => e.type === 'Matched');
    expect(matched[0]).toMatchObject({ type: 'Matched', res: 1, depth: 0, points: 50 });
  });

  it('heeft precies één beurteinde per zet', () => {
    let s = boardFromText(SPLIT);
    const all: GameEvent[] = [];
    s = accepted(s, MOVE_A);
    let out = runUntilSettled(s);
    all.push(...out.events);
    s = accepted(out.state, MOVE_B);
    out = runUntilSettled(s);
    all.push(...out.events);
    expect(all.filter((e) => e.type === 'TurnEndStarted').map((e) => (e.type === 'TurnEndStarted' ? e.res : 0))).toEqual([1, 2]);
  });

  it('laat een ongeldige wissel heen en terug schuiven zonder kosten', () => {
    const s = boardFromText(SPLIT, { movesLeft: 5 });
    const out = applyAction(s, { type: 'swap', a: { r: 0, c: 0 }, b: { r: 0, c: 1 } });
    expect(out.result).toEqual({ kind: 'rejected', reason: 'no-match' });
    expect(out.state.movesLeft).toBe(5);
    expect(out.state.locked).toBe(false);
    expect(out.state.cells[0].piece?.m.state).toBe('wisselend');
    const after = runUntilSettled(out.state).state;
    expect(boardToText(after)).toEqual(boardToText(s));
    expect(isStill(after)).toBe(true);
  });

  it('weigert wissels die niet kunnen, met een reden', () => {
    const s = boardFromText(['0100', '1#21', 'A120']);
    const reason = (a: { r: number; c: number }, b: { r: number; c: number }) => {
      const out = applyAction(s, { type: 'swap', a, b });
      return out.result.kind === 'rejected' ? out.result.reason : 'accepted';
    };
    expect(reason({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe('not-adjacent');
    expect(reason({ r: 0, c: 0 }, { r: 0, c: 9 })).toBe('not-adjacent');
    expect(reason({ r: 0, c: 1 }, { r: 1, c: 1 })).toBe('not-swappable');
    expect(reason({ r: 2, c: 0 }, { r: 1, c: 0 })).toBe('not-swappable');
    s.cells[0].walls = 2;
    expect(reason({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe('blocked-by-wall');
  });

  it('weigert een wissel met een steen die niet stabiel is', () => {
    const s = boardFromText(['0010', '1201']);
    const piece = s.cells[3].piece;
    if (piece) piece.m.state = 'vallend';
    const out = applyAction(s, { type: 'swap', a: { r: 0, c: 2 }, b: { r: 0, c: 3 } });
    expect(out.result).toEqual({ kind: 'rejected', reason: 'tile-not-stable' });
  });

  it('weigert de hamer voorlopig (komt in fase 3)', () => {
    const out = applyAction(boardFromText(SPLIT), { type: 'hammer', level: 1, at: { r: 0, c: 0 } });
    expect(out.result).toEqual({ kind: 'rejected', reason: 'not-available' });
  });

  it('verandert de invoer-state niet (step en applyAction zijn puur)', () => {
    const s = boardFromText(SPLIT);
    const copy = structuredClone(s);
    const after = applyAction(s, MOVE_A).state;
    step(after);
    expect(s).toEqual(copy);
  });
});

describe('engine: raakregels', () => {
  it('raakt de bodemlaag van elk vakje in de match één keer', () => {
    const s = boardFromText(SPLIT, { floors: ['000000', '000000', '000000', '000000', '220000'] });
    const out = runUntilSettled(accepted(s, MOVE_A)).state;
    expect(out.cells[24].floor).toBe(1);
    expect(out.cells[25].floor).toBe(1);
  });

  it('haalt één schakel van een ketting in een match; de steen blijft liggen', () => {
    // A = steen 0 met ketting op (4,0).
    const s = boardFromText(['123x41', '234x02', '342x13', '410x23', 'A01x32']);
    const out = runUntilSettled(accepted(s, MOVE_A)).state;
    const piece = out.cells[24].piece;
    expect(piece?.kind).toBe('tile');
    expect(piece?.kind === 'tile' && piece.chain).toBe(0);
    expect(piece?.id).toBe(s.cells[24].piece?.id);
  });

  it('raakt een aangrenzende blokkade hooguit één keer per match', () => {
    // L-vorm: kolom 0 (rij 1-3) en rij 3 (kolom 0-2). Het rotsblok op (2,1) grenst aan twee stenen ervan.
    const s = boardFromText(['1234', '0341', '0#12', '1003', '0234']);
    const rock = s.cells[2 * 4 + 1].piece;
    if (rock?.kind === 'block') rock.layers = 2;
    let current = accepted(s, { type: 'swap', a: { r: 3, c: 0 }, b: { r: 4, c: 0 } });
    for (let i = 0; i < 500; i++) {
      const next = step(current);
      current = next.state;
      if (next.events.some((e) => e.type === 'Matched')) {
        const matched = next.events.find((e) => e.type === 'Matched');
        expect(matched?.type === 'Matched' && matched.cells.length).toBe(5);
        expect(next.events.filter((e) => e.type === 'Hit' && e.target === 'rotsblok').length).toBe(1);
        return;
      }
    }
    throw new Error('geen match gevonden');
  });

  it('verwijdert een blokkade als de laatste laag weg is', () => {
    const s = boardFromText(['1234', '0341', '0#12', '1003', '0234']);
    const { events } = runUntilSettled(accepted(s, { type: 'swap', a: { r: 3, c: 0 }, b: { r: 4, c: 0 } }));
    expect(events).toContainEqual({ type: 'ObjectDestroyed', at: { r: 2, c: 1 }, mech: 'rotsblok' });
  });
});

describe('engine: uitslag bij een rustmoment', () => {
  it('bepaalt gewonnen pas bij het rustmoment, niet tijdens de afhandeling', () => {
    const s = boardFromText(SPLIT, { floors: ['000000', '000000', '000000', '000000', '111000'] });
    let current = accepted(s, MOVE_A);
    let wonTick = -1;
    let goalTick = -1;
    for (let i = 0; i < 2000 && !current.result; i++) {
      const next = step(current);
      if (goalTick < 0 && next.events.some((e) => e.type === 'GoalProgress' && e.done === e.target)) {
        goalTick = next.state.tick;
        expect(next.state.result).toBeNull();
        expect(next.state.locked).toBe(true);
      }
      if (next.events.some((e) => e.type === 'LevelWon')) {
        wonTick = next.state.tick;
        expect(isStill(next.state)).toBe(true);
      }
      current = next.state;
    }
    expect(current.result).toBe('gewonnen');
    expect(goalTick).toBeGreaterThan(0);
    expect(wonTick).toBeGreaterThan(goalTick);
  });

  it('verliest als de laatste beurt op is en het doel niet gehaald', () => {
    const s = boardFromText(SPLIT, { movesLeft: 1, floors: ['100000', '000000', '000000', '000000', '000000'] });
    const after = accepted(s, MOVE_A);
    expect(after.movesLeft).toBe(0);
    const out = runUntilSettled(after).state;
    expect(out.result).toBe('verloren');
    expect(out.loseReason).toBe('beurten');
  });

  it('weigert een wissel als de beurten op zijn', () => {
    const s = boardFromText(SPLIT, { movesLeft: 0 });
    expect(applyAction(s, MOVE_A).result).toEqual({ kind: 'rejected', reason: 'no-moves-left' });
  });

  it('weigert alles na afloop', () => {
    const s = boardFromText(SPLIT);
    s.result = 'gewonnen';
    expect(applyAction(s, MOVE_A).result).toEqual({ kind: 'rejected', reason: 'game-over' });
  });

  it('telt bij Op tijd af en geeft de uitslag pas na de afhandeling', () => {
    const s = boardFromText(SPLIT, { mode: 'tijd', floors: ['100000', '000000', '000000', '000000', '000000'] });
    s.ticksLeft = 3;
    const after = accepted(s, MOVE_A);
    const out = ticks(after, 3);
    expect(out.state.timeUp).toBe(true);
    expect(out.state.locked).toBe(true);
    expect(out.state.result).toBeNull();
    const done = runUntilSettled(out.state).state;
    expect(done.result).toBe('verloren');
    expect(done.loseReason).toBe('tijd');
  });

  it('pauzeert de tijd tijdens afhandeling als dat aan staat (alleen Locked)', () => {
    const s = boardFromText(SPLIT, {
      mode: 'tijd',
      options: { ...LOCKED, pauseTimeDuringResolution: true },
    });
    s.ticksLeft = 1000;
    const after = accepted(s, MOVE_A);
    const out = ticks(after, 10).state;
    expect(out.ticksLeft).toBe(1000);
  });
});

describe('engine: geen zetten meer', () => {
  it('schudt automatisch zonder kosten tot er een zet is en geen match', () => {
    const s = boardFromText(['0123', '1230', '2301', '3012'], { kinds: 4, movesLeft: 7 });
    expect(findMoves(s)).toEqual([]);
    s.settled = false;
    const first = step(s);
    expect(first.events).toContainEqual({ type: 'Shuffled' });
    const out = runUntilSettled(first.state).state;
    expect(out.settled).toBe(true);
    expect(out.movesLeft).toBe(7);
    expect(findMoves(out).length).toBeGreaterThan(0);
    expect(findMatchGroups(out)).toEqual([]);
    // Schudden verplaatst alleen: dezelfde stenen zijn er nog.
    expect(pieceIds(out).sort((a, b) => a - b)).toEqual(pieceIds(s).sort((a, b) => a - b));
  });

  it('laat stenen met ketting en blokkades liggen bij schudden', () => {
    const s = boardFromText(['0123', '1#30', '2301', 'D012'], { kinds: 4 });
    s.settled = false;
    const out = runUntilSettled(s).state;
    expect(out.cells[5].piece?.kind).toBe('block');
    expect(out.cells[12].piece?.id).toBe(s.cells[12].piece?.id);
  });
});
