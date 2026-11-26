/**
 * Unlocked: zetten terwijl stenen nog vallen. Elke conflictregel heeft hier een eigen test.
 */
import { applyAction } from './apply-action';
import { runUntilSettled, step } from './step';
import { boardFromText, UNLOCKED } from './test-helpers';
import type { GameAction, GameEvent, GameState } from './types';

const SPLIT = ['123x41', '234x02', '342x13', '410x23', '001x32'];
const MOVE_A: GameAction = { type: 'swap', a: { r: 3, c: 2 }, b: { r: 4, c: 2 } };
const MOVE_B: GameAction = { type: 'swap', a: { r: 4, c: 4 }, b: { r: 4, c: 5 } };

type Timed = GameEvent & { tick: number };

function ticks(s: GameState, n: number): { state: GameState; events: Timed[] } {
  let current = s;
  const events: Timed[] = [];
  for (let i = 0; i < n; i++) {
    const next = step(current);
    current = next.state;
    const tick = current.tick;
    events.push(...next.events.map((e): Timed => ({ ...e, tick })));
  }
  return { state: current, events };
}

describe('Unlocked', () => {
  it('weigert een wissel met een steen die niet stabiel is', () => {
    const busy = applyAction(boardFromText(SPLIT, { options: UNLOCKED }), MOVE_A).state;
    expect(busy.locked).toBe(false);
    const out = applyAction(busy, { type: 'swap', a: { r: 4, c: 2 }, b: { r: 4, c: 1 } });
    expect(out.result).toEqual({ kind: 'rejected', reason: 'tile-not-stable' });
  });

  it('een geldige wissel tijdens een afhandeling start een eigen afhandelingsreeks', () => {
    const first = applyAction(boardFromText(SPLIT, { options: UNLOCKED }), MOVE_A).state;
    const during = ticks(first, 4).state;
    expect(during.settled).toBe(false);
    const out = applyAction(during, MOVE_B);
    expect(out.result).toEqual({ kind: 'accepted', res: 2 });
    expect(out.state.resolutions.map((r) => r.id)).toEqual([1, 2]);
  });

  it('twee zetten voor één stilstand geven twee beurteindes, in de volgorde van de zetten', () => {
    let s = applyAction(boardFromText(SPLIT, { options: UNLOCKED }), MOVE_A).state;
    s = applyAction(ticks(s, 2).state, MOVE_B).state;
    const { events } = runUntilSettled(s);
    const turnEnds = events.filter((e) => e.type === 'TurnEndStarted').map((e) => (e.type === 'TurnEndStarted' ? e.res : 0));
    expect(turnEnds).toEqual([1, 2]);
    const settledAt = events.findIndex((e) => e.type === 'Settled');
    const lastTurnEnd = events.map((e) => e.type).lastIndexOf('TurnEndFinished');
    expect(settledAt).toBeGreaterThan(lastTurnEnd);
  });

  it('geldigheid telt alleen stenen die nu stabiel zijn: een steen die nog valt, telt niet mee', () => {
    const s = boardFromText(['010', '202'], { options: UNLOCKED });
    const falling = s.cells[2].piece;
    if (falling) {
      falling.m.state = 'vallend';
      falling.m.offR = -500;
    }
    s.settled = false;
    const out = applyAction(s, { type: 'swap', a: { r: 0, c: 1 }, b: { r: 1, c: 1 } });
    expect(out.result).toEqual({ kind: 'rejected', reason: 'no-match' });
  });

  it('conflictregel: een steen die wisselt, maakt zijn wissel af voordat de zwaartekracht hem verplaatst', () => {
    const s = boardFromText(['01', '.2', '12'], { options: UNLOCKED });
    const swapping = s.cells[0].piece;
    if (!swapping) throw new Error();
    swapping.m.state = 'wisselend';
    swapping.m.timer = 3;
    swapping.m.dur = 3;
    s.settled = false;
    const after2 = ticks(s, 2).state;
    expect(after2.cells[0].piece?.id).toBe(swapping.id);
    expect(after2.cells[2].piece).toBeNull();
    const after4 = ticks(after2, 2).state;
    expect(after4.cells[2].piece?.id).toBe(swapping.id);
  });

  it('conflictregel: matches worden aan het eind van een tick gezocht, alleen onder stabiele stenen', () => {
    // Kolom: 0 valt in het gat en maakt dan 0 0 0.
    const s = boardFromText(['0', '.', '0', '0', '1'], { options: UNLOCKED, kinds: 5 });
    s.settled = false;
    const { events } = ticks(s, 60);
    const landed = events.find((e) => e.type === 'Landed' && e.at.r === 1);
    const matched = events.find((e) => e.type === 'Matched');
    expect(landed).toBeTruthy();
    expect(matched).toBeTruthy();
    expect(matched?.tick).toBe(landed?.tick);
  });

  it('conflictregel: meerdere matches in dezelfde tick in volgorde van reeks-id, dan rij, dan kolom', () => {
    const s = boardFromText(['000', '123', '111'], { options: UNLOCKED });
    s.resolutions = [
      { id: 1, kind: 'zet', depth: 0 },
      { id: 2, kind: 'zet', depth: 0 },
    ];
    s.nextRes = 3;
    for (let c = 0; c < 3; c++) {
      const top = s.cells[c].piece;
      const bottom = s.cells[6 + c].piece;
      if (top) top.m.res = 2;
      if (bottom) bottom.m.res = 1;
    }
    s.settled = false;
    const { events } = step(s);
    const matched = events.filter((e) => e.type === 'Matched');
    expect(matched.map((e) => (e.type === 'Matched' ? [e.res, e.cells[0].r] : []))).toEqual([
      [1, 2],
      [2, 0],
    ]);
  });

  it('conflictregel: een match hoort bij de reeks van de steen die hem als laatste compleet maakte', () => {
    const s = boardFromText(['000', '123'], { options: UNLOCKED });
    s.resolutions = [
      { id: 1, kind: 'zet', depth: 0 },
      { id: 2, kind: 'zet', depth: 0 },
    ];
    const pieces = [0, 1, 2].map((c) => s.cells[c].piece);
    pieces.forEach((p, k) => {
      if (p) {
        p.m.res = k === 1 ? 2 : 1;
        p.m.movedAt = k === 1 ? 10 : 5;
      }
    });
    s.settled = false;
    const matched = step(s).events.find((e) => e.type === 'Matched');
    expect(matched).toMatchObject({ res: 2, depth: 1 });
  });

  it('conflictregel: stenen die door een explosie verdwijnen, tellen voor de reeks die de explosie veroorzaakte', () => {
    const s = boardFromText(SPLIT, { options: UNLOCKED });
    const bomb = s.cells[25].piece;
    if (bomb?.kind === 'tile') bomb.special = 'bom';
    const out = runUntilSettled(applyAction(s, MOVE_A).state);
    const explosion = out.events.find((e) => e.type === 'Explosion');
    expect(explosion?.type === 'Explosion' && explosion.res).toBe(1);
    const cleared = out.events.filter((e) => e.type === 'Cleared').length;
    expect(cleared).toBeGreaterThan(3);
  });

  it('de tijd pauzeert niet tijdens de afhandeling bij Unlocked, ook niet met de optie aan', () => {
    const s = boardFromText(SPLIT, { mode: 'tijd', options: { ...UNLOCKED, pauseTimeDuringResolution: true } });
    s.ticksLeft = 1000;
    const out = ticks(applyAction(s, MOVE_A).state, 10).state;
    expect(out.ticksLeft).toBe(990);
  });

  it('dezelfde acties op dezelfde ticks geven exact dezelfde eindstate', () => {
    const play = () => {
      let s = applyAction(boardFromText(SPLIT, { options: UNLOCKED, seed: 'replay' }), MOVE_A).state;
      s = ticks(s, 3).state;
      s = applyAction(s, MOVE_B).state;
      return runUntilSettled(s).state;
    };
    expect(play()).toEqual(play());
  });
});
