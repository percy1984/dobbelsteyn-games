import { applyAction } from './apply-action';
import { HAMMER } from './config';
import { runUntilSettled, step } from './step';
import { boardFromText, UNLOCKED } from './test-helpers';
import type { GameAction, GameEvent, GameState, Pos, Special } from './types';

const SPLIT = ['123x41', '234x02', '342x13', '410x23', '001x32'];
const MOVE_A: GameAction = { type: 'swap', a: { r: 3, c: 2 }, b: { r: 4, c: 2 } };

function accept(s: GameState, action: GameAction): GameState {
  const out = applyAction(s, action);
  expect(out.result.kind).toBe('accepted');
  return out.state;
}

/** Stapt tot er een event van dit type is; geeft de state en events van die tick. */
function until(s: GameState, type: GameEvent['type']): { state: GameState; events: GameEvent[] } {
  let current = s;
  for (let i = 0; i < 500; i++) {
    const next = step(current);
    current = next.state;
    if (next.events.some((e) => e.type === type)) {
      return next;
    }
  }
  throw new Error(`geen ${type}`);
}

function setSpecial(s: GameState, at: Pos, special: Special): void {
  const piece = s.cells[at.r * s.cols + at.c].piece;
  if (piece?.kind !== 'tile') throw new Error('geen steen');
  piece.special = special;
}

describe('speciale stenen maken', () => {
  it('4 op een rij geeft een bom op de gewisselde steen', () => {
    const s = boardFromText(['1234x1', '2341x2', '3412x3', '4103x4', '0020x1']);
    const { state, events } = until(accept(s, MOVE_A), 'Matched');
    expect(events).toContainEqual({ type: 'SpecialCreated', at: { r: 4, c: 2 }, special: 'bom' });
    const piece = state.cells[4 * 6 + 2].piece;
    expect(piece?.kind === 'tile' && piece.special).toBe('bom');
    expect(piece?.m.state).toBe('stabiel');
  });

  it('een L-vorm geeft een kruis', () => {
    const s = boardFromText(['1234', '0341', '0312', '1003', '0234']);
    const { events } = until(accept(s, { type: 'swap', a: { r: 3, c: 0 }, b: { r: 4, c: 0 } }), 'Matched');
    expect(events).toContainEqual({ type: 'SpecialCreated', at: { r: 3, c: 0 }, special: 'kruis' });
  });

  it('5 op een rij geeft een kleurenster', () => {
    const s = boardFromText(['12034', '00100', '23412']);
    const { events } = until(accept(s, { type: 'swap', a: { r: 0, c: 2 }, b: { r: 1, c: 2 } }), 'Matched');
    expect(events).toContainEqual({ type: 'SpecialCreated', at: { r: 1, c: 2 }, special: 'ster' });
  });

  it('3 op een rij geeft geen speciale steen', () => {
    const { events } = until(accept(boardFromText(SPLIT), MOVE_A), 'Matched');
    expect(events.some((e) => e.type === 'SpecialCreated')).toBe(false);
  });
});

describe('speciale stenen laten afgaan', () => {
  it('een bom in een match ontploft in een vlak van 3x3, voor dezelfde afhandelingsreeks', () => {
    const s = boardFromText(SPLIT);
    setSpecial(s, { r: 4, c: 1 }, 'bom');
    const { events } = until(accept(s, MOVE_A), 'Matched');
    const explosion = events.find((e) => e.type === 'Explosion');
    expect(events).toContainEqual({ type: 'SpecialTriggered', at: { r: 4, c: 1 }, special: 'bom' });
    expect(explosion?.type === 'Explosion' && explosion.cells).toContainEqual({ r: 3, c: 0 });
    expect(explosion?.type === 'Explosion' && explosion.res).toBe(1);
  });

  it('een kruis ruimt de hele rij en kolom op', () => {
    const s = boardFromText(SPLIT);
    setSpecial(s, { r: 4, c: 1 }, 'kruis');
    const { events } = until(accept(s, MOVE_A), 'Matched');
    const explosion = events.find((e) => e.type === 'Explosion');
    const cells = explosion?.type === 'Explosion' ? explosion.cells : [];
    expect(cells).toContainEqual({ r: 0, c: 1 });
    expect(cells).toContainEqual({ r: 4, c: 5 });
    expect(cells).not.toContainEqual({ r: 4, c: 3 });
  });

  it('kleurenster met een gewone steen: alle stenen van die soort verdwijnen, zonder match', () => {
    const s = boardFromText(SPLIT);
    setSpecial(s, { r: 0, c: 0 }, 'ster');
    const { state } = until(accept(s, { type: 'swap', a: { r: 0, c: 0 }, b: { r: 0, c: 1 } }), 'SpecialTriggered');
    const twos = state.cells.filter((c) => c.piece?.kind === 'tile' && c.piece.type === 2);
    expect(twos.length).toBeGreaterThan(3);
    expect(twos.every((c) => c.piece?.m.state === 'gemarkeerd')).toBe(true);
  });

  it('ster plus ster ruimt het hele bord', () => {
    const s = boardFromText(SPLIT);
    setSpecial(s, { r: 0, c: 0 }, 'ster');
    setSpecial(s, { r: 0, c: 1 }, 'ster');
    const { events } = until(accept(s, { type: 'swap', a: { r: 0, c: 0 }, b: { r: 0, c: 1 } }), 'SpecialTriggered');
    const explosion = events.find((e) => e.type === 'Explosion');
    expect(explosion?.type === 'Explosion' && explosion.cells.length).toBe(25);
  });

  it('bom plus bom wordt 5x5', () => {
    const s = boardFromText(['1234x1', '2341x2', '3412x3', '4123x4', '1234x1']);
    setSpecial(s, { r: 2, c: 1 }, 'bom');
    setSpecial(s, { r: 2, c: 2 }, 'bom');
    const { events } = until(accept(s, { type: 'swap', a: { r: 2, c: 1 }, b: { r: 2, c: 2 } }), 'SpecialTriggered');
    const big = events.filter((e) => e.type === 'Explosion').find((e) => e.type === 'Explosion' && e.cells.length > 9);
    const cells = big?.type === 'Explosion' ? big.cells : [];
    expect(cells).toContainEqual({ r: 0, c: 0 });
    expect(cells).toContainEqual({ r: 4, c: 0 });
    expect(cells).toContainEqual({ r: 0, c: 3 });
    expect(cells).not.toContainEqual({ r: 0, c: 5 });
  });

  it('kruis plus bom ruimt drie rijen en drie kolommen', () => {
    const s = boardFromText(['1234x1', '2341x2', '3412x3', '4123x4', '1234x1']);
    setSpecial(s, { r: 2, c: 1 }, 'kruis');
    setSpecial(s, { r: 2, c: 2 }, 'bom');
    const { events } = until(accept(s, { type: 'swap', a: { r: 2, c: 1 }, b: { r: 2, c: 2 } }), 'SpecialTriggered');
    const cells = events.flatMap((e) => (e.type === 'Explosion' ? e.cells : []));
    expect(cells).toContainEqual({ r: 1, c: 5 });
    expect(cells).toContainEqual({ r: 4, c: 3 - 2 });
    expect(cells).toContainEqual({ r: 0, c: 3 });
  });
});

describe('hamer', () => {
  const charged = (levels: number, rows = SPLIT) => {
    const s = boardFromText(rows, { options: UNLOCKED });
    s.hammer = HAMMER.perLevel * levels;
    return s;
  };

  it('vult bij elke match', () => {
    const out = until(accept(boardFromText(SPLIT), MOVE_A), 'Matched').state;
    expect(out.hammer).toBe(3 * HAMMER.perTile);
  });

  it('is pas beschikbaar bij een volle meter', () => {
    const s = boardFromText(SPLIT);
    s.hammer = HAMMER.perLevel - 1;
    expect(applyAction(s, { type: 'hammer', level: 1, at: { r: 0, c: 0 } }).result).toEqual({
      kind: 'rejected',
      reason: 'not-available',
    });
  });

  it('niveau 1 werkt als een explosie op één vakje, kost geen beurt en heeft geen beurteinde', () => {
    const s = charged(1);
    const out = applyAction(s, { type: 'hammer', level: 1, at: { r: 2, c: 2 } });
    expect(out.result.kind).toBe('accepted');
    expect(out.state.movesLeft).toBe(s.movesLeft);
    expect(out.state.hammer).toBe(0);
    expect(out.events).toContainEqual({ type: 'Explosion', cells: [{ r: 2, c: 2 }], res: 1 });
    const after = runUntilSettled(out.state);
    expect(after.events.some((e) => e.type === 'TurnEndStarted')).toBe(false);
  });

  it('niveau 2 haalt een rotsblok met drie lagen en een dubbele bodem in één keer weg', () => {
    const s = charged(2, ['123x41', '2#4x02', '342x13', '410x23', '001x32']);
    const rock = s.cells[7].piece;
    if (rock?.kind === 'block') rock.layers = 3;
    s.cells[7].floor = 2;
    const out = applyAction(s, { type: 'hammer', level: 2, at: { r: 1, c: 1 } });
    expect(out.result.kind).toBe('accepted');
    expect(out.state.cells[7].piece).toBeNull();
    expect(out.state.cells[7].floor).toBe(0);
  });

  it('niveau 2 haalt ook een steen met ketting weg', () => {
    const s = charged(2, ['123x41', '2C4x02', '342x13', '410x23', '001x32']);
    const out = applyAction(s, { type: 'hammer', level: 2, at: { r: 1, c: 1 } });
    expect(out.state.cells[7].piece?.m.state).toBe('gemarkeerd');
  });

  it('niveau 3 laat alle stenen van een soort verdwijnen', () => {
    const s = charged(3);
    const out = applyAction(s, { type: 'hammer', level: 3, at: { r: 0, c: 0 } });
    const ones = out.state.cells.filter((c) => c.piece?.kind === 'tile' && c.piece.type === 1);
    expect(ones.length).toBeGreaterThan(2);
    expect(ones.every((c) => c.piece?.m.state === 'gemarkeerd')).toBe(true);
  });

  it('Locked: niet tijdens een afhandeling', () => {
    const s = boardFromText(SPLIT);
    const busy = accept(s, MOVE_A);
    busy.hammer = HAMMER.perLevel;
    expect(applyAction(busy, { type: 'hammer', level: 1, at: { r: 0, c: 0 } }).result).toEqual({
      kind: 'rejected',
      reason: 'input-locked',
    });
  });

  it('Unlocked: niveau 1 mag tijdens een afhandeling, niveau 3 pas bij een rustmoment', () => {
    const busy = accept(charged(3), MOVE_A);
    expect(applyAction(busy, { type: 'hammer', level: 3, at: { r: 0, c: 4 } }).result).toEqual({
      kind: 'rejected',
      reason: 'input-locked',
    });
    expect(applyAction(busy, { type: 'hammer', level: 1, at: { r: 0, c: 4 } }).result.kind).toBe('accepted');
    expect(applyAction(busy, { type: 'hammer', level: 1, at: { r: 4, c: 2 } }).result).toEqual({
      kind: 'rejected',
      reason: 'tile-not-stable',
    });
  });
});
