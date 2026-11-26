import { findHint, findMatchGroups, findMoves, isValidSwap } from './matcher';
import { boardFromText } from './test-helpers';
import { WALL_RIGHT } from './types';

describe('matcher', () => {
  it('vindt een rij en een kolom van drie', () => {
    const s = boardFromText([
      '00012',
      '12341',
      '23411',
      '34121',
    ]);
    const groups = findMatchGroups(s);
    expect(groups.length).toBe(2);
    expect(groups[0].cells).toEqual([{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }]);
    expect(groups[0].longest).toBe(3);
    expect(groups[1].cells.map((p) => p.r)).toEqual([1, 2, 3]);
  });

  it('voegt een L-vorm samen tot één match', () => {
    const s = boardFromText([
      '0123',
      '0234',
      '0001',
    ]);
    const groups = findMatchGroups(s);
    expect(groups.length).toBe(1);
    expect(groups[0].cells.length).toBe(5);
    expect(groups[0].crossed).toBe(true);
  });

  it('herkent vier en vijf op een rij', () => {
    const four = findMatchGroups(boardFromText(['00001']));
    expect(four[0].longest).toBe(4);
    const five = findMatchGroups(boardFromText(['00000']));
    expect(five[0].longest).toBe(5);
  });

  it('zoekt alleen onder stabiele stenen', () => {
    const s = boardFromText(['0001']);
    const piece = s.cells[1].piece;
    if (piece) piece.m.state = 'vallend';
    expect(findMatchGroups(s)).toEqual([]);
  });

  it('telt een match over een muur heen wel mee', () => {
    const s = boardFromText(['0001']);
    s.cells[0].walls = WALL_RIGHT;
    expect(findMatchGroups(s).length).toBe(1);
  });

  it('kent een wissel alleen goed als er direct een match ontstaat', () => {
    const s = boardFromText([
      '0120',
      '1201',
    ]);
    expect(isValidSwap(s, { r: 0, c: 2 }, { r: 0, c: 3 })).toBe(false);
    const t = boardFromText([
      '0010',
      '1201',
    ]);
    expect(isValidSwap(t, { r: 0, c: 2 }, { r: 0, c: 3 })).toBe(true);
  });

  it('staat geen wissel over een muur toe', () => {
    const s = boardFromText(['0010']);
    s.cells[2].walls = WALL_RIGHT;
    expect(isValidSwap(s, { r: 0, c: 2 }, { r: 0, c: 3 })).toBe(false);
  });

  it('wisselt geen stenen met ketting of blokkades', () => {
    const s = boardFromText(['00A0', '1#11']);
    expect(isValidSwap(s, { r: 0, c: 2 }, { r: 0, c: 3 })).toBe(false);
    expect(isValidSwap(s, { r: 1, c: 1 }, { r: 1, c: 0 })).toBe(false);
  });

  it('vindt zetten in vaste volgorde en geeft de eerste als hint', () => {
    const s = boardFromText([
      '0102',
      '1213',
      '2021',
    ]);
    const moves = findMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(findHint(s)).toEqual(moves[0]);
    expect(findMoves(s)).toEqual(moves);
  });
});
